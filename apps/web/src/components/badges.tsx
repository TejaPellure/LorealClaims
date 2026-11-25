// Domain badges: one place defines how each status/verdict/etc. is coloured and worded.
import { AlertCircle, BadgeCheck, CircleHelp, FlaskConical, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { humanize, VERDICT_LABEL } from '@/lib/lib';
import type { ClaimStatus, Verdict, VerificationStatus } from '@/types';

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const config = {
    SUPPORTED: { tone: 'green', Icon: BadgeCheck },
    NOT_SUPPORTED: { tone: 'red', Icon: XCircle },
    INCONCLUSIVE: { tone: 'amber', Icon: CircleHelp },
  } as const;
  const { tone, Icon } = config[verdict];
  return <Badge tone={tone}><Icon className="h-3 w-3" aria-hidden />{VERDICT_LABEL[verdict]}</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const tone = { VERIFIED: 'green', UNVERIFIED: 'amber', DEMO: 'violet' }[status] as 'green' | 'amber' | 'violet';
  return <Badge tone={tone}>{status === 'DEMO' ? 'Demo data' : humanize(status)}</Badge>;
}

const CLAIM_TONES: Record<ClaimStatus, 'neutral' | 'blue' | 'teal' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'neutral', SUBMITTED: 'blue', UNDER_MANAGER_REVIEW: 'blue', ACCEPTED_FOR_FORMULATION: 'teal', FORMULATION_IN_PROGRESS: 'teal',
  AWAITING_EVIDENCE: 'amber', READY_FOR_ASSESSMENT: 'teal', ASSESSED: 'blue', APPROVED_BY_EVALUATOR: 'green', REQUIRES_MORE_EVIDENCE: 'amber', REJECTED: 'red',
};
export const ClaimStatusBadge = ({ status }: { status: ClaimStatus }) => <Badge tone={CLAIM_TONES[status]}>{humanize(status)}</Badge>;

export function DecisionBadge({ decision }: { decision: string }) {
  const tone = ({ APPROVED: 'green', REJECTED: 'red', MORE_EVIDENCE_REQUESTED: 'amber', PENDING: 'neutral' } as const)[decision as 'APPROVED'] ?? 'neutral';
  return <Badge tone={tone}>{decision === 'PENDING' ? 'Awaiting evaluator' : humanize(decision)}</Badge>;
}

/** Clear, always-visible label so a mock result can never be mistaken for a Claude result. */
export function ProviderBadge({ provider }: { provider: 'MOCK' | 'CLAUDE' }) {
  return provider === 'MOCK'
    ? <Badge tone="violet"><FlaskConical className="h-3 w-3" aria-hidden />Demo / Mock AI</Badge>
    : <Badge tone="teal">Claude</Badge>;
}

export const ScopeBadge = ({ scope }: { scope: string }) =>
  scope === 'FINISHED_PRODUCT' ? <Badge tone="teal">Finished product</Badge> : <Badge>Ingredient level</Badge>;

export const BasisBadge = ({ basis }: { basis: string }) =>
  basis === 'ILLUSTRATIVE'
    ? <Badge tone="amber"><AlertCircle className="h-3 w-3" aria-hidden />Illustrative formula</Badge>
    : <Badge tone="green">Disclosed formula</Badge>;

export const QualityBadge = ({ quality }: { quality: string }) => {
  const tone = ({ HIGH: 'green', MODERATE: 'teal', LOW: 'amber', VERY_LOW: 'red' } as const)[quality as 'HIGH'] ?? 'neutral';
  return <Badge tone={tone}>{humanize(quality)} quality</Badge>;
};
