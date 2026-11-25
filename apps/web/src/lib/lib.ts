import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { BenefitCategory, ClaimStatus, Persona, Verdict } from '@/types';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

/** "ANTI_WRINKLE" -> "Anti wrinkle" */
export const humanize = (value?: string | null) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '-');

export const BENEFIT_CATEGORIES: BenefitCategory[] = ['HYDRATION', 'ANTI_WRINKLE', 'BARRIER_REPAIR', 'BRIGHTENING', 'SOOTHING', 'OTHER'];
export const INGREDIENT_CATEGORIES = ['BASE', 'HUMECTANT', 'ACTIVE', 'EMOLLIENT', 'BARRIER_LIPID', 'PRESERVATIVE', 'TEXTURIZER', 'ANTIOXIDANT'];
export const EVIDENCE_TYPES = [
  'CLINICAL_STUDY', 'DERMATOLOGICAL_STUDY', 'INSTRUMENTAL_MEASUREMENT', 'IN_VITRO_RESEARCH', 'LITERATURE_REVIEW', 'FINISHED_PRODUCT_TRIAL', 'SAFETY_COMPATIBILITY_STUDY',
];
export const PERSONAS: { value: Persona; label: string }[] = [
  { value: 'BUSINESS', label: 'Business team' },
  { value: 'CLAIM_MANAGER', label: 'Claim manager' },
  { value: 'SCIENTIST', label: 'Scientist' },
  { value: 'EVALUATOR', label: 'Evaluator' },
];

// ── Claim workflow (UI side; the API enforces the real transition rules) ──
export interface WorkflowAction { to: ClaimStatus; label: string; personas: Persona[]; tone?: 'primary' | 'danger' }

export const WORKFLOW_ACTIONS: Record<ClaimStatus, WorkflowAction[]> = {
  DRAFT: [{ to: 'SUBMITTED', label: 'Submit proposal', personas: ['BUSINESS'] }],
  SUBMITTED: [{ to: 'UNDER_MANAGER_REVIEW', label: 'Start review', personas: ['CLAIM_MANAGER'] }],
  UNDER_MANAGER_REVIEW: [
    { to: 'ACCEPTED_FOR_FORMULATION', label: 'Accept (applicable and feasible)', personas: ['CLAIM_MANAGER'] },
    { to: 'REJECTED', label: 'Reject', personas: ['CLAIM_MANAGER'], tone: 'danger' },
  ],
  ACCEPTED_FOR_FORMULATION: [{ to: 'FORMULATION_IN_PROGRESS', label: 'Start formulation', personas: ['SCIENTIST'] }],
  FORMULATION_IN_PROGRESS: [{ to: 'AWAITING_EVIDENCE', label: 'Formulation ready, await evidence', personas: ['SCIENTIST'] }],
  AWAITING_EVIDENCE: [{ to: 'READY_FOR_ASSESSMENT', label: 'Submit for assessment', personas: ['SCIENTIST', 'EVALUATOR'] }],
  READY_FOR_ASSESSMENT: [],
  ASSESSED: [{ to: 'READY_FOR_ASSESSMENT', label: 'Reopen for re-assessment', personas: ['SCIENTIST', 'EVALUATOR'] }],
  APPROVED_BY_EVALUATOR: [],
  REQUIRES_MORE_EVIDENCE: [
    { to: 'AWAITING_EVIDENCE', label: 'Collect more evidence', personas: ['EVALUATOR', 'SCIENTIST'] },
    { to: 'READY_FOR_ASSESSMENT', label: 'Resubmit for assessment', personas: ['SCIENTIST', 'EVALUATOR'] },
  ],
  REJECTED: [],
};

/** Ordered happy path used by the workflow stepper. */
export const WORKFLOW_STEPS: ClaimStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_MANAGER_REVIEW', 'ACCEPTED_FOR_FORMULATION', 'FORMULATION_IN_PROGRESS', 'AWAITING_EVIDENCE', 'READY_FOR_ASSESSMENT', 'ASSESSED',
];

export const VERDICT_LABEL: Record<Verdict, string> = { SUPPORTED: 'Supported', NOT_SUPPORTED: 'Not supported', INCONCLUSIVE: 'Inconclusive' };

/** Client-side mirror of the server composition rule (integers at 1e-4 precision). Server stays authoritative. */
export function compositionOf(percentages: number[]) {
  const scaled = percentages.reduce((sum, p) => sum + Math.round((Number.isFinite(p) ? p : 0) * 10000), 0);
  const deviation = scaled - 1_000_000;
  const status = percentages.length === 0 ? 'EMPTY' : Math.abs(deviation) <= 10 ? 'VALID' : deviation > 0 ? 'OVER' : 'UNDER';
  return { total: scaled / 10000, remaining: (1_000_000 - scaled) / 10000, status } as const;
}
