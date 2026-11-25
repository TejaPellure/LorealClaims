import { ArrowLeft, FlaskConical, Info, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BasisBadge, ClaimStatusBadge, DecisionBadge, ProviderBadge, ScopeBadge, VerdictBadge, VerificationBadge } from '@/components/badges';
import { BulletList, Detail, EvidenceDetailDialog, PageHeader } from '@/components/shared';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, FormError, Progress, Skeleton, Table, Td, Textarea, Th, Tooltip } from '@/components/ui/primitives';
import { useAsync, usePersona } from '@/hooks/hooks';
import { formatDate, humanize } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Assessment, EvidenceNote, ReviewDecision } from '@/types';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardBody>{children}</CardBody></Card>
);

const scoreTone = (score: number) => (score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red');

export default function AssessmentReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { persona } = usePersona();
  const { data: a, loading, error, reload } = useAsync(() => api.get<Assessment>(`/assessments/${id}`), [id]);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [error2, setError2] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !a) return <Skeleton className="h-96 w-full" />;
  if (error || !a) return <Card><ErrorState message={error ?? 'Assessment not found'} onRetry={reload} /></Card>;

  const titles = new Map(a.evidence.map((e) => [e.evidenceId, e.evidence.title]));
  const relations = new Map(a.evidenceSnapshot.map((e) => [e.id, e]));
  const roleRows = (role: string) => a.evidence.filter((e) => e.role === role);
  const canReview = persona === 'EVALUATOR';

  const decide = async (decision: ReviewDecision) => {
    setBusy(decision);
    setError2(null);
    try {
      await api.patch(`/assessments/${a.id}/review`, { decision, comments: comments.trim() || undefined });
      toast.success('Evaluator decision recorded');
      setComments('');
      reload();
    } catch (e) {
      setError2(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const rerun = async () => {
    setBusy('rerun');
    try {
      const fresh = await api.post<Assessment>('/claims/assess', { claimId: a.claim.id, forceNew: true });
      toast.success('New assessment saved. The previous one is preserved.');
      navigate(`/assessments/${fresh.id}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const NoteList = ({ notes, empty }: { notes: EvidenceNote[]; empty: string }) =>
    notes.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.evidenceId} className="rounded-md border border-slate-200 p-2.5 text-sm">
            <button className="cursor-pointer text-left font-medium text-teal-800 hover:underline" onClick={() => setOpenEvidence(n.evidenceId)}>{titles.get(n.evidenceId) ?? n.evidenceId}</button>
            <p className="mt-1 text-slate-700">{n.note}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{n.evidenceId}</p>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <Link to="/history" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Assessment history</Link>
      <PageHeader
        title={a.claim.title}
        description={`${a.formulation.product.name} - formulation v${a.formulation.version}`}
        actions={<Button variant="secondary" loading={busy === 'rerun'} onClick={rerun}><RefreshCw className="h-4 w-4" />Re-run assessment</Button>}
      />

      {a.provider === 'MOCK' && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong>Demo / Mock AI.</strong> This assessment was produced by deterministic rules ({a.model}), not by Claude. Set ASSESSMENT_PROVIDER=claude to use the real model.</span>
        </p>
      )}

      {/* Overview + score */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Assessment overview</CardTitle><div className="flex gap-2"><ProviderBadge provider={a.provider} /><VerdictBadge verdict={a.verdict} /></div></CardHeader>
          <CardBody>
            <dl>
              <Detail label="Product">{a.formulation.product.name}</Detail>
              <Detail label="Formulation version">v{a.formulation.version} <span className="ml-1"><BasisBadge basis={a.formulation.basis} /></span></Detail>
              <Detail label="Proposed claim">{a.claim.title}</Detail>
              <Detail label="Submitted">{formatDate(a.createdAt)}</Detail>
              <Detail label="Claim status"><ClaimStatusBadge status={a.claim.status} /></Detail>
              <Detail label="Model / prompt">{`${a.model ?? '-'} / ${a.promptVersion}`}</Detail>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence sufficiency</CardTitle>
            <Tooltip content="Prototype scoring rubric requiring scientific validation. It measures how well available evidence matches the claim. It is not a probability that the claim is true."><Info className="h-4 w-4 cursor-help text-slate-400" aria-label="About this score" /></Tooltip>
          </CardHeader>
          <CardBody className="space-y-3">
            <p><span className="text-4xl font-semibold text-slate-900">{a.evidenceScore}</span><span className="text-lg text-slate-500">/100</span></p>
            <Progress value={a.evidenceScore} tone={scoreTone(a.evidenceScore)} />
            <p className="text-xs text-slate-500">Calculated by transparent backend rules ({a.scoringVersion}), separate from the AI reasoning below.</p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 space-y-3">
        <Section title="Scoring criteria">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-teal-800">Show how the score was calculated</summary>
            <div className="mt-3"><Table>
              <thead><tr><Th>Criterion</Th><Th>Weight</Th><Th>Match</Th><Th>Points</Th><Th>Explanation</Th></tr></thead>
              <tbody>{a.scoreBreakdown.breakdown.map((c) => (
                <tr key={c.key}><Td className="font-medium">{c.label}</Td><Td>{c.weight}</Td><Td>{Math.round(c.value * 100)}%</Td><Td>{c.points}</Td><Td className="text-slate-600">{c.explanation}</Td></tr>
              ))}</tbody>
            </Table></div>
            <p className="mt-2 text-xs text-slate-500">{a.scoreBreakdown.disclaimer}</p>
          </details>
        </Section>

        {a.guardrailNotes.length > 0 && (
          <Section title="Backend guardrails applied"><BulletList items={a.guardrailNotes} empty="" /></Section>
        )}

        <Section title="AI assessment summary">
          <p className="text-sm text-slate-800">{a.summary}</p>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Detailed reasoning</h3>
          <p className="whitespace-pre-line text-sm text-slate-700">{a.reasoning}</p>
        </Section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Strengths"><BulletList items={a.aiResult.strengths} empty="No strengths identified." /></Section>
          <Section title="Scientific limitations"><BulletList items={a.aiResult.limitations} empty="No limitations listed." /></Section>
          <Section title="Ingredient-level evidence analysis">
            <p className="mb-2 text-xs text-slate-500">Ingredient studies do not by themselves prove the finished formulation delivers the benefit.</p>
            <NoteList notes={a.aiResult.ingredientEvidenceAnalysis} empty="No ingredient-level evidence was available." />
          </Section>
          <Section title="Finished-product evidence analysis">
            <NoteList notes={a.aiResult.formulationEvidenceAnalysis} empty="No finished-product evidence was available for this claim." />
          </Section>
          <Section title="Contradictory or neutral evidence"><NoteList notes={a.aiResult.contradictoryEvidence} empty="No contradictory evidence found." /></Section>
          <Section title="Missing evidence"><BulletList items={a.missingEvidence} empty="No gaps identified." /></Section>
        </div>
        <Section title="Recommended additional tests"><BulletList items={a.recommendedTests} empty="No additional tests recommended." /></Section>

        <Section title="Evidence traceability">
          <p className="mb-2 text-xs text-slate-500">Exactly the records used by this assessment (immutable snapshot). Supporting: {roleRows('SUPPORTING').length}, contradictory: {roleRows('CONTRADICTORY').length}, context: {roleRows('CONTEXT').length}.</p>
          <Table>
            <thead><tr><Th>Evidence record</Th><Th>Role</Th><Th>Relation to formulation</Th><Th>Status</Th><Th>ID</Th></tr></thead>
            <tbody>{a.evidence.map((e) => (
              <tr key={e.evidenceId}>
                <Td className="max-w-md"><button onClick={() => setOpenEvidence(e.evidenceId)} className="cursor-pointer text-left font-medium text-teal-800 hover:underline">{e.evidence.title}</button></Td>
                <Td><Badge tone={e.role === 'SUPPORTING' ? 'green' : e.role === 'CONTRADICTORY' ? 'red' : 'neutral'}>{humanize(e.role)}</Badge></Td>
                <Td><div className="flex flex-wrap gap-1"><ScopeBadge scope={e.evidence.scope} /><span className="text-xs text-slate-500">{humanize(relations.get(e.evidenceId)?.relation)}</span></div></Td>
                <Td><VerificationBadge status={e.evidence.status} /></Td>
                <Td className="font-mono text-[11px] text-slate-400">{e.evidenceId.slice(0, 8)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        </Section>

        <Section title="Assessed formulation (snapshot)">
          <p className="mb-2 text-xs text-slate-500">Frozen at assessment time; later edits to ingredients or evidence never change this report.</p>
          <Table>
            <thead><tr><Th>Ingredient</Th><Th>INCI</Th><Th>Concentration</Th></tr></thead>
            <tbody>{a.formulationSnapshot.ingredients.map((i) => <tr key={i.inciName}><Td>{i.name}</Td><Td className="text-slate-600">{i.inciName}</Td><Td>{i.percentage}%</Td></tr>)}</tbody>
          </Table>
        </Section>

        {/* Human decision, kept visibly separate from the AI recommendation */}
        <Card className="border-teal-200">
          <CardHeader><CardTitle>Human evaluator decision</CardTitle><DecisionBadge decision={a.reviewDecision} /></CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 text-sm"><span className="text-slate-500">AI recommendation (advisory only):</span><VerdictBadge verdict={a.verdict} /></div>
            {a.reviewDecision !== 'PENDING' && (
              <div className="rounded-md border border-slate-200 p-3 text-sm">
                <p><strong>{humanize(a.reviewDecision)}</strong> by {humanize(a.reviewedBy)} on {formatDate(a.reviewedAt)}</p>
                {a.reviewComments && <p className="mt-1 text-slate-700">{a.reviewComments}</p>}
              </div>
            )}
            <p className="text-xs text-slate-500">The AI never approves a claim. Only a human evaluator decision changes the claim's approval state, and it is not legal or regulatory approval.</p>
            <label className="block space-y-1"><span className="text-xs font-medium text-slate-700">Evaluator comments (required to reject or request evidence)</span>
              <Textarea value={comments} onChange={(e) => setComments(e.target.value)} disabled={!canReview} /></label>
            <FormError message={error2} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canReview} loading={busy === 'APPROVED'} onClick={() => decide('APPROVED')}>Approve</Button>
              <Button variant="secondary" disabled={!canReview} loading={busy === 'MORE_EVIDENCE_REQUESTED'} onClick={() => decide('MORE_EVIDENCE_REQUESTED')}>Request additional evidence</Button>
              <Button variant="danger" disabled={!canReview} loading={busy === 'REJECTED'} onClick={() => decide('REJECTED')}>Reject</Button>
            </div>
            {!canReview && <p className="text-xs text-amber-800">Switch the demo persona to Evaluator to record a decision (demo gating, not real authorisation).</p>}
          </CardBody>
        </Card>
      </div>
      <EvidenceDetailDialog evidenceId={openEvidence} onClose={() => setOpenEvidence(null)} />
    </>
  );
}
