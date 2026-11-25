// Idempotent reference-data seeder: loads the ingredient library and the real, verified evidence.
//
//  * Runs only when the database holds no ingredients and no evidence (fresh install).
//  * Never updates or deletes existing rows, and never runs `migrate reset`.
//  * Everything is written in ONE transaction. Products, claims and assessments are created by users, not seeded.
import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ReferenceData {
  ingredients: (Record<string, any> & { key: string })[];
  evidence: (Record<string, any> & { key: string; ingredientKeys: string[] })[];
}

type Logger = (message: string) => void;

/** Fails loudly on a broken dataset (duplicate keys, dangling ingredient references) before touching the database. */
export function validateReferenceData(data: ReferenceData): void {
  const problems: string[] = [];
  const ingredientKeys = new Set(data.ingredients.map((i) => i.key));
  if (ingredientKeys.size !== data.ingredients.length) problems.push('Duplicate ingredient keys.');
  if (new Set(data.evidence.map((e) => e.key)).size !== data.evidence.length) problems.push('Duplicate evidence keys.');
  for (const e of data.evidence) {
    for (const key of e.ingredientKeys) if (!ingredientKeys.has(key)) problems.push(`Evidence ${e.key}: unknown ingredient "${key}".`);
    // Real evidence must be traceable to a source.
    if (!e.doi && !e.pmid && !e.sourceUrl) problems.push(`Evidence ${e.key}: needs a DOI, PMID or source URL.`);
  }
  if (problems.length) throw new Error(`Invalid reference dataset:\n - ${problems.join('\n - ')}`);
}

export async function isDatabaseEmpty(prisma: PrismaClient): Promise<boolean> {
  const [ingredients, evidence] = await Promise.all([prisma.ingredient.count(), prisma.evidence.count()]);
  return ingredients + evidence === 0;
}

/** Returns true when the reference data was inserted, false when the database already had data. */
export async function seedIfEmpty(prisma: PrismaClient, data: ReferenceData, log: Logger = console.log): Promise<boolean> {
  if (!(await isDatabaseEmpty(prisma))) {
    log('Seed skipped: database already contains data.');
    return false;
  }
  validateReferenceData(data);
  await prisma.$transaction(async (tx) => insert(tx, data), { timeout: 60_000 });
  log(`Seeded ${data.ingredients.length} ingredients and ${data.evidence.length} evidence records.`);
  return true;
}

async function insert(tx: Prisma.TransactionClient, data: ReferenceData) {
  const ingredientIds = new Map<string, string>();
  for (const { key, ...ingredient } of data.ingredients) {
    const created = await tx.ingredient.create({ data: { ...ingredient, sources: ingredient.sources ?? [] } as Prisma.IngredientCreateInput });
    ingredientIds.set(key, created.id);
  }
  for (const { key: _key, ingredientKeys, publishedAt, ...fields } of data.evidence) {
    await tx.evidence.create({
      data: {
        ...fields,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        ingredientLinks: { create: ingredientKeys.map((k) => ({ ingredientId: ingredientIds.get(k)! })) },
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
