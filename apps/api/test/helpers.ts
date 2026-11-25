// Test factories shared by the spec files.
import { DEFAULT_SCORING_WEIGHTS } from '../src/common/config';
import { computeFactors } from '../src/modules/assessments/engine/scoring';
import { ClaimInput, EvidenceCandidate, EvidenceRelation } from '../src/modules/assessments/engine/types';

export const claimInput = (overrides: Partial<ClaimInput> = {}): ClaimInput => ({
  id: 'claim-1', title: 'Reduces wrinkle depth by 20% in 4 weeks', description: 'd', benefitCategory: 'ANTI_WRINKLE', targetOutcome: 'Reduced wrinkle depth',
  measurementEndpoint: 'Wrinkle depth', targetValue: 20, measurementUnit: '%', durationWeeks: 4, targetPopulation: 'Women with facial wrinkles',
  applicationFrequency: null, scientificContext: null, ...overrides,
});

export const weights = DEFAULT_SCORING_WEIGHTS;

/** Builds an evidence candidate with computed match factors, overriding only what a test cares about. */
export function candidate(overrides: Partial<EvidenceCandidate> & { relation?: EvidenceRelation; id?: string } = {}, claim = claimInput()): EvidenceCandidate {
  const base = {
    id: 'ev-1', title: 'Study', evidenceType: 'CLINICAL_STUDY', scope: 'INGREDIENT', relation: 'INGREDIENT' as EvidenceRelation, role: 'SUPPORTING', categoryMatch: true,
    ingredientNames: ['Niacinamide'], sourceName: 'Journal', doi: null, pmid: null, publishedAt: '2020-01-01', studyDesign: 'RCT', sampleSize: 50,
    population: 'Women with facial wrinkles', durationWeeks: 4, testedSubject: 'x', testedConcentration: 5, formulatedConcentration: 5, endpoint: 'Wrinkle depth',
    resultsSummary: 'r', effectDirection: 'POSITIVE', effectMagnitude: null, limitations: 'l', quality: 'MODERATE', status: 'VERIFIED',
  } as Omit<EvidenceCandidate, 'factors'>;
  const merged = { ...base, ...overrides } as Omit<EvidenceCandidate, 'factors'>;
  const factors = computeFactors(
    {
      relation: merged.relation, categoryMatch: merged.categoryMatch, quality: merged.quality, testedConcentration: merged.testedConcentration,
      formulatedConcentration: merged.formulatedConcentration, durationWeeks: merged.durationWeeks, population: merged.population, effectMagnitude: merged.effectMagnitude,
    },
    claim,
  );
  return { ...merged, factors };
}
