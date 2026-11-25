// Test factories shared by the spec files.
import { ClaimInput, EvidenceCandidate } from '../src/modules/assessments/engine/types';

export const claimInput = (overrides: Partial<ClaimInput> = {}): ClaimInput => ({
  id: 'claim-1', title: 'Reduces wrinkle depth by 20% in 4 weeks', description: null, benefits: ['anti-wrinkle'],
  targetValue: 20, measurementUnit: '%', durationWeeks: 4, targetPopulation: 'Women with facial wrinkles', ...overrides,
});

/** An evidence candidate as sent to Claude, overriding only what a test cares about. */
export function candidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    id: 'ev-1', title: 'Study', evidenceType: 'CLINICAL_STUDY', scope: 'INGREDIENT', relation: 'INGREDIENT', benefits: ['anti-wrinkle'],
    ingredientNames: ['Niacinamide'], sourceName: 'Journal', doi: null, pmid: null, publishedAt: '2020-01-01', studyDesign: 'RCT', sampleSize: 50,
    population: 'Women with facial wrinkles', durationWeeks: 4, testedSubject: 'x', testedConcentration: 5, formulatedConcentration: 5, endpoint: 'Wrinkle depth',
    resultsSummary: 'r', effectDirection: 'POSITIVE', effectMagnitude: null, limitations: 'l', quality: 'MODERATE', status: 'VERIFIED', ...overrides,
  };
}

/** A schema-valid answer as Claude would return it. */
export const claudeAnswer = (over: Record<string, unknown> = {}) => ({
  verdict: 'INCONCLUSIVE', score: 55, scoreExplanation: 'Only ingredient studies exist.', summary: 'Not enough evidence yet.', strengths: ['A relevant ingredient study'],
  limitations: [], ingredientEvidenceAnalysis: [{ evidenceId: 'ing-1', note: 'Supportive ingredient result.' }], formulationEvidenceAnalysis: [],
  contradictoryEvidence: [], evidenceRoles: [{ evidenceId: 'ing-1', role: 'SUPPORTS' }], missingEvidence: ['A study of this exact formula'],
  recommendedTests: ['Run a vehicle-controlled trial'], evidenceReferences: ['ing-1'], reasoning: 'Detailed reasoning.', ...over,
});
