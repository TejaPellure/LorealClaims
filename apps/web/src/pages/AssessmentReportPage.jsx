import { ArrowLeft, ChevronDown, Info, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ScopeBadge, VerificationBadge } from '@/components/badges';
import { BulletList, EvidenceDetailDialog } from '@/components/shared';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Skeleton, Table, Td, Th, Tooltip } from '@/components/ui/primitives';
import { useAsync } from '@/hooks/hooks';
import { benefitLabel, cn, formatDate, humanize, VERDICT_LABEL } from '@/lib/lib';
import { api, errorText } from '@/services/api';

const VERDICT_STYLE = {
  SUPPORTED: { text: 'text-sage', ring: '#5f7f68', blurb: 'The evidence backs this claim as written.', next: 'You can use this wording, subject to your own regulatory review.' },
  NOT_SUPPORTED: { text: 'text-brick', ring: '#a4363b', blurb: 'The evidence does not back this claim.', next: 'Change the claim or the formula, or test the product for this benefit.' },
  INCONCLUSIVE: { text: 'text-clay', ring: '#b2762a', blurb: 'There is not enough evidence to say yes or no.', next: 'Add evidence for this exact formula, then evaluate again.' },
};

const ID_PATTERN = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\b/g;

/** Circular score gauge. The score shows how well the evidence fits the claim; it is not a probability. */
function ScoreRing({ score, color }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Evidence strength ${score} out of 100`}>
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

const Section = ({ title, children, className }) => (
  <Card className={className}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardBody>{children}</CardBody></Card>
);

/** Removes internal evidence ids from text meant for non-scientists. */
const plain = (text) => text.replace(/\\n/g, '\n').replace(ID_PATTERN, '').replace(/\(\s*(?:ids?\s*)?[,;\s]*\)/gi, '').replace(/\s+([,.;:)])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();

export default function AssessmentReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: a, loading, error, reload } = useAsync(() => api.get(`/assessments/${id}`), [id]);
  const history = useAsync(() => (a ? api.get(`/claims/${a.claim.id}/assessments`) : Promise.resolve([])), [a?.claim.id]);
  const [openEvidence, setOpenEvidence] = useState(null);
  const [showScience, setShowScience] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  if (loading && !a) return <Skeleton className="h-96 w-full" />;
  if (error || !a) return <Card><ErrorState message={error ?? 'Assessment not found'} onRetry={reload} /></Card>;

  const style = VERDICT_STYLE[a.verdict];
  const claim = a.claim;
  const titles = new Map(a.evidence.map((e) => [e.evidenceId, e.evidence.title]));
  const relations = new Map(a.evidenceSnapshot.map((e) => [e.id, e.relation]));
  const numbers = new Map(a.evidence.map((e, i) => [e.evidenceId, i + 1]));
  const studiesUsed = a.evidence.filter((e) => e.role !== 'CONTEXT').length || a.evidence.length;

  /** Technical view only: turns evidence ids in Claude's prose into clickable numbered citations. */
  const withCitations = (raw) => {
    const text = raw.replace(/\\n/g, '\n');
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(ID_PATTERN)) {
      const evidenceId = [...numbers.keys()].find((eid) => eid.startsWith(match[0]));
      if (!evidenceId) continue;
      parts.push(text.slice(last, match.index));
      parts.push(<button key={`${match.index}-${evidenceId}`} className="mx-0.5 cursor-pointer rounded-full bg-teal-50 px-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100" onClick={() => setOpenEvidence(evidenceId)} aria-label={`Open study ${numbers.get(evidenceId)}`}>[{numbers.get(evidenceId)}]</button>);
      last = match.index + match[0].length;
    }
    parts.push(text.slice(last));
    return parts;
  };

  const rerun = async () => {
    setRerunning(true);
    try {
      const fresh = await api.post('/claims/assess', { claimId: claim.id, forceNew: true });
      toast.success('Claude has evaluated this claim again. The earlier result is kept.');
      navigate(`/assessments/${fresh.id}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRerunning(false);
    }
  };

  const NoteList = ({ notes, empty }) =>
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

  const supports = a.aiResult.strengths.map(plain).filter(Boolean).slice(0, 4);
  const gaps = (a.missingEvidence.length ? a.missingEvidence : a.aiResult.limitations).map(plain).filter(Boolean).slice(0, 4);
  const nextSteps = a.recommendedTests.map(plain).filter(Boolean).slice(0, 3);

  return (
    <>
      <Link to="/claims" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />All claims</Link>

      {/* 1. The answer */}
      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-10">
        <p className="eyebrow mb-3">Result · {claim.product.name}</p>
        <div className="flex flex-wrap items-center justify-between gap-8">
          <div className="min-w-0 max-w-3xl">
            <p className="font-display text-2xl italic text-slate-600">“{claim.title}”</p>
            <h1 className={`mt-4 font-display text-6xl font-semibold leading-none sm:text-7xl ${style.text}`}>{VERDICT_LABEL[a.verdict]}</h1>
            <p className="mt-4 max-w-xl text-lg text-slate-700">{style.blurb}</p>
            {claim.benefits.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{claim.benefits.map((b) => <Badge key={b} tone="teal">{benefitLabel(b)}</Badge>)}</div>}
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={a.evidenceScore} color={style.ring} />
            <div className="max-w-[10rem] text-sm text-slate-600">
              <p className="flex items-center gap-1 font-medium text-slate-900">Evidence strength
                <Tooltip content={a.scoreExplanation ? `${plain(a.scoreExplanation)} This is Claude's rating of how well the studies back the claim. It is a guide, not the chance that the claim is true.` : "Claude's rating of how well the studies back the claim. A guide, not the chance that the claim is true."}><Info className="h-3.5 w-3.5 cursor-help text-slate-400" aria-label="About this score" /></Tooltip>
              </p>
              <p className="mt-1 text-xs">Based on {studiesUsed} stud{studiesUsed === 1 ? 'y' : 'ies'}.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. The formula, right under the verdict */}
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
          <span className="text-sm font-medium text-slate-900">Formula tested</span>
          <ul className="flex flex-wrap gap-2 text-sm">
            {a.formulationSnapshot.ingredients.map((i) => <li key={i.inciName} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{i.name} <strong>{i.percentage}%</strong></li>)}
          </ul>
        </CardBody>
      </Card>

      {/* 3. Plain-language explanation */}
      <div className="space-y-6">
        <Section title="In short">
          <p className="text-base leading-relaxed text-slate-800">{plain(a.summary)}</p>
          {a.scoreExplanation && <p className="mt-3 text-sm text-slate-600"><strong className="text-slate-900">Why {a.evidenceScore}/100:</strong> {plain(a.scoreExplanation)}</p>}
          <p className="mt-2 text-sm text-slate-600"><strong className="text-slate-900">What to do:</strong> {style.next}</p>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="What backs it up"><BulletList items={supports} empty="Nothing in the library clearly backs this claim." /></Section>
          <Section title="What is missing"><BulletList items={gaps} empty="No gaps were found." /></Section>
        </div>
        {nextSteps.length > 0 && <Section title="Suggested next steps"><BulletList items={nextSteps} empty="" /></Section>}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            Evaluated by Claude on {formatDate(a.createdAt)}
            {history.data && history.data.length > 1 && (
              <> · Earlier: {history.data.filter((h) => h.id !== a.id).map((h) => (
                <Link key={h.id} to={`/assessments/${h.id}`} className="mr-3 text-teal-700 hover:underline">{VERDICT_LABEL[h.verdict]} · {formatDate(h.createdAt)}</Link>
              ))}</>
            )}
          </div>
          <Button variant="secondary" loading={rerunning} onClick={rerun}><RefreshCw className="h-4 w-4" />Evaluate again</Button>
        </div>

        {/* 4. Everything technical, collapsed */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setShowScience((open) => !open)} aria-expanded={showScience}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left">
            <span>
              <span className="font-display text-lg font-semibold text-slate-900">The science behind this result</span>
              <span className="block text-sm text-slate-500">Claude's full reasoning and the studies it looked at. For scientists and evaluators.</span>
            </span>
            <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-500 transition-transform', showScience && 'rotate-180')} aria-hidden />
          </button>

          {showScience && (
            <div className="space-y-6 border-t border-slate-100 p-5">
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Claude's reasoning</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{withCitations(a.reasoning)}</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="All strengths"><BulletList items={a.aiResult.strengths.map(plain)} empty="None listed." /></Section>
                <Section title="All limitations"><BulletList items={a.aiResult.limitations.map(plain)} empty="None listed." /></Section>
                <Section title="Studies of single ingredients">
                  <p className="mb-3 text-xs text-slate-500">These do not by themselves prove the finished formula works.</p>
                  <NoteList notes={a.aiResult.ingredientEvidenceAnalysis} empty="None were relevant." />
                </Section>
                <Section title="Studies of finished products"><NoteList notes={a.aiResult.formulationEvidenceAnalysis} empty="None were relevant." /></Section>
                <Section title="Studies that disagree or showed no effect"><NoteList notes={a.aiResult.contradictoryEvidence} empty="None found." /></Section>
                <Section title="All gaps and tests"><BulletList items={[...a.missingEvidence, ...a.recommendedTests].map(plain)} empty="None listed." /></Section>
              </div>

              <Section title="Studies Claude looked at">
                <p className="mb-3 text-xs text-slate-500">All relevant studies for the ingredients in this formula. Claude decided how each one counts.</p>
                <Table>
                  <thead><tr><Th>#</Th><Th>Study</Th><Th>How it was used</Th><Th>Type</Th><Th>Status</Th></tr></thead>
                  <tbody>{a.evidence.map((e, i) => (
                    <tr key={e.evidenceId}>
                      <Td className="text-slate-500">[{i + 1}]</Td>
                      <Td className="max-w-lg"><button onClick={() => setOpenEvidence(e.evidenceId)} className="cursor-pointer text-left font-medium text-teal-800 hover:underline">{e.evidence.title}</button></Td>
                      <Td><Badge tone={e.role === 'SUPPORTING' ? 'green' : e.role === 'CONTRADICTORY' ? 'red' : 'neutral'}>{e.role === 'SUPPORTING' ? 'Supports' : e.role === 'CONTRADICTORY' ? 'Disagrees' : 'Background'}</Badge></Td>
                      <Td><div className="flex flex-wrap items-center gap-1"><ScopeBadge scope={e.evidence.scope} /><span className="text-xs text-slate-500">{humanize(relations.get(e.evidenceId))}</span></div></Td>
                      <Td><VerificationBadge status={e.evidence.status} /></Td>
                    </tr>
                  ))}</tbody>
                </Table>
              </Section>
            </div>
          )}
        </div>
      </div>
      <EvidenceDetailDialog evidenceId={openEvidence} onClose={() => setOpenEvidence(null)} />
    </>
  );
}
