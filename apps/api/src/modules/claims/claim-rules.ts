// Claim readiness: everything that must be true before a claim can be sent to Claude.
import { checkComposition, CompositionLine } from '../products/composition';

interface ClaimFields {
  title?: string | null;
  benefitCategory?: string | null;
  measurementEndpoint?: string | null;
  targetValue?: unknown;
  measurementUnit?: string | null;
  durationWeeks?: number | null;
  targetPopulation?: string | null;
}

const REQUIRED_CLAIM_FIELDS: (keyof ClaimFields)[] = [
  'title', 'benefitCategory', 'measurementEndpoint', 'targetValue', 'measurementUnit', 'durationWeeks', 'targetPopulation',
];

/** Returns human-readable problems; an empty list means the claim is ready to assess. */
export function validateClaimReadiness(claim: ClaimFields, formulation: { ingredients: CompositionLine[] } | null): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_CLAIM_FIELDS) {
    const value = claim[field];
    if (value === null || value === undefined || value === '') problems.push(`Claim is missing "${field}".`);
  }
  if (!formulation) problems.push('Claim is not linked to a formulation.');
  else problems.push(...checkComposition(formulation.ingredients).errors);
  return problems;
}
