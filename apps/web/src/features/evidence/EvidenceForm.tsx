import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, Field, FormError, Input, Select, Textarea } from '@/components/ui/primitives';
import { useAsync, useFormState } from '@/hooks/hooks';
import { BENEFIT_CATEGORIES, EVIDENCE_TYPES, humanize } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { BenefitCategory, Ingredient, Paged, Product } from '@/types';

const EMPTY = {
  title: '', evidenceType: 'CLINICAL_STUDY', scope: 'INGREDIENT', sourceName: '', doi: '', pmid: '', sourceUrl: '', publishedAt: '', studyDesign: '',
  sampleSize: '', population: '', durationWeeks: '', testedSubject: '', testedConcentration: '', endpoint: '', resultsSummary: '',
  effectDirection: 'POSITIVE', effectMagnitude: '', limitations: '', quality: 'MODERATE', status: 'VERIFIED',
};

/** Evaluator form for adding an evidence record (optionally with its PDF report). */
export function EvidenceFormDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  return open ? <EvidenceForm onClose={onClose} onSaved={onSaved} /> : null;
}

function EvidenceForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { values, bind } = useFormState(EMPTY);
  const [categories, setCategories] = useState<BenefitCategory[]>([]);
  const [ingredientIds, setIngredientIds] = useState<string[]>([]);
  const [formulationIds, setFormulationIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ingredients = useAsync(() => api.get<Paged<Ingredient>>('/ingredients', { pageSize: 100 }));
  const products = useAsync(() => api.get<Paged<Product>>('/products', { pageSize: 100 }));

  const toggle = <T,>(list: T[], item: T, set: (next: T[]) => void) => set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const optionalNumber = (v: unknown) => (String(v ?? '').trim() !== '' ? Number(v) : undefined);
  const optionalText = (v: unknown) => (String(v ?? '').trim() ? String(v).trim() : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!categories.length) return setError('Select at least one benefit category the study measures.');
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ id: string }>('/evidence', {
        title: values.title, evidenceType: values.evidenceType, scope: values.scope, benefitCategories: categories, sourceName: values.sourceName,
        doi: optionalText(values.doi), pmid: optionalText(values.pmid), sourceUrl: optionalText(values.sourceUrl),
        publishedAt: optionalText(values.publishedAt), studyDesign: values.studyDesign, sampleSize: optionalNumber(values.sampleSize),
        population: values.population, durationWeeks: optionalNumber(values.durationWeeks), testedSubject: values.testedSubject,
        testedConcentration: optionalNumber(values.testedConcentration), endpoint: values.endpoint,
        resultsSummary: values.resultsSummary, effectDirection: values.effectDirection, effectMagnitude: optionalNumber(values.effectMagnitude),
        limitations: values.limitations, quality: values.quality, status: values.status, ingredientIds, formulationIds,
      });
      if (file) await api.upload(`/evidence/${created.id}/upload`, file);
      toast.success('Evidence record added');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const formulations = products.data?.items.flatMap((p) => p.formulations.slice(0, 1).map((f) => ({ id: f.id, label: p.name }))) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add evidence record" description="Enter only what the source states. Never invent results, DOIs or PMIDs." wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Study title *" className="sm:col-span-2"><Input required minLength={5} {...bind('title')} /></Field>
        <Field label="Evidence type *"><Select {...bind('evidenceType')}>{EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="Scope *" hint="Finished product = the complete formula was tested">
          <Select {...bind('scope')}><option value="INGREDIENT">Ingredient level</option><option value="FINISHED_PRODUCT">Finished product</option></Select>
        </Field>
        <Field label="Source organisation / journal *"><Input required {...bind('sourceName')} /></Field>
        <Field label="Publication date"><Input type="date" {...bind('publishedAt')} /></Field>
        <Field label="DOI"><Input placeholder="10.xxxx/..." {...bind('doi')} /></Field>
        <Field label="PMID"><Input {...bind('pmid')} /></Field>
        <Field label="Source URL" className="sm:col-span-2"><Input type="url" placeholder="https://" {...bind('sourceUrl')} /></Field>
        <Field label="Study design and methods *"><Input required {...bind('studyDesign')} /></Field>
        <Field label="Sample size"><Input type="number" min="1" {...bind('sampleSize')} /></Field>
        <Field label="Study population *"><Input required {...bind('population')} /></Field>
        <Field label="Duration (weeks)"><Input type="number" min="1" {...bind('durationWeeks')} /></Field>
        <Field label="Ingredient / formulation tested *"><Input required {...bind('testedSubject')} /></Field>
        <Field label="Tested concentration (%)"><Input type="number" step="0.0001" min="0" max="100" {...bind('testedConcentration')} /></Field>
        <Field label="Measurement endpoint *" className="sm:col-span-2"><Input required {...bind('endpoint')} /></Field>
        <Field label="Results summary *" className="sm:col-span-2"><Textarea required {...bind('resultsSummary')} /></Field>
        <Field label="Effect direction *"><Select {...bind('effectDirection')}><option value="POSITIVE">Positive</option><option value="NEUTRAL">No significant effect</option><option value="NEGATIVE">Negative</option></Select></Field>
        <Field label="Reported effect (%)" hint="Only if the source states it"><Input type="number" step="0.01" {...bind('effectMagnitude')} /></Field>
        <Field label="Limitations *" className="sm:col-span-2"><Textarea required {...bind('limitations')} /></Field>
        <Field label="Evidence quality *"><Select {...bind('quality')}><option value="HIGH">High</option><option value="MODERATE">Moderate</option><option value="LOW">Low</option><option value="VERY_LOW">Very low</option></Select></Field>
        <Field label="Verification status" hint="Unverified evidence is not used in assessments">
          <Select {...bind('status')}><option value="VERIFIED">Verified against the source</option><option value="UNVERIFIED">Not verified yet</option></Select>
        </Field>

        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-medium text-slate-700">Benefit categories measured *</legend>
          <div className="flex flex-wrap gap-3">{BENEFIT_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={categories.includes(c)} onChange={() => toggle(categories, c, setCategories)} />{humanize(c)}</label>
          ))}</div>
        </fieldset>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-medium text-slate-700">Related ingredients</legend>
          <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 sm:grid-cols-3">{ingredients.data?.items.map((i) => (
            <label key={i.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={ingredientIds.includes(i.id)} onChange={() => toggle(ingredientIds, i.id, setIngredientIds)} />{i.name}</label>
          ))}</div>
        </fieldset>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-medium text-slate-700">Products this study tested (finished-product evidence)</legend>
          <div className="grid max-h-28 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">{formulations.map((f) => (
            <label key={f.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={formulationIds.includes(f.id)} onChange={() => toggle(formulationIds, f.id, setFormulationIds)} />{f.label}</label>
          ))}</div>
        </fieldset>
        <Field label="Study report (PDF, max 10 MB)" className="sm:col-span-2">
          <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-1.5" />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <FormError message={error} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save evidence</Button></div>
        </div>
      </form>
    </Dialog>
  );
}
