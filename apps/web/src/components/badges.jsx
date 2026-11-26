// Domain badges: one place defines how each verdict / status is coloured and worded.
import { BadgeCheck, CircleHelp, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { humanize, VERDICT_LABEL } from '@/lib/lib';

export function VerdictBadge({ verdict }) {
  const config = {
    SUPPORTED: { tone: 'green', Icon: BadgeCheck },
    NOT_SUPPORTED: { tone: 'red', Icon: XCircle },
    INCONCLUSIVE: { tone: 'amber', Icon: CircleHelp },
  } ;
  const { tone, Icon } = config[verdict];
  return <Badge tone={tone}><Icon className="h-3 w-3" aria-hidden />{VERDICT_LABEL[verdict]}</Badge>;
}

export const VerificationBadge = ({ status }) =>
  <Badge tone={status === 'VERIFIED' ? 'green' : 'amber'}>{humanize(status)}</Badge>;

export const ScopeBadge = ({ scope }) =>
  scope === 'FINISHED_PRODUCT' ? <Badge tone="teal">Finished product</Badge> : <Badge>Ingredient level</Badge>;

export const QualityBadge = ({ quality }) => {
  const tone = ({ HIGH: 'green', MODERATE: 'teal', LOW: 'amber', VERY_LOW: 'red' } )[quality ] ?? 'neutral';
  return <Badge tone={tone}>{humanize(quality)} quality</Badge>;
};
