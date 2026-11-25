// Domain badges: one place defines how each verdict / status is coloured and worded.
import { BadgeCheck, CircleHelp, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { humanize, VERDICT_LABEL } from '@/lib/lib';
import type { Verdict, VerificationStatus } from '@/types';

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const config = {
    SUPPORTED: { tone: 'green', Icon: BadgeCheck },
    NOT_SUPPORTED: { tone: 'red', Icon: XCircle },
    INCONCLUSIVE: { tone: 'amber', Icon: CircleHelp },
  } as const;
  const { tone, Icon } = config[verdict];
  return <Badge tone={tone}><Icon className="h-3 w-3" aria-hidden />{VERDICT_LABEL[verdict]}</Badge>;
}

export const VerificationBadge = ({ status }: { status: VerificationStatus }) =>
  <Badge tone={status === 'VERIFIED' ? 'green' : 'amber'}>{humanize(status)}</Badge>;

export const ScopeBadge = ({ scope }: { scope: string }) =>
  scope === 'FINISHED_PRODUCT' ? <Badge tone="teal">Finished product</Badge> : <Badge>Ingredient level</Badge>;

export const QualityBadge = ({ quality }: { quality: string }) => {
  const tone = ({ HIGH: 'green', MODERATE: 'teal', LOW: 'amber', VERY_LOW: 'red' } as const)[quality as 'HIGH'] ?? 'neutral';
  return <Badge tone={tone}>{humanize(quality)} quality</Badge>;
};
