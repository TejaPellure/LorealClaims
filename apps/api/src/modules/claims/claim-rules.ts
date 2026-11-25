// Claim readiness: everything that must be true before a claim can be sent to Claude.
// Only the wording is mandatory; every other claim field is optional because Claude also reads the wording itself.
import { checkComposition, CompositionLine } from '../products/composition';

interface ClaimFields {
  title?: string | null;
}

/** Returns human-readable problems; an empty list means the claim is ready to assess. */
export function validateClaimReadiness(claim: ClaimFields, formulation: { ingredients: CompositionLine[] } | null): string[] {
  const problems: string[] = [];
  if (!claim.title?.trim()) problems.push('Claim is missing its wording.');
  if (!formulation) problems.push('Claim is not linked to a formulation.');
  else problems.push(...checkComposition(formulation.ingredients).errors);
  return problems;
}
