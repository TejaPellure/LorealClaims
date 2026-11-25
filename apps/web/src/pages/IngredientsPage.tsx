import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Table, TableSkeleton, Td, Th } from '@/components/ui/primitives';
import { VerificationBadge } from '@/components/badges';
import { EvidenceDetailDialog, FilterBar, PageHeader, Pager } from '@/components/shared';
import { IngredientFormDialog, IngredientProfileDialog } from '@/features/ingredients/IngredientDialogs';
import { useAsync, useDebounced } from '@/hooks/hooks';
import { humanize, INGREDIENT_CATEGORIES } from '@/lib/lib';
import { api } from '@/services/api';
import type { Ingredient, Paged } from '@/types';

export default function IngredientsPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; ingredient: Ingredient | null }>({ open: false, ingredient: null });
  const search = useDebounced(q);

  const { data, loading, error, reload } = useAsync(
    () => api.get<Paged<Ingredient>>('/ingredients', { q: search, category, status, page, pageSize: 15 }),
    [search, category, status, page],
  );

  return (
    <>
      <PageHeader eyebrow="Library" title="Ingredients" description="Every ingredient you can formulate with. Only source-backed facts are marked Verified." actions={<Button onClick={() => setForm({ open: true, ingredient: null })}><Plus className="h-4 w-4" />Add ingredient</Button>} />
      <Card>
        <FilterBar>
          <Field label="Search" className="w-64"><Input placeholder="Name, INCI or function" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></Field>
          <Field label="Category" className="w-44">
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{INGREDIENT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>
          </Field>
          <Field label="Status" className="w-40">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Not verified</option></Select>
          </Field>
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? (
          <EmptyState title="No ingredients match" description="Adjust the filters or add a new ingredient." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Ingredient</Th><Th>INCI name</Th><Th>Primary functionality</Th><Th>Category</Th><Th>Evidence</Th><Th>Status</Th></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setProfileId(i.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setProfileId(i.id)}>
                    <Td className="font-medium">{i.name}</Td><Td className="text-slate-600">{i.inciName}</Td><Td>{i.primaryFunction}</Td>
                    <Td><Badge>{humanize(i.category)}</Badge></Td><Td>{i.evidenceCount}</Td><Td><VerificationBadge status={i.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <IngredientProfileDialog
        ingredientId={profileId} onClose={() => setProfileId(null)} onOpenEvidence={setEvidenceId}
        onEdit={(ingredient) => { setProfileId(null); setForm({ open: true, ingredient }); }}
      />
      <IngredientFormDialog open={form.open} ingredient={form.ingredient} onClose={() => setForm({ open: false, ingredient: null })} onSaved={reload} />
      <EvidenceDetailDialog evidenceId={evidenceId} onClose={() => setEvidenceId(null)} />
    </>
  );
}
