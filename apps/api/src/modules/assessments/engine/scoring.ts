// Deterministic Evidence Sufficiency Score.
//
// PROTOTYPE RUBRIC (version below) - needs scientific validation before any real use.
// The score measures how well the AVAILABLE evidence lines up with the claim. It is NOT a probability
// that the claim is true, and it is computed here by the backend, never taken from the LLM.
import { QualityRating } from '@prisma/client';
import { ScoringWeights } from '../../../common/config';
import { ClaimInput, CriterionScore, EvidenceCandidate, EvidenceRelation, MatchFactors, ScoreResult } from './types';

export const RUBRIC_VERSION = 'prototype-rubric-v1';

export const QUALITY_WEIGHT: Record<QualityRating, number> = { HIGH: 1, MODERATE: 0.7, LOW: 0.4, VERY_LOW: 0.2 };

/** Directness of evidence: a study of the exact finished product beats an ingredient study. */
export const SCOPE_WEIGHT: Record<EvidenceRelation, number> = { FINISHED_EXACT: 1, FINISHED_OTHER: 0.6, INGREDIENT: 0.4 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Unknown values are scored conservatively rather than optimistically. */
const UNKNOWN_CONCENTRATION = 0.5;
const UNKNOWN_DURATION = 0.3;
const UNKNOWN_MAGNITUDE = 0.7;
/** The claim itself leaves a field blank (timeframe, population): neutral credit. */
const UNKNOWN_CLAIM_FIELD = 0.5;

/**
 * Formulated vs tested concentration.
 * Lower than tested -> proportional penalty. Up to 2x higher -> full credit. Far higher -> small penalty
 * (the tested effect and safety profile no longer directly apply).
 */
export function concentrationFactor(relation: EvidenceRelation, tested: number | null, formulated: number | null): number {
  if (tested == null || tested <= 0) return relation === 'FINISHED_EXACT' ? 1 : UNKNOWN_CONCENTRATION;
  if (formulated == null) return UNKNOWN_CONCENTRATION;
  const ratio = formulated / tested;
  if (ratio >= 1) return ratio <= 2 ? 1 : 0.8;
  return clamp01(ratio);
}

/**
 * Study duration vs claimed duration.
 * Shorter study: proportional. Within +25% : full credit.
 * Much longer study: 0.6, because a benefit shown at 12 weeks does not show it already exists at 4 weeks.
 */
export function durationFactor(evidenceWeeks: number | null, claimWeeks: number | null): number {
  if (claimWeeks == null) return UNKNOWN_CLAIM_FIELD; // the claim names no timeframe: cannot match or mismatch it
  if (evidenceWeeks == null) return UNKNOWN_DURATION;
  const ratio = evidenceWeeks / claimWeeks;
  if (ratio < 1) return clamp01(ratio);
  return ratio <= 1.25 ? 1 : 0.6;
}

/** Endpoint family match, scaled by reported effect size when both sides are percentages. */
export function endpointFactor(categoryMatch: boolean, claim: Pick<ClaimInput, 'targetValue' | 'measurementUnit'>, magnitude: number | null) {
  if (!categoryMatch) return { value: 0, shortfall: false };
  const comparable = claim.measurementUnit.includes('%') && claim.targetValue != null && claim.targetValue > 0;
  if (magnitude == null || !comparable) return { value: UNKNOWN_MAGNITUDE, shortfall: false };
  const ratio = magnitude! / claim.targetValue!;
  return { value: clamp01(ratio), shortfall: ratio < 1 };
}

const STOP_WORDS = new Set(['with', 'and', 'the', 'of', 'aged', 'adults', 'subjects', 'people', 'skin', 'signs', 'clinical']);
const SYNONYMS: Record<string, string> = { female: 'women', females: 'women', woman: 'women', womens: 'women', male: 'men', males: 'men', man: 'men' };

const tokens = (text: string) =>
  new Set(
    text.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t))
      .map((t) => SYNONYMS[t] ?? t.replace(/s$/, '')),
  );

/** Share of the claim's target-population keywords that also appear in the study population. */
export function populationFactor(claimPopulation: string | null, studyPopulation: string): number {
  if (!claimPopulation?.trim()) return UNKNOWN_CLAIM_FIELD;
  const claimTokens = tokens(claimPopulation);
  if (claimTokens.size === 0) return UNKNOWN_CONCENTRATION;
  const studyTokens = tokens(studyPopulation);
  const overlap = [...claimTokens].filter((t) => studyTokens.has(t)).length;
  // Floor of 0.2: some overlap in "adults/skin" generalities still counts a little.
  return Math.max(0.2, overlap / claimTokens.size);
}

export interface FactorInputs {
  relation: EvidenceRelation;
  categoryMatch: boolean;
  quality: QualityRating;
  testedConcentration: number | null;
  formulatedConcentration: number | null;
  durationWeeks: number | null;
  population: string;
  effectMagnitude: number | null;
}

export function computeFactors(input: FactorInputs, claim: ClaimInput): MatchFactors {
  const endpoint = endpointFactor(input.categoryMatch, claim, input.effectMagnitude);
  const concentration = concentrationFactor(input.relation, input.testedConcentration, input.formulatedConcentration);
  const duration = durationFactor(input.durationWeeks, claim.durationWeeks);
  const population = populationFactor(claim.targetPopulation, input.population);
  const quality = QUALITY_WEIGHT[input.quality];
  const scope = SCOPE_WEIGHT[input.relation];
  // "fit" is only used to choose the single best (anchor) study; weights are heuristic.
  const fit = scope * (0.4 * endpoint.value + 0.25 * concentration + 0.2 * duration + 0.15 * population) * quality;
  return { endpoint: endpoint.value, concentration, duration, population, quality, scope, fit, magnitudeShortfall: endpoint.shortfall };
}

const SCORE_DISCLAIMER =
  'Prototype scoring rubric requiring scientific validation. It measures how well available evidence matches the claim; it is not a probability that the claim is true.';

/**
 * Score = sum(weight_i * value_i). Most criteria use the "anchor" study (best supporting match for the claim's
 * endpoint); finished-product testing and consistency look across all relevant evidence.
 */
export function computeScore(candidates: EvidenceCandidate[], weights: ScoringWeights): ScoreResult {
  const relevant = candidates.filter((c) => c.categoryMatch);
  const supporting = relevant.filter((c) => c.effectDirection === 'POSITIVE');
  const contradicting = relevant.filter((c) => c.effectDirection !== 'POSITIVE');
  const anchor = [...supporting].sort((a, b) => b.factors.fit - a.factors.fit)[0] ?? null;

  const supportWeight = supporting.reduce((sum, c) => sum + c.factors.quality, 0);
  const contradictWeight = contradicting.reduce((sum, c) => sum + c.factors.quality, 0);
  const consistency = supportWeight + contradictWeight === 0 ? 0 : supportWeight / (supportWeight + contradictWeight);

  const bestFinished = supporting.reduce((best, c) => {
    const value = c.relation === 'FINISHED_EXACT' ? c.factors.quality : c.relation === 'FINISHED_OTHER' ? 0.4 * c.factors.quality : 0;
    return Math.max(best, value);
  }, 0);

  const none = 'No supporting evidence for this claim endpoint.';
  const criteria: [keyof ScoringWeights, string, number, string][] = [
    ['methodologicalQuality', 'Methodological quality', anchor?.factors.quality ?? 0, anchor ? `Best-matching study rated ${anchor.quality}.` : none],
    ['directRelevance', 'Direct relevance', anchor?.factors.scope ?? 0, anchor ? `Best-matching evidence is ${labelRelation(anchor.relation)}.` : none],
    ['concentrationSimilarity', 'Concentration similarity', anchor?.factors.concentration ?? 0, anchor ? describeConcentration(anchor) : none],
    ['endpointMatch', 'Endpoint and magnitude match', anchor?.factors.endpoint ?? 0, anchor ? describeEndpoint(anchor) : none],
    ['durationMatch', 'Study duration match', anchor?.factors.duration ?? 0, anchor ? `Study duration: ${anchor.durationWeeks ?? 'not reported'} weeks (compared with the claimed timeframe).` : none],
    ['populationSimilarity', 'Population similarity', anchor?.factors.population ?? 0, anchor ? `Study population: ${anchor.population}.` : none],
    ['finishedProductTesting', 'Finished-product testing', bestFinished, bestFinished > 0 ? 'Supporting finished-product evidence exists (exact version counts fully).' : 'No supporting finished-product study found.'],
    ['consistency', 'Consistency of results', consistency, `${supporting.length} supporting vs ${contradicting.length} neutral/contradictory relevant record(s), weighted by quality.`],
  ];

  const breakdown: CriterionScore[] = criteria.map(([key, label, value, explanation]) => ({
    key, label, weight: weights[key], value: round(value, 3), points: round(weights[key] * value, 1), explanation,
  }));
  const total = Math.round(breakdown.reduce((sum, c) => sum + c.points, 0));

  return { total: Math.max(0, Math.min(100, total)), rubricVersion: RUBRIC_VERSION, anchorEvidenceId: anchor?.id ?? null, breakdown, disclaimer: SCORE_DISCLAIMER };
}

const round = (n: number, digits: number) => Number(n.toFixed(digits));

export const labelRelation = (relation: EvidenceRelation) =>
  ({ FINISHED_EXACT: 'a finished-product study of this exact formulation version', FINISHED_OTHER: 'a finished-product study of a different formulation', INGREDIENT: 'ingredient-level evidence only' })[relation];

function describeConcentration(c: EvidenceCandidate) {
  if (c.testedConcentration == null) return 'Tested concentration not reported.';
  return `Tested ${c.testedConcentration}% vs formulated ${c.formulatedConcentration ?? 'unknown'}%.`;
}

function describeEndpoint(c: EvidenceCandidate) {
  if (c.factors.magnitudeShortfall) return `Reported effect (${c.effectMagnitude}%) is smaller than the claimed target.`;
  return c.effectMagnitude == null ? 'Endpoint family matches; effect size not reported, so scored conservatively.' : `Reported effect ${c.effectMagnitude}% meets the claimed target.`;
}
