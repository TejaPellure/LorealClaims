// Structured evidence retrieval: plain PostgreSQL filtering + metadata matching (no vector search in the MVP).
import { EvidenceRole, PrismaClient } from '@prisma/client';
import { claimConcepts, studyMatchesClaim } from './benefit-match';
import { computeFactors } from './scoring';
import { ClaimInput, EvidenceCandidate, EvidenceRelation, FormulationInput } from './types';

/** Caps on what is sent to the model; the most relevant records win. */
export const MAX_MATCHING_EVIDENCE = 14;
const MAX_CONTEXT_EVIDENCE = 4;
/** When nothing in the claim is recognisable we show more context and let Claude judge relevance itself. */
const MAX_CONTEXT_EVIDENCE_UNRECOGNISED_CLAIM = 8;

/**
 * Finds evidence that could bear on the claim:
 *  1. studies linked to any ingredient in the formulation,
 *  2. finished-product studies linked directly to this formulation,
 * restricted to records that are not UNVERIFIED, then classified and scored against the claim.
 * Studies about the claimed benefit are SUPPORTING/CONTRADICTORY; the rest are kept as a few CONTEXT records so
 * Claude can still judge claims worded in ways the keyword matcher does not recognise.
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
    const categoryMatch = studyMatchesClaim(claim, record);

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

  // Matching evidence first (contradictory records are never dropped in favour of supporting ones),
  // then a few context records, best quality first.
  const byFit = (a: EvidenceCandidate, b: EvidenceCandidate) => b.factors.fit - a.factors.fit;
  const matching = candidates.filter((c) => c.categoryMatch);
  const contradictory = matching.filter((c) => c.role === 'CONTRADICTORY').sort(byFit);
  const supporting = matching.filter((c) => c.role !== 'CONTRADICTORY').sort(byFit);
  const contextLimit = claimConcepts(claim).size ? MAX_CONTEXT_EVIDENCE : MAX_CONTEXT_EVIDENCE_UNRECOGNISED_CLAIM;
  const context = candidates.filter((c) => !c.categoryMatch).sort((a, b) => b.factors.quality - a.factors.quality).slice(0, contextLimit);
  return [...contradictory, ...supporting].slice(0, MAX_MATCHING_EVIDENCE).concat(context);
}
