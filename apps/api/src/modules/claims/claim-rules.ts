// Claim workflow rules: allowed status transitions and "ready for assessment" validation.
import { ClaimStatus } from '@prisma/client';
import { checkComposition, CompositionLine } from '../formulations/composition';

/**
 * Business workflow (see docs/BUSINESS_WORKFLOW.md):
 * Business proposes -> Claim manager reviews -> Scientist formulates -> Evaluator attaches evidence
 * -> AI assessment -> Human evaluator decision.
 * `ASSESSED` is only reached by running an assessment; the review outcomes only via the review endpoint.
 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_MANAGER_REVIEW'],
  UNDER_MANAGER_REVIEW: ['ACCEPTED_FOR_FORMULATION', 'REJECTED'],
  ACCEPTED_FOR_FORMULATION: ['FORMULATION_IN_PROGRESS'],
  FORMULATION_IN_PROGRESS: ['AWAITING_EVIDENCE'],
  AWAITING_EVIDENCE: ['READY_FOR_ASSESSMENT'],
  READY_FOR_ASSESSMENT: ['AWAITING_EVIDENCE'],
  ASSESSED: ['READY_FOR_ASSESSMENT'],
  APPROVED_BY_EVALUATOR: [],
  REQUIRES_MORE_EVIDENCE: ['AWAITING_EVIDENCE', 'READY_FOR_ASSESSMENT'],
  REJECTED: [],
};

/** Statuses from which an assessment may be (re-)run. */
export const ASSESSABLE_STATUSES: ClaimStatus[] = ['READY_FOR_ASSESSMENT', 'ASSESSED', 'REQUIRES_MORE_EVIDENCE'];

export const canTransition = (from: ClaimStatus, to: ClaimStatus) => CLAIM_TRANSITIONS[from].includes(to);

interface ClaimFields {
  title?: string | null;
  benefitCategory?: string | null;
  targetOutcome?: string | null;
  measurementEndpoint?: string | null;
  targetValue?: unknown;
  measurementUnit?: string | null;
  durationWeeks?: number | null;
  targetPopulation?: string | null;
}

const REQUIRED_CLAIM_FIELDS: (keyof ClaimFields)[] = [
  'title', 'benefitCategory', 'targetOutcome', 'measurementEndpoint', 'targetValue', 'measurementUnit', 'durationWeeks', 'targetPopulation',
];

/**
 * Everything that must be true before a claim may be submitted for AI assessment.
 * Returns a list of human-readable problems; an empty list means "ready".
 */
export function validateClaimReadiness(
  claim: ClaimFields,
  formulation: { ingredients: CompositionLine[] } | null,
): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_CLAIM_FIELDS) {
    const value = claim[field];
    if (value === null || value === undefined || value === '') problems.push(`Claim is missing "${field}".`);
  }
  if (!formulation) {
    problems.push('Claim is not linked to a saved formulation version.');
  } else {
    problems.push(...checkComposition(formulation.ingredients).errors);
  }
  return problems;
}
