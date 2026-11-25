// Idempotent demo seeder.
//
//  * Runs only when the database holds no ingredients, evidence or products (fresh install).
//  * Never updates or deletes existing rows, and never runs `migrate reset`.
//  * Base data is written in ONE transaction; demo assessments are then produced by the real assessment
//    pipeline with the deterministic MOCK provider, so seeded reports are labelled MOCK.
import { ClaimStatus, Prisma, PrismaClient, ReviewDecision } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../apps/api/src/common/config';
import { checkComposition } from '../apps/api/src/modules/formulations/composition';
import { AssessmentPipeline } from '../apps/api/src/modules/assessments/engine/assessment-pipeline';
import { MockProvider } from '../apps/api/src/modules/assessments/engine/providers/providers';

// ── Dataset shape (prisma/seed-data/demo-data.json) ──
interface DemoData {
  ingredients: (Record<string, any> & { key: string })[];
  evidence: (Record<string, any> & { key: string; ingredientKeys: string[]; formulationRefs: { product: string; version: number }[] })[];
  products: { name: string; category: string; description: string; createdBy: string; formulations: { version: number; status: any; basis: any; basisNote: string; notes: string; ingredients: { ingredient: string; percentage: number }[] }[] }[];
  claims: (Record<string, any> & { key: string; product: string; formulationVersion: number | null; assess: boolean; review: { decision: ReviewDecision; by: string; comments: string } | null })[];
}

type Logger = (message: string) => void;

/** Fails loudly on a broken dataset (bad references, formulas not totalling 100%) before touching the database. */
export function validateDemoData(data: DemoData): void {
  const problems: string[] = [];
  const ingredientKeys = new Set(data.ingredients.map((i) => i.key));
  const evidenceKeys = new Set(data.evidence.map((e) => e.key));
  if (ingredientKeys.size !== data.ingredients.length) problems.push('Duplicate ingredient keys.');
  if (evidenceKeys.size !== data.evidence.length) problems.push('Duplicate evidence keys.');

  const versions = new Set<string>();
  for (const product of data.products) {
    for (const f of product.formulations) {
      versions.add(`${product.name}#${f.version}`);
      for (const line of f.ingredients) if (!ingredientKeys.has(line.ingredient)) problems.push(`${product.name} v${f.version}: unknown ingredient "${line.ingredient}".`);
      const check = checkComposition(f.ingredients.map((l) => ({ ingredientId: l.ingredient, percentage: l.percentage })));
      if (check.errors.length) problems.push(`${product.name} v${f.version}: ${check.errors.join(' ')}`);
    }
  }
  for (const e of data.evidence) {
    for (const key of e.ingredientKeys) if (!ingredientKeys.has(key)) problems.push(`Evidence ${e.key}: unknown ingredient "${key}".`);
    for (const ref of e.formulationRefs) if (!versions.has(`${ref.product}#${ref.version}`)) problems.push(`Evidence ${e.key}: unknown formulation ${ref.product} v${ref.version}.`);
  }
  for (const c of data.claims) {
    if (c.formulationVersion !== null && !versions.has(`${c.product}#${c.formulationVersion}`)) problems.push(`Claim ${c.key}: unknown formulation.`);
  }
  if (problems.length) throw new Error(`Invalid demo dataset:\n - ${problems.join('\n - ')}`);
}

export async function isDatabaseEmpty(prisma: PrismaClient): Promise<boolean> {
  const [ingredients, evidence, products] = await Promise.all([prisma.ingredient.count(), prisma.evidence.count(), prisma.product.count()]);
  return ingredients + evidence + products === 0;
}

/** Returns true when the demo data was inserted, false when the database already had data. */
export async function seedIfEmpty(prisma: PrismaClient, data: DemoData, log: Logger = console.log): Promise<boolean> {
  if (!(await isDatabaseEmpty(prisma))) {
    log('Seed skipped: database already contains data.');
    await seedAssessmentsIfMissing(prisma, data, log); // recovers an interrupted first run, never touches user data
    return false;
  }
  validateDemoData(data);
  await prisma.$transaction(async (tx) => insertBaseData(tx, data), { timeout: 60_000 });
  log(`Seeded ${data.ingredients.length} ingredients, ${data.evidence.length} evidence records, ${data.products.length} products, ${data.claims.length} claims.`);
  await seedAssessmentsIfMissing(prisma, data, log);
  return true;
}

async function insertBaseData(tx: Prisma.TransactionClient, data: DemoData) {
  const ingredientIds = new Map<string, string>();
  for (const { key, ...ingredient } of data.ingredients) {
    const created = await tx.ingredient.create({ data: { ...ingredient, sources: ingredient.sources ?? [] } as Prisma.IngredientCreateInput });
    ingredientIds.set(key, created.id);
  }

  const formulationIds = new Map<string, string>();
  const productIds = new Map<string, string>();
  for (const product of data.products) {
    const { formulations, ...fields } = product;
    const createdProduct = await tx.product.create({ data: fields });
    productIds.set(product.name, createdProduct.id);
    for (const f of formulations) {
      const createdFormulation = await tx.formulation.create({
        data: {
          productId: createdProduct.id, version: f.version, status: f.status, basis: f.basis, basisNote: f.basisNote, notes: f.notes, createdBy: product.createdBy,
          ingredients: { create: f.ingredients.map((l, position) => ({ ingredientId: ingredientIds.get(l.ingredient)!, percentage: l.percentage, position })) },
        },
      });
      formulationIds.set(`${product.name}#${f.version}`, createdFormulation.id);
    }
  }

  for (const { key: _key, ingredientKeys, formulationRefs, publishedAt, ...fields } of data.evidence) {
    await tx.evidence.create({
      data: {
        ...fields,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        ingredientLinks: { create: ingredientKeys.map((k) => ({ ingredientId: ingredientIds.get(k)! })) },
        formulationLinks: { create: formulationRefs.map((r) => ({ formulationId: formulationIds.get(`${r.product}#${r.version}`)! })) },
      } as Prisma.EvidenceCreateInput,
    });
  }

  for (const c of data.claims) {
    const { key: _key, product, formulationVersion, assess, review: _review, status, ...fields } = c;
    await tx.claim.create({
      data: {
        ...fields,
        productId: productIds.get(product)!,
        formulationId: formulationVersion === null ? null : formulationIds.get(`${product}#${formulationVersion}`)!,
        // Claims to be assessed start as READY_FOR_ASSESSMENT; the pipeline then moves them to ASSESSED.
        status: (assess ? 'READY_FOR_ASSESSMENT' : status) as ClaimStatus,
      },
    });
  }
}

/** Creates the demo assessments (and evaluator reviews) once, only for demo claims that have none yet. */
async function seedAssessmentsIfMissing(prisma: PrismaClient, data: DemoData, log: Logger) {
  if ((await prisma.assessment.count()) > 0) return;
  const { assessment } = loadConfig();
  // The seed always uses the mock provider: deterministic, offline, and honestly labelled.
  const pipeline = new AssessmentPipeline(prisma, new MockProvider(assessment.supportedMinScore), assessment);
  const claimStatusFor = { APPROVED: 'APPROVED_BY_EVALUATOR', REJECTED: 'REJECTED', MORE_EVIDENCE_REQUESTED: 'REQUIRES_MORE_EVIDENCE', PENDING: 'ASSESSED' } as const;

  for (const demo of data.claims.filter((c) => c.assess)) {
    const claim = await prisma.claim.findFirst({ where: { title: demo.title, product: { name: demo.product } } });
    if (!claim) continue;
    const { id } = await pipeline.run(claim.id, {}, 'EVALUATOR');
    if (demo.review) {
      await prisma.$transaction([
        prisma.assessment.update({ where: { id }, data: { reviewDecision: demo.review.decision, reviewComments: demo.review.comments, reviewedBy: demo.review.by, reviewedAt: new Date() } }),
        prisma.claim.update({ where: { id: claim.id }, data: { status: claimStatusFor[demo.review.decision] } }),
      ]);
    }
  }
  log('Seeded demo assessments (provider: MOCK).');
}

// ── CLI entry: `tsx prisma/seed.ts` ──
async function main() {
  const prisma = new PrismaClient();
  try {
    const data = JSON.parse(readFileSync(join(__dirname, 'seed-data', 'demo-data.json'), 'utf8')) as DemoData;
    await seedIfEmpty(prisma, data);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
