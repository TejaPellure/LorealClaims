// Structured evidence retrieval: plain PostgreSQL filtering + metadata matching (no vector search in the MVP).
import { EvidenceRole, PrismaClient } from '@prisma/client';
import { computeFactors } from './scoring';
import { ClaimInput, EvidenceCandidate, EvidenceRelation, FormulationInput } from './types';

/** Cap on records sent to the model; the most relevant ones win. */
export const MAX_EVIDENCE_IN_PACKAGE = 12;

/**
 * Finds evidence that could bear on the claim:
 *  1. studies linked to any ingredient in the formulation,
 *  2. finished-product studies linked directly to this formulation version,
 * restricted to records that are not UNVERIFIED, then classified and scored against the claim.
 * Evidence on other endpoints is kept only when it is a finished-product study of THIS version (as context).
 */
export async function retrieveEvidence(
  prisma: PrismaClient,
  claim: ClaimInput,
  formulation: FormulationInput,
): Promise<EvidenceCandidate[]> {
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
  const candidates: EvidenceCandidate[] = [];

  for (const record of records) {
    const linkedToThisFormulation = record.formulationLinks.some((l) => l.formulationId === formulation.id);
    const relation: EvidenceRelation =
      record.scope === 'FINISHED_PRODUCT' ? (linkedToThisFormulation ? 'FINISHED_EXACT' : 'FINISHED_OTHER') : 'INGREDIENT';
    const categoryMatch = record.benefitCategories.includes(claim.benefitCategory as never);
    if (!categoryMatch && relation !== 'FINISHED_EXACT') continue; // irrelevant to this claim

    // Concentration of the study's ingredient in THIS formulation (highest if several are linked).
    const linkedPercentages = record.ingredientLinks
      .map((l) => formulatedByIngredient.get(l.ingredientId))
      .filter((p): p is number => p !== undefined);
    const formulatedConcentration = linkedPercentages.length ? Math.max(...linkedPercentages) : null;

    const testedConcentration = record.testedConcentration?.toNumber() ?? null;
    const effectMagnitude = record.effectMagnitude?.toNumber() ?? null;
    const role: EvidenceRole = !categoryMatch ? 'CONTEXT' : record.effectDirection === 'POSITIVE' ? 'SUPPORTING' : 'CONTRADICTORY';

    candidates.push({
      id: record.id, title: record.title, evidenceType: record.evidenceType, scope: record.scope, relation, role, categoryMatch,
      ingredientNames: record.ingredientLinks.map((l) => l.ingredient.name),
      sourceName: record.sourceName, doi: record.doi, pmid: record.pmid, publishedAt: record.publishedAt?.toISOString().slice(0, 10) ?? null,
      studyDesign: record.studyDesign, sampleSize: record.sampleSize, population: record.population, durationWeeks: record.durationWeeks,
      testedSubject: record.testedSubject, testedConcentration, formulatedConcentration,
      endpoint: record.endpoint, resultsSummary: record.resultsSummary, effectDirection: record.effectDirection, effectMagnitude,
      limitations: record.limitations, quality: record.quality, status: record.status,
      factors: computeFactors(
        { relation, categoryMatch, quality: record.quality, testedConcentration, formulatedConcentration, durationWeeks: record.durationWeeks, population: record.population, effectMagnitude },
        claim,
      ),
    });
  }

  // Keep the most relevant evidence; contradictory records are never dropped in favour of supporting ones.
  const byFit = (a: EvidenceCandidate, b: EvidenceCandidate) => b.factors.fit - a.factors.fit;
  const contradictory = candidates.filter((c) => c.role === 'CONTRADICTORY').sort(byFit);
  const others = candidates.filter((c) => c.role !== 'CONTRADICTORY').sort(byFit);
  return [...contradictory, ...others].slice(0, MAX_EVIDENCE_IN_PACKAGE);
}
