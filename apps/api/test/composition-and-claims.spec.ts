import { checkComposition } from '../src/modules/formulations/composition';
import { canTransition, validateClaimReadiness } from '../src/modules/claims/claim-rules';

const line = (ingredientId: string, percentage: number, extra = {}) => ({ ingredientId, percentage, ...extra });

describe('formulation percentage validation', () => {
  it('accepts a formula that totals exactly 100%', () => {
    const result = checkComposition([line('a', 5), line('b', 5), line('c', 1), line('d', 0.2), line('e', 88.8)]);
    expect(result).toMatchObject({ total: 100, remaining: 0, status: 'VALID', errors: [] });
  });

  it('is not fooled by floating-point arithmetic (0.1 + 0.2 style sums)', () => {
    const result = checkComposition([line('a', 33.3333), line('b', 33.3333), line('c', 33.3334)]);
    expect(result.status).toBe('VALID');
  });

  it('flags over-allocation', () => {
    const result = checkComposition([line('a', 60), line('b', 50)]);
    expect(result.status).toBe('OVER');
    expect(result.remaining).toBe(-10);
    expect(result.errors[0]).toMatch(/Over-allocated/);
  });

  it('flags under-allocation', () => {
    const result = checkComposition([line('a', 40)]);
    expect(result.status).toBe('UNDER');
    expect(result.remaining).toBe(60);
    expect(result.errors[0]).toMatch(/Under-allocated/);
  });

  it('rejects empty formulas, duplicates and non-positive concentrations', () => {
    expect(checkComposition([]).status).toBe('EMPTY');
    expect(checkComposition([line('a', 50), line('a', 50)]).errors.join()).toMatch(/more than once/);
    expect(checkComposition([line('a', 0), line('b', 100)]).errors.join()).toMatch(/greater than 0/);
  });

  it('warns (but does not fail) when outside a documented reference range', () => {
    const result = checkComposition([line('pres', 1.5, { ingredientName: 'Phenoxyethanol', maxConcentration: 1 }), line('water', 98.5)]);
    expect(result.status).toBe('VALID');
    expect(result.warnings[0]).toMatch(/exceeds its documented maximum/);
  });
});

describe('claim workflow and submission validation', () => {
  const completeClaim = {
    title: 'Claim', benefitCategory: 'HYDRATION', targetOutcome: 'o', measurementEndpoint: 'e', targetValue: 10, measurementUnit: '%', durationWeeks: 4, targetPopulation: 'adults',
  };
  const validFormulation = { ingredients: [line('a', 10), line('b', 90)] };

  it('allows only the documented transitions', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition('SUBMITTED', 'READY_FOR_ASSESSMENT')).toBe(false);
    expect(canTransition('REJECTED', 'SUBMITTED')).toBe(false);
  });

  it('passes a complete claim with a valid formulation', () => {
    expect(validateClaimReadiness(completeClaim, validFormulation)).toEqual([]);
  });

  it('reports a missing formulation and missing fields', () => {
    const problems = validateClaimReadiness({ ...completeClaim, measurementEndpoint: '' }, null);
    expect(problems.join(' ')).toMatch(/measurementEndpoint/);
    expect(problems.join(' ')).toMatch(/not linked to a saved formulation/);
  });

  it('blocks submission when the formulation does not total 100%', () => {
    const problems = validateClaimReadiness(completeClaim, { ingredients: [line('a', 40)] });
    expect(problems.join(' ')).toMatch(/Under-allocated/);
  });
});
