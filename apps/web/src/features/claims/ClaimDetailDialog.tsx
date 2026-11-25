import { CheckCircle2, Circle, Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClaimStatusBadge, DecisionBadge, ProviderBadge, VerdictBadge } from '@/components/badges';
import { Detail } from '@/components/shared';
import { Button, Dialog, ErrorState, Field, FormError, Select, Skeleton } from '@/components/ui/primitives';
import { useAsync, usePersona } from '@/hooks/hooks';
import { formatDate, humanize, WORKFLOW_ACTIONS, WORKFLOW_STEPS } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Assessment, Claim, ClaimStatus, Formulation } from '@/types';

const ASSESSABLE: ClaimStatus[] = ['READY_FOR_ASSESSMENT', 'ASSESSED', 'REQUIRES_MORE_EVIDENCE'];
const FAST_TRACK: ClaimStatus[] = ['SUBMITTED', 'UNDER_MANAGER_REVIEW', 'ACCEPTED_FOR_FORMULATION', 'FORMULATION_IN_PROGRESS', 'AWAITING_EVIDENCE', 'READY_FOR_ASSESSMENT'];

function Stepper({ status }: { status: ClaimStatus }) {
  const current = WORKFLOW_STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Workflow progress">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = current >= 0 && i <= current;
        return (
          <li key={step} className={`flex items-center gap-1 ${done ? 'text-teal-800' : 'text-slate-400'}`}>
            {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}{humanize(step)}
          </li>
        );
      })}
    </ol>
  );
}

/** Claim detail: workflow actions for the active demo persona, formulation assignment and assessment runs. */
export function ClaimDetailDialog({ claimId, onClose, onChanged }: { claimId: string | null; onClose: () => void; onChanged: () => void }) {
  const { persona } = usePersona();
  const navigate = useNavigate();
  const claim = useAsync(() => (claimId ? api.get<Claim & { assessmentList?: unknown }>(`/claims/${claimId}`) : Promise.resolve(null)), [claimId]);
  const history = useAsync(() => (claimId ? api.get<Assessment[]>(`/claims/${claimId}/assessments`) : Promise.resolve([])), [claimId]);
  const formulations = useAsync(() => (claim.data ? api.get<Formulation[]>(`/products/${claim.data.productId}/formulations`) : Promise.resolve([])), [claim.data?.productId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = claim.data;

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
      claim.reload();
      history.reload();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const assess = async (forceNew = false) => {
    const assessment = await api.post<Assessment>('/claims/assess', { claimId, forceNew });
    toast.success(assessment.reused ? 'An identical assessment already exists. Showing it.' : 'Assessment completed');
    onClose();
    navigate(`/assessments/${assessment.id}`);
  };

  /** Demo shortcut: walks the claim through every workflow step so a full demo needs one click. */
  const fastTrack = async () => {
    for (const status of FAST_TRACK) {
      const current = await api.get<Claim>(`/claims/${claimId}`);
      if (WORKFLOW_ACTIONS[current.status].some((a) => a.to === status)) await api.patch(`/claims/${claimId}/status`, { status });
    }
    await assess();
  };

  const actions = data ? WORKFLOW_ACTIONS[data.status] : [];

  return (
    <Dialog open={!!claimId} onOpenChange={(o) => !o && onClose()} title={data?.title ?? 'Claim'} description={data?.product.name} wide>
      {claim.loading && !data && <Skeleton className="h-64 w-full" />}
      {claim.error && <ErrorState message={claim.error} onRetry={claim.reload} />}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><ClaimStatusBadge status={data.status} /><span className="text-xs text-slate-500">Created by {humanize(data.createdBy)} on {formatDate(data.createdAt)}</span></div>
          <Stepper status={data.status} />

          <dl>
            <Detail label="Description">{data.description}</Detail>
            <Detail label="Benefit category">{humanize(data.benefitCategory)}</Detail>
            <Detail label="Target">{`${data.targetOutcome}: ${data.targetValue}${data.measurementUnit} in ${data.durationWeeks} weeks`}</Detail>
            <Detail label="Endpoint">{data.measurementEndpoint}</Detail>
            <Detail label="Population">{data.targetPopulation}</Detail>
            <Detail label="Application">{data.applicationFrequency}</Detail>
            <Detail label="Context">{data.scientificContext}</Detail>
            <Detail label="Manager notes">{data.managerNotes}</Detail>
            <Detail label="Formulation">{data.formulation ? `Version ${data.formulation.version} (${data.formulation.status.toLowerCase()})` : 'Not assigned'}</Detail>
          </dl>

          {!data.formulationId && (
            <Field label="Assign a formulation version" hint="The claim is bound to this exact version.">
              <Select value="" onChange={(e) => e.target.value && run('assign', async () => { await api.patch(`/claims/${data.id}`, { formulationId: e.target.value }); })}>
                <option value="">Choose version...</option>{formulations.data?.map((f) => <option key={f.id} value={f.id}>v{f.version} ({f.status.toLowerCase()})</option>)}
              </Select>
            </Field>
          )}

          <FormError message={error} />

          <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-sm font-semibold">Workflow actions <span className="font-normal text-slate-500">(demo persona: {humanize(persona)}; not real permissions)</span></h3>
            <div className="flex flex-wrap gap-2">
              {actions.length === 0 && !ASSESSABLE.includes(data.status) && <p className="text-sm text-slate-500">No further workflow actions.</p>}
              {actions.map((a) => {
                const allowed = a.personas.includes(persona);
                return (
                  <Button key={a.to} variant={a.tone === 'danger' ? 'danger' : 'secondary'} size="sm" disabled={!allowed} loading={busy === a.to}
                    title={allowed ? undefined : `Switch persona to ${a.personas.map(humanize).join(' / ')}`} onClick={() => run(a.to, async () => { await api.patch(`/claims/${data.id}/status`, { status: a.to }); })}>
                    {a.label}
                  </Button>
                );
              })}
              {ASSESSABLE.includes(data.status) && (
                <Button size="sm" loading={busy === 'assess'} onClick={() => run('assess', () => assess(data.status === 'ASSESSED'))}><Play className="h-4 w-4" />{data.status === 'READY_FOR_ASSESSMENT' ? 'Run AI assessment' : 'Re-run assessment'}</Button>
              )}
              {data.formulationId && data.status !== 'READY_FOR_ASSESSMENT' && !ASSESSABLE.includes(data.status) && !['REJECTED', 'APPROVED_BY_EVALUATOR'].includes(data.status) && (
                <Button size="sm" variant="ghost" loading={busy === 'fast'} onClick={() => run('fast', fastTrack)}>Fast-track to assessment (demo)</Button>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Assessment history</h3>
            {history.loading ? <Skeleton className="h-10 w-full" /> : !history.data?.length ? <p className="text-sm text-slate-500">No assessments yet.</p> : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {history.data.map((a) => (
                  <li key={a.id}>
                    <Link to={`/assessments/${a.id}`} onClick={onClose} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                      <VerdictBadge verdict={a.verdict} /><span>{a.evidenceScore}/100</span><ProviderBadge provider={a.provider} /><DecisionBadge decision={a.reviewDecision} />
                      <span className="ml-auto text-xs text-slate-500">v{a.formulation.version} - {formatDate(a.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
