import { validateAiAssessment, InvalidAiResponseError } from '../src/modules/assessments/engine/ai-schema';
import { applyGuardrails } from '../src/modules/assessments/engine/guardrails';
import { computeScore, concentrationFactor, durationFactor, populationFactor } from '../src/modules/assessments/engine/scoring';
import { candidate, claimInput, weights } from './helpers';

describe('scoring factors', () => {
  it('penalises concentration below the tested level and accepts equal or modestly higher', () => {
    expect(concentrationFactor('INGREDIENT', 5, 5)).toBe(1);
    expect(concentrationFactor('INGREDIENT', 5, 2.5)).toBe(0.5);
    expect(concentrationFactor('INGREDIENT', 2, 5)).toBe(0.8); // >2x tested: effect/safety no longer directly applicable
    expect(concentrationFactor('FINISHED_EXACT', null, null)).toBe(1);
    expect(concentrationFactor('INGREDIENT', null, 5)).toBe(0.5);
  });

  it('scores study duration against the claimed timeframe', () => {
    expect(durationFactor(4, 4)).toBe(1);
    expect(durationFactor(2, 4)).toBe(0.5);
    expect(durationFactor(12, 4)).toBe(0.6); // a 12-week result does not prove a 4-week benefit
    expect(durationFactor(null, 4)).toBe(0.3);
  });

  it('measures population overlap with synonyms', () => {
    expect(populationFactor('Women with facial wrinkles', 'Female subjects with facial wrinkles')).toBe(1);
    expect(populationFactor('Women with facial wrinkles', 'Men with acne')).toBe(0.2);
  });
});

describe('evidence sufficiency score', () => {
  it('is 0 when nothing supports the claim endpoint (missing evidence is not a negative result)', () => {
    const result = computeScore([], weights);
    expect(result.total).toBe(0);
    expect(result.anchorEvidenceId).toBeNull();
  });

  it('weights sum to 100 so a perfect match scores 100', () => {
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100);
    const perfect = candidate({ relation: 'FINISHED_EXACT', scope: 'FINISHED_PRODUCT', quality: 'HIGH', testedConcentration: null, effectMagnitude: 40 });
    expect(computeScore([perfect], weights).total).toBe(100);
  });

  it('scores finished-product evidence of the exact formulation above ingredient-only evidence', () => {
    const ingredientOnly = computeScore([candidate({ relation: 'INGREDIENT' })], weights).total;
    const exact = computeScore([candidate({ relation: 'FINISHED_EXACT', scope: 'FINISHED_PRODUCT' })], weights).total;
    const otherFormula = computeScore([candidate({ relation: 'FINISHED_OTHER', scope: 'FINISHED_PRODUCT' })], weights).total;
    expect(exact).toBeGreaterThan(otherFormula);
    expect(otherFormula).toBeGreaterThan(ingredientOnly);
  });

  it('lowers the score when results conflict', () => {
    const supporting = candidate({ id: 'a' });
    const neutral = candidate({ id: 'b', role: 'CONTRADICTORY', effectDirection: 'NEUTRAL' });
    expect(computeScore([supporting, neutral], weights).total).toBeLessThan(computeScore([supporting], weights).total);
  });

  it('penalises a reported effect smaller than the claimed magnitude', () => {
    const enough = candidate({ relation: 'FINISHED_EXACT', effectMagnitude: 25 });
    const short = candidate({ relation: 'FINISHED_EXACT', effectMagnitude: 10 });
    expect(short.factors.magnitudeShortfall).toBe(true);
    expect(computeScore([short], weights).total).toBeLessThan(computeScore([enough], weights).total);
  });

  it('uses configurable weights', () => {
    const only = { ...weights, methodologicalQuality: 100, directRelevance: 0, concentrationSimilarity: 0, endpointMatch: 0, durationMatch: 0, populationSimilarity: 0, finishedProductTesting: 0, consistency: 0 };
    expect(computeScore([candidate({ quality: 'HIGH' })], only).total).toBe(100);
  });
});

describe('AI response validation', () => {
  const evidence = [candidate({ id: 'ing-1', relation: 'INGREDIENT' }), candidate({ id: 'fin-1', relation: 'FINISHED_EXACT', scope: 'FINISHED_PRODUCT' })];
  const valid = {
    verdict: 'INCONCLUSIVE', summary: 's', strengths: [], limitations: [], ingredientEvidenceAnalysis: [{ evidenceId: 'ing-1', note: 'n' }],
    formulationEvidenceAnalysis: [{ evidenceId: 'fin-1', note: 'n' }], contradictoryEvidence: [], missingEvidence: ['gap'], recommendedTests: [], evidenceReferences: ['ing-1'], reasoning: 'r',
  };

  it('accepts a well-formed response', () => {
    expect(validateAiAssessment(valid, evidence).verdict).toBe('INCONCLUSIVE');
  });

  it('rejects fabricated evidence ids', () => {
    expect(() => validateAiAssessment({ ...valid, evidenceReferences: ['made-up'] }, evidence)).toThrow(InvalidAiResponseError);
    expect(() => validateAiAssessment({ ...valid, contradictoryEvidence: [{ evidenceId: 'nope', note: 'x' }] }, evidence)).toThrow(/unknown evidenceId/);
  });

  it('refuses to mix ingredient evidence with finished-product evidence', () => {
    expect(() => validateAiAssessment({ ...valid, ingredientEvidenceAnalysis: [{ evidenceId: 'fin-1', note: 'x' }] }, evidence)).toThrow(/ingredient-level evidence only/);
    expect(() => validateAiAssessment({ ...valid, formulationEvidenceAnalysis: [{ evidenceId: 'ing-1', note: 'x' }] }, evidence)).toThrow(/finished-product evidence only/);
  });

  it('rejects bad verdicts, missing fields and non-objects', () => {
    expect(() => validateAiAssessment({ ...valid, verdict: 'MAYBE' }, evidence)).toThrow(/verdict/);
    expect(() => validateAiAssessment({ ...valid, reasoning: '' }, evidence)).toThrow(/reasoning/);
    expect(() => validateAiAssessment('text', evidence)).toThrow(InvalidAiResponseError);
  });
});

describe('verdict guardrails', () => {
  const claim = claimInput();
  const exact = candidate({ relation: 'FINISHED_EXACT', scope: 'FINISHED_PRODUCT', effectMagnitude: 30 }, claim);

  it('downgrades SUPPORTED without exact finished-product evidence (ingredient evidence is not enough)', () => {
    const result = applyGuardrails('SUPPORTED', [candidate()], 90, 60);
    expect(result.verdict).toBe('INCONCLUSIVE');
    expect(result.notes[0]).toMatch(/finished-product/);
  });

  it('downgrades SUPPORTED when the score is below the minimum', () => {
    expect(applyGuardrails('SUPPORTED', [exact], 40, 60).verdict).toBe('INCONCLUSIVE');
  });

  it('keeps SUPPORTED when directly applicable evidence and score justify it', () => {
    expect(applyGuardrails('SUPPORTED', [exact], 80, 60)).toEqual({ verdict: 'SUPPORTED', notes: [] });
  });

  it('changes NOT_SUPPORTED to INCONCLUSIVE when evidence is merely missing', () => {
    expect(applyGuardrails('NOT_SUPPORTED', [candidate()], 20, 60).verdict).toBe('INCONCLUSIVE');
  });

  it('keeps NOT_SUPPORTED when evidence contradicts the claim', () => {
    const contradicts = candidate({ id: 'c', relation: 'FINISHED_EXACT', role: 'CONTRADICTORY', effectDirection: 'NEUTRAL' });
    expect(applyGuardrails('NOT_SUPPORTED', [contradicts], 20, 60).verdict).toBe('NOT_SUPPORTED');
  });
});
