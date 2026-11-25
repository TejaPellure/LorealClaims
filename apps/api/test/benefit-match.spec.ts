import { claimConcepts, conceptsOf, normalizeBenefit, studyMatchesClaim } from '../src/modules/assessments/engine/benefit-match';
import { computeScore, durationFactor, populationFactor } from '../src/modules/assessments/engine/scoring';
import { buildUserPrompt, SYSTEM_PROMPT } from '../src/modules/assessments/engine/prompt';
import { candidate, claimInput, weights } from './helpers';

const study = (over: Partial<{ benefits: string[]; endpoint: string; title: string }> = {}) => ({ benefits: ['acne-blemishes'], endpoint: 'Acne lesion counts', title: 'Nicotinamide gel for acne', ...over });

describe('benefit matching', () => {
  it('normalises custom benefits into stable tags', () => {
    expect(normalizeBenefit('Acne / Blemishes')).toBe('acne-blemishes');
    expect(normalizeBenefit('  Dark   circles!! ')).toBe('dark-circles');
  });

  it('understands different wordings of the same concern', () => {
    expect(conceptsOf('reduces pimples and breakouts')).toContain('acne');
    expect(conceptsOf('smaller looking pores')).toContain('pores');
    expect(conceptsOf('controls shine and sebum')).toContain('oil');
    expect(conceptsOf('fades dark spots and melasma')).toContain('pigmentation');
    expect(conceptsOf('keeps skin moisturised')).toContain('hydration');
  });

  it('uses the title, the description and the chips together', () => {
    const concepts = claimConcepts({ title: 'Clearer skin in 4 weeks', description: 'fewer pimples on oily skin', benefits: ['my-own-benefit'] });
    expect([...concepts].sort()).toEqual(['acne', 'oil']);
  });

  it('matches a study to a claim by concept even when the user wrote only free text', () => {
    expect(studyMatchesClaim({ title: 'Reduces pimples in 8 weeks', benefits: [] }, study())).toBe(true);
    expect(studyMatchesClaim({ title: 'Plumper skin', benefits: ['hydration'] }, study())).toBe(false);
  });

  it('matches a user-defined chip that is identical to a study tag', () => {
    expect(studyMatchesClaim({ title: 'A new glow', benefits: ['Skin Radiance Boost'] }, study({ benefits: ['skin-radiance-boost'], endpoint: 'x', title: 'y' }))).toBe(true);
  });
});

describe('scoring with optional claim fields', () => {
  it('gives neutral credit when the claim names no timeframe or population', () => {
    expect(durationFactor(12, null)).toBe(0.5);
    expect(populationFactor(null, 'Adults')).toBe(0.5);
    expect(populationFactor('   ', 'Adults')).toBe(0.5);
  });

  it('scores a claim with no numbers, and does not flag a magnitude shortfall', () => {
    const bare = claimInput({ targetValue: null, durationWeeks: null, targetPopulation: null });
    const c = candidate({ relation: 'FINISHED_EXACT', scope: 'FINISHED_PRODUCT', effectMagnitude: 5 }, bare);
    expect(c.factors.magnitudeShortfall).toBe(false);
    expect(computeScore([c], weights).total).toBeGreaterThan(0);
  });
});

describe('prompt and playbook', () => {
  const pkg = {
    claim: claimInput({ description: 'For oily skin', benefits: ['pores'], targetValue: null, durationWeeks: null, targetPopulation: null }),
    formulation: { id: 'f', productName: 'Serum', ingredients: [{ ingredientId: 'i', name: 'Niacinamide', inciName: 'Niacinamide', percentage: 5, function: 'Skin-conditioning active', minConcentration: null, maxConcentration: null }] },
    evidence: [candidate()],
  };

  it('sends the wording, description and benefits, and leaves out fields the user did not give', () => {
    const claim = JSON.parse(buildUserPrompt(pkg).split('\n\n')[1]).claim;
    expect(claim).toMatchObject({ wording: pkg.claim.title, description: 'For oily skin', benefits: ['pores'] });
    expect(claim).not.toHaveProperty('target');
    expect(claim).not.toHaveProperty('durationWeeks');
    expect(claim).not.toHaveProperty('population');
  });

  it('gives Claude the ingredient role and the evaluation playbook', () => {
    expect(buildUserPrompt(pkg)).toContain('Skin-conditioning active');
    expect(SYSTEM_PROMPT).toMatch(/EVALUATION PLAYBOOK/);
    expect(SYSTEM_PROMPT).toMatch(/medicinal/);
    expect(SYSTEM_PROMPT).toMatch(/Up to X%/i);
  });
});
