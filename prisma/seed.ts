// Idempotent seeder: loads the ingredient library, the evidence library and two starter products.
//
//  * Runs only when the database holds no ingredients and no evidence (fresh install).
//  * Never updates or deletes existing rows, and never runs `migrate reset`.
//  * Everything is written in ONE transaction. Claims and assessments are created by users, never seeded.
//  * Proof of concept: most evidence is real (PubMed-verified); the two products and their three internal studies are
//    invented so every verdict can be demonstrated. See docs/RESEARCH_AND_ASSUMPTIONS.md.
import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ReferenceData {
  ingredients: (Record<string, any> & { key: string })[];
  products: { name: string; ingredients: { ingredient: string; percentage: number }[] }[];
  evidence: (Record<string, any> & { key: string; ingredientKeys: string[]; productNames?: string[] })[];
}

type Logger = (message: string) => void;

/** Fails loudly on a broken dataset (duplicate keys, dangling references, formulas not totalling 100%) before touching the database. */
export function validateReferenceData(data: ReferenceData): void {
  const problems: string[] = [];
  const ingredientKeys = new Set(data.ingredients.map((i) => i.key));
  const productNames = new Set(data.products.map((p) => p.name));
  if (ingredientKeys.size !== data.ingredients.length) problems.push('Duplicate ingredient keys.');
  if (new Set(data.evidence.map((e) => e.key)).size !== data.evidence.length) problems.push('Duplicate evidence keys.');
  if (productNames.size !== data.products.length) problems.push('Duplicate product names.');

  for (const product of data.products) {
    const scaled = product.ingredients.reduce((sum, i) => sum + Math.round(i.percentage * 10000), 0);
    if (Math.abs(scaled - 1_000_000) > 10) problems.push(`Product "${product.name}" totals ${scaled / 10000}%, not 100%.`);
    for (const line of product.ingredients) if (!ingredientKeys.has(line.ingredient)) problems.push(`Product "${product.name}": unknown ingredient "${line.ingredient}".`);
  }
  for (const e of data.evidence) {
    for (const key of e.ingredientKeys) if (!ingredientKeys.has(key)) problems.push(`Evidence ${e.key}: unknown ingredient "${key}".`);
    for (const name of e.productNames ?? []) if (!productNames.has(name)) problems.push(`Evidence ${e.key}: unknown product "${name}".`);
  }
  if (problems.length) throw new Error(`Invalid reference dataset:\n - ${problems.join('\n - ')}`);
}

export async function isDatabaseEmpty(prisma: PrismaClient): Promise<boolean> {
  const [ingredients, evidence] = await Promise.all([prisma.ingredient.count(), prisma.evidence.count()]);
  return ingredients + evidence === 0;
}

/** Returns true when the data was inserted, false when the database already had data. */
export async function seedIfEmpty(prisma: PrismaClient, data: ReferenceData, log: Logger = console.log): Promise<boolean> {
  if (!(await isDatabaseEmpty(prisma))) {
    log('Seed skipped: database already contains data.');
    return false;
  }
  validateReferenceData(data);
  await prisma.$transaction(async (tx) => insert(tx, data), { timeout: 60_000 });
  log(`Seeded ${data.ingredients.length} ingredients, ${data.evidence.length} evidence records and ${data.products.length} products.`);
  return true;
}

async function insert(tx: Prisma.TransactionClient, data: ReferenceData) {
  const ingredientIds = new Map<string, string>();
  for (const { key, ...ingredient } of data.ingredients) {
    const created = await tx.ingredient.create({ data: { ...ingredient, sources: ingredient.sources ?? [] } as Prisma.IngredientCreateInput });
    ingredientIds.set(key, created.id);
  }

  // Products come with their one formulation; evidence about a finished product links to that exact formulation.
  const formulationIds = new Map<string, string>();
  for (const product of data.products) {
    const created = await tx.product.create({
      data: {
        name: product.name,
        formulations: { create: { ingredients: { create: product.ingredients.map((l, position) => ({ ingredientId: ingredientIds.get(l.ingredient)!, percentage: l.percentage, position })) } } },
      },
      include: { formulations: { select: { id: true } } },
    });
    formulationIds.set(product.name, created.formulations[0].id);
  }

  for (const { key: _key, ingredientKeys, productNames = [], publishedAt, ...fields } of data.evidence) {
    await tx.evidence.create({
      data: {
        ...fields,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        ingredientLinks: { create: ingredientKeys.map((k) => ({ ingredientId: ingredientIds.get(k)! })) },
        formulationLinks: { create: productNames.map((n) => ({ formulationId: formulationIds.get(n)! })) },
      } as Prisma.EvidenceCreateInput,
    });
  }
}

// ── CLI entry: `tsx prisma/seed.ts` ──
async function main() {
  const prisma = new PrismaClient();
  try {
    const data = JSON.parse(readFileSync(join(__dirname, 'seed-data', 'reference-data.json'), 'utf8')) as ReferenceData;
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
