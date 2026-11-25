import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ClaimStatusBadge, DecisionBadge, VerdictBadge } from '@/components/badges';
import { FilterBar, PageHeader, Pager } from '@/components/shared';
import { Button, Card, Dialog, EmptyState, ErrorState, Field, Input, Select, Table, TableSkeleton, Td, Th } from '@/components/ui/primitives';
import { ClaimDetailDialog } from '@/features/claims/ClaimDetailDialog';
import { ClaimForm } from '@/features/claims/ClaimForm';
import { useAsync, useDebounced } from '@/hooks/hooks';
import { formatDate, humanize } from '@/lib/lib';
import { api } from '@/services/api';
import type { Claim, ClaimStatus, Paged, Product } from '@/types';

const STATUSES: ClaimStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_MANAGER_REVIEW', 'ACCEPTED_FOR_FORMULATION', 'FORMULATION_IN_PROGRESS', 'AWAITING_EVIDENCE', 'READY_FOR_ASSESSMENT', 'ASSESSED', 'APPROVED_BY_EVALUATOR', 'REQUIRES_MORE_EVIDENCE', 'REJECTED'];

export default function ClaimsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const search = useDebounced(q);
  const { data, loading, error, reload } = useAsync(() => api.get<Paged<Claim>>('/claims', { q: search, status, page, pageSize: 15 }), [search, status, page]);
  const products = useAsync(() => api.get<Paged<Product>>('/products', { pageSize: 100 }));

  return (
    <>
      <PageHeader
        title="Claims Assessment"
        description="Track each proposed claim through the workflow, from business proposal to evaluator decision. Open a claim to take workflow actions or run the AI assessment."
        actions={<Button onClick={() => setCreating(true)} disabled={!products.data?.items.length}><Plus className="h-4 w-4" />New claim</Button>}
      />
      <Card>
        <FilterBar>
          <Field label="Search" className="w-64"><Input placeholder="Claim or product" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></Field>
          <Field label="Status" className="w-64"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No claims found" description="Create a claim from here or from the Formulation Studio." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Claim</Th><Th>Product</Th><Th>Version</Th><Th>Workflow status</Th><Th>AI verdict</Th><Th>Evaluator</Th><Th>Updated</Th></tr></thead>
              <tbody>
                {data.items.map((c) => {
                  const latest = c.assessments[0];
                  return (
                    <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(c.id)}>
                      <Td className="max-w-sm font-medium">{c.title}</Td><Td>{c.product.name}</Td><Td>{c.formulation ? `v${c.formulation.version}` : '-'}</Td>
                      <Td><ClaimStatusBadge status={c.status} /></Td>
                      <Td>{latest ? <span className="flex items-center gap-2"><VerdictBadge verdict={latest.verdict} />{latest.evidenceScore}</span> : '-'}</Td>
                      <Td>{latest ? <DecisionBadge decision={latest.reviewDecision} /> : '-'}</Td>
                      <Td className="whitespace-nowrap">{formatDate(c.updatedAt)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <ClaimDetailDialog claimId={openId} onClose={() => setOpenId(null)} onChanged={reload} />
      <Dialog open={creating} onOpenChange={setCreating} title="New claim" description="Structured fields are stored separately from the claim text so they can be assessed." wide>
        {creating && products.data && <ClaimForm products={products.data.items} onCreated={() => { setCreating(false); reload(); }} />}
      </Dialog>
    </>
  );
}
