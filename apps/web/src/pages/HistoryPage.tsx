import { ArrowRight, Minus, Plus, Replace } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DecisionBadge, ProviderBadge, VerdictBadge } from '@/components/badges';
import { FilterBar, PageHeader, Pager } from '@/components/shared';
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, Field, Input, Select, Skeleton, Table, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from '@/components/ui/primitives';
import { useAsync, useDebounced } from '@/hooks/hooks';
import { formatDate, VERDICT_LABEL } from '@/lib/lib';
import { api } from '@/services/api';
import type { AssessmentSummary, Formulation, Paged, Product, VersionComparison } from '@/types';

function AssessmentsTable() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [verdict, setVerdict] = useState('');
  const [reviewDecision, setReview] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const { data, loading, error, reload } = useAsync(
    () => api.get<Paged<AssessmentSummary>>('/assessments', { q: search, verdict, reviewDecision, page, pageSize: 15 }),
    [search, verdict, reviewDecision, page],
  );
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <Card>
      <FilterBar>
        <Field label="Search" className="w-64"><Input placeholder="Claim or product" value={q} onChange={(e) => reset(setQ)(e.target.value)} /></Field>
        <Field label="AI verdict" className="w-44"><Select value={verdict} onChange={(e) => reset(setVerdict)(e.target.value)}><option value="">All verdicts</option>{Object.entries(VERDICT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Evaluator decision" className="w-56"><Select value={reviewDecision} onChange={(e) => reset(setReview)(e.target.value)}><option value="">All</option><option value="PENDING">Awaiting evaluator</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="MORE_EVIDENCE_REQUESTED">More evidence requested</option></Select></Field>
      </FilterBar>
      {loading && !data ? <TableSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyState title="No assessments found" description="Run an assessment from the Claims page." />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Product</Th><Th>Version</Th><Th>Claim</Th><Th>AI verdict</Th><Th>Score</Th><Th>Date</Th><Th>Evaluator decision</Th><Th>Source</Th></tr></thead>
            <tbody>{data.items.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/assessments/${a.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/assessments/${a.id}`)}>
                <Td className="font-medium">{a.claim.product.name}</Td><Td>v{a.formulation.version}</Td><Td className="max-w-sm">{a.claim.title}</Td>
                <Td><VerdictBadge verdict={a.verdict} /></Td><Td>{a.evidenceScore}/100</Td><Td className="whitespace-nowrap">{formatDate(a.createdAt)}</Td>
                <Td><DecisionBadge decision={a.reviewDecision} /></Td><Td><ProviderBadge provider={a.provider} /></Td>
              </tr>
            ))}</tbody>
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

const ChangeList = ({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone: 'green' | 'red' | 'amber'; children: React.ReactNode }) => (
  <div><h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Badge tone={tone}>{icon}</Badge>{title}</h3>{children}</div>
);

function VersionComparisonView({ comparison: c }: { comparison: VersionComparison }) {
  const none = <p className="text-sm text-slate-500">None</p>;
  const assessmentCell = (a: VersionComparison['latestAssessment']) => a
    ? <Link to={`/assessments/${a.id}`} className="flex items-center gap-2 text-sm hover:underline"><VerdictBadge verdict={a.verdict} />{a.evidenceScore}/100 <span className="text-xs text-slate-500">{formatDate(a.createdAt)}</span></Link>
    : <span className="text-sm text-slate-500">No assessment</span>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <ChangeList icon={<Plus className="h-3 w-3" />} title="Added ingredients" tone="green">{c.added.length ? <ul className="text-sm">{c.added.map((i) => <li key={i.ingredient}>{i.ingredient} - {i.percentage}%</li>)}</ul> : none}</ChangeList>
        <ChangeList icon={<Minus className="h-3 w-3" />} title="Removed ingredients" tone="red">{c.removed.length ? <ul className="text-sm">{c.removed.map((i) => <li key={i.ingredient}>{i.ingredient} - {i.percentage}%</li>)}</ul> : none}</ChangeList>
        <ChangeList icon={<Replace className="h-3 w-3" />} title="Concentration changes" tone="amber">{c.changed.length ? <ul className="text-sm">{c.changed.map((i) => <li key={i.ingredient}>{i.ingredient}: {i.from}% <ArrowRight className="inline h-3 w-3" /> {i.to}%</li>)}</ul> : none}</ChangeList>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChangeList icon={<Plus className="h-3 w-3" />} title={`Evidence gained in v${c.to.version}`} tone="green">{c.evidence.gained.length ? <ul className="text-sm">{c.evidence.gained.map((e) => <li key={e.id} className="line-clamp-2">{e.title}</li>)}</ul> : none}</ChangeList>
        <ChangeList icon={<Minus className="h-3 w-3" />} title={`Evidence no longer reachable from v${c.to.version}`} tone="red">{c.evidence.lost.length ? <ul className="text-sm">{c.evidence.lost.map((e) => <li key={e.id} className="line-clamp-2">{e.title}</li>)}</ul> : none}</ChangeList>
      </div>
      <p className="text-xs text-slate-500">{c.evidence.unchangedCount} evidence record(s) are reachable from both versions. Finished-product studies only follow the exact version they tested.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3"><p className="mb-1 text-xs font-semibold uppercase text-slate-500">v{c.from.version} - previous assessment</p>{assessmentCell(c.previousAssessment)}</div>
        <div className="rounded-md border border-slate-200 p-3"><p className="mb-1 text-xs font-semibold uppercase text-slate-500">v{c.to.version} - latest assessment</p>{assessmentCell(c.latestAssessment)}</div>
      </div>
    </div>
  );
}

function VersionComparisonTab() {
  const products = useAsync(() => api.get<Paged<Product>>('/products', { pageSize: 100 }));
  const [productId, setProductId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const selected = productId || products.data?.items[0]?.id || '';
  const versions = useAsync(() => (selected ? api.get<Formulation[]>(`/products/${selected}/formulations`) : Promise.resolve([])), [selected]);
  const ordered = [...(versions.data ?? [])].sort((a, b) => a.version - b.version);
  const from = fromId || ordered[0]?.id || '';
  const to = toId || ordered[ordered.length - 1]?.id || '';
  const comparison = useAsync(() => (from && to && from !== to ? api.get<VersionComparison>('/formulations/compare', { from, to }) : Promise.resolve(null)), [from, to]);

  return (
    <Card>
      <CardHeader><CardTitle>Compare formulation versions</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Field label="Product" className="w-56"><Select value={selected} onChange={(e) => { setProductId(e.target.value); setFromId(''); setToId(''); }}>{products.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="From version" className="w-36"><Select value={from} onChange={(e) => setFromId(e.target.value)}>{ordered.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}</Select></Field>
          <Field label="To version" className="w-36"><Select value={to} onChange={(e) => setToId(e.target.value)}>{ordered.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}</Select></Field>
        </div>
        {versions.loading ? <Skeleton className="h-24 w-full" /> : ordered.length < 2 ? <EmptyState title="Only one version" description="Save another version in the Formulation Studio to compare." /> :
          comparison.loading ? <Skeleton className="h-40 w-full" /> : comparison.error ? <ErrorState message={comparison.error} onRetry={comparison.reload} /> :
          comparison.data ? <VersionComparisonView comparison={comparison.data} /> : <EmptyState title="Choose two different versions" />}
      </CardBody>
    </Card>
  );
}

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Assessment History" description="Every assessment is preserved with the exact claim, formulation and evidence it used, even when records change later." />
      <Tabs defaultValue="assessments">
        <TabsList><TabsTrigger value="assessments">Assessments</TabsTrigger><TabsTrigger value="versions">Formulation versions</TabsTrigger></TabsList>
        <TabsContent value="assessments"><AssessmentsTable /></TabsContent>
        <TabsContent value="versions"><VersionComparisonTab /></TabsContent>
      </Tabs>
    </>
  );
}
