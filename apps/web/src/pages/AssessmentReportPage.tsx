import { ArrowLeft, Info, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ScopeBadge, VerificationBadge } from '@/components/badges';
import { BulletList, EvidenceDetailDialog } from '@/components/shared';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Skeleton, Table, Td, Th, Tooltip } from '@/components/ui/primitives';
import { useAsync } from '@/hooks/hooks';
import { benefitLabel, formatDate, humanize, VERDICT_LABEL } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Assessment, AssessmentSummary, EvidenceNote, Verdict } from '@/types';

const VERDICT_STYLE: Record<Verdict, { text: string; ring: string; blurb: string }> = {
  SUPPORTED: { text: 'text-sage', ring: '#5f7f68', blurb: 'The available evidence supports this claim as worded.' },
  NOT_SUPPORTED: { text: 'text-brick', ring: '#a4363b', blurb: 'The available evidence contradicts this claim or does not reach its size.' },
  INCONCLUSIVE: { text: 'text-clay', ring: '#b2762a', blurb: 'The available evidence is not enough to decide either way.' },
};

/** Circular score gauge. The score is a rubric of evidence fit, not a probability. */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Evidence sufficiency score ${score} out of 100`}>
      <svg viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#e8ddd2" strokeWidth="9" />
        <circle cx="64" cy="64" r={radius} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-semibold text-slate-900">{score}</span>
        <span className="text-[11px] uppercase tracking-widest text-slate-500">of 100</span>
      </div>
    </div>
  );
}

const ID_PATTERN = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\b/g;

const Section = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <Card className={className}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardBody>{children}</CardBody></Card>
);

export default function AssessmentReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: a, loading, error, reload } = useAsync(() => api.get<Assessment>(`/assessments/${id}`), [id]);
  const history = useAsync(() => (a ? api.get<AssessmentSummary[]>(`/claims/${a.claim.id}/assessments`) : Promise.resolve([])), [a?.claim.id]);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  if (loading && !a) return <Skeleton className="h-96 w-full" />;
  if (error || !a) return <Card><ErrorState message={error ?? 'Assessment not found'} onRetry={reload} /></Card>;

  const style = VERDICT_STYLE[a.verdict];
  const titles = new Map(a.evidence.map((e) => [e.evidenceId, e.evidence.title]));
  const relations = new Map(a.evidenceSnapshot.map((e) => [e.id, e.relation]));
  const claim = a.claim;

  const numbers = new Map(a.evidence.map((e, i) => [e.evidenceId, i + 1]));
  /** Replaces evidence ids in Claude's prose with clickable numbered citations. */
  const withCitations = (raw: string): ReactNode[] => {
    const text = raw.replace(/\\n/g, String.fromCharCode(10)); // older saved results may contain a literal backslash-n
    const parts: ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(ID_PATTERN)) {
      const evidenceId = [...numbers.keys()].find((id) => id.startsWith(match[0]));
      if (!evidenceId) continue;
      parts.push(text.slice(last, match.index));
      parts.push(<button key={`${match.index}-${evidenceId}`} className="mx-0.5 cursor-pointer rounded-full bg-teal-50 px-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100" onClick={() => setOpenEvidence(evidenceId)} aria-label={`Open study ${numbers.get(evidenceId)}`}>[{numbers.get(evidenceId)}]</button>);
      last = match.index! + match[0].length;
    }
    parts.push(text.slice(last));
    return parts;
  };

  const rerun = async () => {
    setRerunning(true);
    try {
      const fresh = await api.post<Assessment>('/claims/assess', { claimId: claim.id, forceNew: true });
      toast.success('Claude has evaluated this claim again. The earlier result is kept.');
      navigate(`/assessments/${fresh.id}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRerunning(false);
    }
  };

  const NoteList = ({ notes, empty }: { notes: EvidenceNote[]; empty: string }) =>
    notes.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.evidenceId} className="rounded-xl border border-slate-200 p-3 text-sm">
            <button className="cursor-pointer text-left font-medium text-teal-800 hover:underline" onClick={() => setOpenEvidence(n.evidenceId)}>{titles.get(n.evidenceId) ?? n.evidenceId}</button>
            <p className="mt-1 text-slate-700">{withCitations(n.note)}</p>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <Link to="/claims" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />All claims</Link>

      {/* Verdict hero */}
      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-10">
        <p className="eyebrow mb-3">Step 3 of 3 · Result · {a.claim.product.name}</p>
        <div className="flex flex-wrap items-center justify-between gap-8">
          <div className="min-w-0 max-w-3xl">
            <p className="font-display text-2xl italic text-slate-600">“{claim.title}”</p>
            <h1 className={`mt-4 font-display text-6xl font-semibold leading-none sm:text-7xl ${style.text}`}>{VERDICT_LABEL[a.verdict]}</h1>
            <p className="mt-4 max-w-xl text-lg text-slate-700">{style.blurb}</p>
            {claim.description && <p className="mt-3 max-w-2xl text-sm text-slate-600">{claim.description}</p>}
            {claim.benefits.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{claim.benefits.map((b) => <Badge key={b} tone="teal">{benefitLabel(b)}</Badge>)}</div>}
            <p className="mt-4 text-sm text-slate-500">Evaluated by Claude ({a.model}) on {formatDate(a.createdAt)}{claim.targetValue != null && ` · ${claim.targetValue}${claim.measurementUnit}`}{claim.durationWeeks != null && ` in ${claim.durationWeeks} weeks`}{claim.targetPopulation && ` · ${claim.targetPopulation}`}</p>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={a.evidenceScore} color={style.ring} />
            <div className="max-w-[10rem] text-sm text-slate-600">
              <p className="flex items-center gap-1 font-medium text-slate-900">Evidence sufficiency
                <Tooltip content="A transparent rubric of how well the available evidence matches the claim (quality, relevance, concentration, endpoint, duration, population, finished-product testing, consistency). It is not a probability that the claim is true."><Info className="h-3.5 w-3.5 cursor-help text-slate-400" aria-label="About this score" /></Tooltip>
              </p>
              <p className="mt-1 text-xs">Calculated by backend rules, separately from Claude's reasoning.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <Section title="Claude's assessment">
          <p className="text-base leading-relaxed text-slate-800">{withCitations(a.summary)}</p>
          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-slate-500">Reasoning</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{withCitations(a.reasoning)}</p>
          {a.guardrailNotes.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 font-medium">Adjusted by the scientific safeguards</p>
              <BulletList items={a.guardrailNotes} empty="" />
            </div>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Strengths"><BulletList items={a.aiResult.strengths} empty="No strengths identified." /></Section>
          <Section title="Limitations"><BulletList items={a.aiResult.limitations} empty="No limitations listed." /></Section>
          <Section title="Ingredient-level evidence">
            <p className="mb-3 text-xs text-slate-500">Studies of single ingredients do not by themselves prove the finished formula delivers the benefit.</p>
            <NoteList notes={a.aiResult.ingredientEvidenceAnalysis} empty="No ingredient-level evidence was available." />
          </Section>
          <Section title="Finished-product evidence"><NoteList notes={a.aiResult.formulationEvidenceAnalysis} empty="No finished-product evidence was available for this formula." /></Section>
          <Section title="Contradictory or neutral findings"><NoteList notes={a.aiResult.contradictoryEvidence} empty="No contradictory evidence found." /></Section>
          <Section title="Missing evidence"><BulletList items={a.missingEvidence} empty="No gaps identified." /></Section>
        </div>
        <Section title="Recommended next tests"><BulletList items={a.recommendedTests} empty="No additional tests recommended." /></Section>

        <Section title="How the score was calculated">
          <Table>
            <thead><tr><Th>Criterion</Th><Th>Weight</Th><Th>Match</Th><Th>Points</Th><Th>Why</Th></tr></thead>
            <tbody>{a.scoreBreakdown.breakdown.map((c) => (
              <tr key={c.key}><Td className="font-medium">{c.label}</Td><Td>{c.weight}</Td><Td>{Math.round(c.value * 100)}%</Td><Td>{c.points}</Td><Td className="text-slate-600">{c.explanation}</Td></tr>
            ))}</tbody>
          </Table>
          <p className="mt-3 text-xs text-slate-500">{a.scoreBreakdown.disclaimer}</p>
        </Section>

        <Section title="Evidence used">
          <p className="mb-3 text-xs text-slate-500">Exactly the records reviewed. Open any record to see its source.</p>
          <Table>
            <thead><tr><Th>#</Th><Th>Study</Th><Th>Role</Th><Th>Type</Th><Th>Status</Th></tr></thead>
            <tbody>{a.evidence.map((e, i) => (
              <tr key={e.evidenceId}>
                <Td className="text-slate-500">[{i + 1}]</Td>
                <Td className="max-w-lg"><button onClick={() => setOpenEvidence(e.evidenceId)} className="cursor-pointer text-left font-medium text-teal-800 hover:underline">{e.evidence.title}</button></Td>
                <Td><Badge tone={e.role === 'SUPPORTING' ? 'green' : e.role === 'CONTRADICTORY' ? 'red' : 'neutral'}>{humanize(e.role)}</Badge></Td>
                <Td><div className="flex flex-wrap items-center gap-1"><ScopeBadge scope={e.evidence.scope} /><span className="text-xs text-slate-500">{humanize(relations.get(e.evidenceId))}</span></div></Td>
                <Td><VerificationBadge status={e.evidence.status} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        </Section>

        <Section title="Formula assessed">
          <ul className="flex flex-wrap gap-2 text-sm">
            {a.formulationSnapshot.ingredients.map((i) => <li key={i.inciName} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{i.name} <strong>{i.percentage}%</strong></li>)}
          </ul>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="text-sm text-slate-600">
            {history.data && history.data.length > 1 && (
              <>Earlier evaluations of this claim: {history.data.filter((h) => h.id !== a.id).map((h) => (
                <Link key={h.id} to={`/assessments/${h.id}`} className="mr-3 text-teal-700 hover:underline">{VERDICT_LABEL[h.verdict]} · {formatDate(h.createdAt)}</Link>
              ))}</>
            )}
          </div>
          <Button variant="secondary" loading={rerunning} onClick={rerun}><RefreshCw className="h-4 w-4" />Evaluate again with Claude</Button>
        </div>
      </div>
      <EvidenceDetailDialog evidenceId={openEvidence} onClose={() => setOpenEvidence(null)} />
    </>
  );
}
