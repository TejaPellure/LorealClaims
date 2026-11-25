import { FileText, Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { QualityBadge, ScopeBadge, VerificationBadge } from '@/components/badges';
import { EvidenceDetailDialog, FilterBar, PageHeader, Pager } from '@/components/shared';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Table, TableSkeleton, Td, Th } from '@/components/ui/primitives';
import { EvidenceFormDialog } from '@/features/evidence/EvidenceForm';
import { useAsync, useDebounced } from '@/hooks/hooks';
import { EVIDENCE_TYPES, formatDate, humanize } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Evidence, Paged } from '@/types';

/** Per-row PDF upload (stored on the persistent uploads volume by the server). */
function UploadButton({ evidence, onDone }: { evidence: Evidence; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onPick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await api.upload(`/evidence/${evidence.id}/upload`, file);
      toast.success('PDF uploaded');
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <input ref={input} type="file" accept="application/pdf" className="sr-only" aria-label={`Upload PDF for ${evidence.title}`} onChange={(e) => onPick(e.target.files?.[0])} />
      <Button variant="ghost" size="sm" loading={busy} onClick={(e) => { e.stopPropagation(); input.current?.click(); }} title="Upload PDF report"><Upload className="h-4 w-4" /></Button>
    </>
  );
}

export default function EvidencePage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [evidenceType, setEvidenceType] = useState('');
  const [scope, setScope] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useAsync(
    () => api.get<Paged<Evidence>>('/evidence', { q: search, evidenceType, scope, status, page, pageSize: 15 }),
    [search, evidenceType, scope, status, page],
  );
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="Evidence Library"
        description="Reusable scientific evidence linked to ingredients and formulation versions. Ingredient-level and finished-product studies are kept distinct."
        actions={<Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Add evidence</Button>}
      />
      <Card>
        <FilterBar>
          <Field label="Search" className="w-64"><Input placeholder="Title, source or tested subject" value={q} onChange={(e) => reset(setQ)(e.target.value)} /></Field>
          <Field label="Evidence type" className="w-52"><Select value={evidenceType} onChange={(e) => reset(setEvidenceType)(e.target.value)}><option value="">All types</option>{EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
          <Field label="Scope" className="w-44"><Select value={scope} onChange={(e) => reset(setScope)(e.target.value)}><option value="">All scopes</option><option value="INGREDIENT">Ingredient level</option><option value="FINISHED_PRODUCT">Finished product</option></Select></Field>
          <Field label="Verification" className="w-40"><Select value={status} onChange={(e) => reset(setStatus)(e.target.value)}><option value="">All</option><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Unverified</option><option value="DEMO">Demo</option></Select></Field>
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No evidence found" description="Adjust the filters or add an evidence record." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Study</Th><Th>Type</Th><Th>Scope</Th><Th>Quality</Th><Th>Ingredients</Th><Th>Date</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailId(e.id)} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && setDetailId(e.id)}>
                    <Td className="max-w-md"><p className="line-clamp-2 font-medium">{e.title}</p><p className="text-xs text-slate-500">{e.sourceName}</p></Td>
                    <Td><Badge>{humanize(e.evidenceType)}</Badge></Td>
                    <Td><ScopeBadge scope={e.scope} /></Td>
                    <Td><QualityBadge quality={e.quality} /></Td>
                    <Td className="max-w-48 text-xs text-slate-600">{e.ingredientLinks?.map((l) => l.ingredient.name).join(', ') || '-'}</Td>
                    <Td className="whitespace-nowrap">{formatDate(e.publishedAt)}</Td>
                    <Td><VerificationBadge status={e.status} /></Td>
                    <Td className="whitespace-nowrap">{e.documents?.length ? <FileText className="inline h-4 w-4 text-teal-700" aria-label="PDF attached" /> : null}<UploadButton evidence={e} onDone={reload} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <EvidenceDetailDialog evidenceId={detailId} onClose={() => setDetailId(null)} />
      <EvidenceFormDialog open={formOpen} onClose={() => setFormOpen(false)} onSaved={reload} />
    </>
  );
}
