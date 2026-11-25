// Evidence retrieval: plain PostgreSQL queries, no ranking or relevance judgement.
// Claude decides which studies matter for the claim; the backend just hands over everything that could apply.
import { PrismaClient } from '@prisma/client';
import { EvidenceCandidate, EvidenceRelation, FormulationInput } from './types';

/** Safety cap on the package size. A formula's ingredients normally have far fewer studies than this. */
export const MAX_EVIDENCE_IN_PACKAGE = 40;

const RELATION_ORDER: Record<EvidenceRelation, number> = { FINISHED_EXACT: 0, FINISHED_OTHER: 1, INGREDIENT: 2 };
const QUALITY_ORDER = { HIGH: 0, MODERATE: 1, LOW: 2, VERY_LOW: 3 } as const;

/**
 * All non-UNVERIFIED evidence linked to any ingredient in the formula, or directly to this formulation.
 * Each record is labelled with its relation to the formula (a fact from the links) and the concentration of its
 * ingredient in THIS formula. Ordering only decides what survives the cap: this formula's own studies first,
 * then better-quality studies.
 */
export async function retrieveEvidence(prisma: PrismaClient, formulation: FormulationInput): Promise<EvidenceCandidate[]> {
  const ingredientIds = formulation.ingredients.map((i) => i.ingredientId);

  const records = await prisma.evidence.findMany({
    where: {
      status: { not: 'UNVERIFIED' },
      OR: [
        { ingredientLinks: { some: { ingredientId: { in: ingredientIds } } } },
        { formulationLinks: { some: { formulationId: formulation.id } } },
      ],
    },
    include: {
      ingredientLinks: { select: { ingredientId: true, ingredient: { select: { name: true } } } },
      formulationLinks: { select: { formulationId: true } },
    },
  });

  const formulatedByIngredient = new Map(formulation.ingredients.map((i) => [i.ingredientId, i.percentage]));

  const candidates = records.map((record): EvidenceCandidate => {
    const linkedToThisFormulation = record.formulationLinks.some((l) => l.formulationId === formulation.id);
    const relation: EvidenceRelation =
      record.scope === 'FINISHED_PRODUCT' ? (linkedToThisFormulation ? 'FINISHED_EXACT' : 'FINISHED_OTHER') : 'INGREDIENT';
    const linkedPercentages = record.ingredientLinks.map((l) => formulatedByIngredient.get(l.ingredientId)).filter((p): p is number => p !== undefined);

    return {
      id: record.id, title: record.title, evidenceType: record.evidenceType, scope: record.scope, relation, benefits: record.benefits,
      ingredientNames: record.ingredientLinks.map((l) => l.ingredient.name),
      sourceName: record.sourceName, doi: record.doi, pmid: record.pmid, publishedAt: record.publishedAt?.toISOString().slice(0, 10) ?? null,
      studyDesign: record.studyDesign, sampleSize: record.sampleSize, population: record.population, durationWeeks: record.durationWeeks,
      testedSubject: record.testedSubject, testedConcentration: record.testedConcentration?.toNumber() ?? null,
      formulatedConcentration: linkedPercentages.length ? Math.max(...linkedPercentages) : null,
      endpoint: record.endpoint, resultsSummary: record.resultsSummary, effectDirection: record.effectDirection,
      effectMagnitude: record.effectMagnitude?.toNumber() ?? null, limitations: record.limitations, quality: record.quality, status: record.status,
    };
  });

  return candidates
    .sort((a, b) => RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation] || QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] || a.title.localeCompare(b.title))
    .slice(0, MAX_EVIDENCE_IN_PACKAGE);
}
