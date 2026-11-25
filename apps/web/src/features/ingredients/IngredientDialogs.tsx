import { ExternalLink, Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Dialog, ErrorState, Field, FormError, Input, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { ScopeBadge, VerificationBadge } from '@/components/badges';
import { BulletList, Detail } from '@/components/shared';
import { useAsync, useFormState } from '@/hooks/hooks';
import { formatDate, humanize, INGREDIENT_CATEGORIES } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Evidence, Ingredient } from '@/types';

/** Read-only ingredient profile with evidence and sources. Clearly separates sourced facts from unverified info. */
export function IngredientProfileDialog({ ingredientId, onClose, onEdit, onOpenEvidence }: {
  ingredientId: string | null; onClose: () => void; onEdit: (ingredient: Ingredient) => void; onOpenEvidence: (id: string) => void;
}) {
  const ingredient = useAsync(() => (ingredientId ? api.get<Ingredient>(`/ingredients/${ingredientId}`) : Promise.resolve(null)), [ingredientId]);
  const evidence = useAsync(() => (ingredientId ? api.get<Evidence[]>(`/ingredients/${ingredientId}/evidence`) : Promise.resolve([])), [ingredientId]);
  const data = ingredient.data;

  return (
    <Dialog open={!!ingredientId} onOpenChange={(open) => !open && onClose()} title={data?.name ?? 'Ingredient'} description={data?.inciName} wide>
      {ingredient.loading && !data && <Skeleton className="h-64 w-full" />}
      {ingredient.error && <ErrorState message={ingredient.error} onRetry={ingredient.reload} />}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <VerificationBadge status={data.status} /><Badge>{humanize(data.category)}</Badge>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => onEdit(data)}><Pencil className="h-4 w-4" />Edit</Button>
          </div>
          {data.status !== 'VERIFIED' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Not source-verified. Treat this profile as a general summary, not as a verified scientific or regulatory statement.
            </p>
          )}
          <dl>
            <Detail label="INCI name">{data.inciName}</Detail>
            <Detail label="Chemical name">{data.chemicalName}</Detail>
            <Detail label="Description">{data.description}</Detail>
            <Detail label="Primary function">{data.primaryFunction}</Detail>
            <Detail label="Applications">{data.commonApplications.join(', ')}</Detail>
            <Detail label="Reference range">
              {data.minConcentration != null || data.maxConcentration != null
                ? `${data.minConcentration ?? '-'} to ${data.maxConcentration ?? '-'} % (${data.concentrationSource ?? 'source not stated'}). A range is not proof of safety or efficacy.`
                : undefined}
            </Detail>
            <Detail label="Solubility">{data.solubility}</Detail>
            <Detail label="Compatibility">{data.compatibilityNotes}</Detail>
            <Detail label="Regulatory notes">{data.regulatoryNotes}</Detail>
            <Detail label="Created">{formatDate(data.createdAt)}</Detail>
            <Detail label="Updated">{formatDate(data.updatedAt)}</Detail>
          </dl>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Sources and references</h3>
            {data.sources.length ? (
              <ul className="space-y-1 text-sm">
                {data.sources.map((s) => (
                  <li key={s.name}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-teal-700 hover:underline">{s.name}<ExternalLink className="h-3 w-3" /></a> : s.name}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No sources attached.</p>}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Associated evidence ({evidence.data?.length ?? 0})</h3>
            {evidence.loading ? <Skeleton className="h-12 w-full" /> : evidence.data?.length ? (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {evidence.data.map((e) => (
                  <li key={e.id}>
                    <button className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onOpenEvidence(e.id)}>
                      <span className="line-clamp-2">{e.title}</span><span className="flex shrink-0 gap-1"><ScopeBadge scope={e.scope} /><VerificationBadge status={e.status} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <BulletList items={[]} empty="No evidence linked yet." />}
          </section>
        </div>
      )}
    </Dialog>
  );
}

const EMPTY = {
  name: '', inciName: '', chemicalName: '', description: '', category: 'ACTIVE', primaryFunction: '', commonApplications: '',
  minConcentration: '', maxConcentration: '', concentrationSource: '', solubility: '', compatibilityNotes: '', regulatoryNotes: '', sources: '', status: 'UNVERIFIED',
};

/** Create or edit an ingredient. Sources are entered one per line as "Name | URL". */
export function IngredientFormDialog({ open, ingredient, onClose, onSaved }: { open: boolean; ingredient: Ingredient | null; onClose: () => void; onSaved: () => void }) {
  const initial = ingredient
    ? {
        ...EMPTY, ...Object.fromEntries(Object.entries(ingredient).filter(([, v]) => typeof v === 'string' || typeof v === 'number')),
        commonApplications: ingredient.commonApplications.join(', '),
        sources: ingredient.sources.map((s) => `${s.name}${s.url ? ` | ${s.url}` : ''}`).join('\n'),
        minConcentration: ingredient.minConcentration ?? '', maxConcentration: ingredient.maxConcentration ?? '',
      }
    : EMPTY;
  return open ? <IngredientForm key={ingredient?.id ?? 'new'} initial={initial as typeof EMPTY} editingId={ingredient?.id} onClose={onClose} onSaved={onSaved} /> : null;
}

function IngredientForm({ initial, editingId, onClose, onSaved }: { initial: typeof EMPTY; editingId?: string; onClose: () => void; onSaved: () => void }) {
  const { values, bind } = useFormState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const optionalText = (v: unknown) => (String(v ?? '').trim() ? String(v).trim() : undefined);
    const optionalNumber = (v: unknown) => (String(v ?? '').trim() !== '' ? Number(v) : undefined);
    const body = {
      name: values.name, inciName: values.inciName, description: values.description, category: values.category, primaryFunction: values.primaryFunction, status: values.status,
      chemicalName: optionalText(values.chemicalName), concentrationSource: optionalText(values.concentrationSource), solubility: optionalText(values.solubility),
      compatibilityNotes: optionalText(values.compatibilityNotes), regulatoryNotes: optionalText(values.regulatoryNotes),
      minConcentration: optionalNumber(values.minConcentration), maxConcentration: optionalNumber(values.maxConcentration),
      commonApplications: String(values.commonApplications).split(',').map((s) => s.trim()).filter(Boolean),
      sources: String(values.sources).split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, url] = line.split('|').map((s) => s.trim());
        return url ? { name, url } : { name };
      }),
    };
    try {
      if (editingId) await api.patch(`/ingredients/${editingId}`, body);
      else await api.post('/ingredients', body);
      toast.success(editingId ? 'Ingredient updated' : 'Ingredient added');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={editingId ? 'Edit ingredient' : 'Add ingredient'} description="Only enter reference ranges or regulatory notes that a cited source supports." wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Ingredient name *"><Input required minLength={2} {...bind('name')} /></Field>
        <Field label="INCI name *"><Input required minLength={2} {...bind('inciName')} /></Field>
        <Field label="Chemical name"><Input {...bind('chemicalName')} /></Field>
        <Field label="Category *">
          <Select {...bind('category')}>{INGREDIENT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>
        </Field>
        <Field label="Primary functionality *"><Input required {...bind('primaryFunction')} /></Field>
        <Field label="Verification status">
          <Select {...bind('status')}><option value="UNVERIFIED">Not verified</option><option value="VERIFIED">Verified (source attached)</option></Select>
        </Field>
        <Field label="Description *" className="sm:col-span-2"><Textarea required minLength={5} {...bind('description')} /></Field>
        <Field label="Common applications" hint="Comma separated" className="sm:col-span-2"><Input {...bind('commonApplications')} /></Field>
        <Field label="Min concentration (%)"><Input type="number" step="0.0001" min="0" {...bind('minConcentration')} /></Field>
        <Field label="Max concentration (%)"><Input type="number" step="0.0001" min="0" {...bind('maxConcentration')} /></Field>
        <Field label="Concentration source" hint="Required if a range is given" className="sm:col-span-2"><Input {...bind('concentrationSource')} /></Field>
        <Field label="Solubility / formulation properties"><Textarea {...bind('solubility')} /></Field>
        <Field label="Compatibility considerations"><Textarea {...bind('compatibilityNotes')} /></Field>
        <Field label="Regulatory notes" className="sm:col-span-2"><Textarea {...bind('regulatoryNotes')} /></Field>
        <Field label="Sources" hint='One per line: "Name | https://url"' className="sm:col-span-2"><Textarea {...bind('sources')} /></Field>
        <div className="space-y-2 sm:col-span-2">
          <FormError message={error} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save ingredient</Button></div>
        </div>
      </form>
    </Dialog>
  );
}
