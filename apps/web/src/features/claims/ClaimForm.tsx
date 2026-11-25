import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Field, FormError, Input, Select, Textarea } from '@/components/ui/primitives';
import { useAsync, useFormState } from '@/hooks/hooks';
import { BENEFIT_CATEGORIES, humanize } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Claim, Formulation, Product } from '@/types';

const EMPTY = {
  title: '', description: '', benefitCategory: 'ANTI_WRINKLE', targetOutcome: '', measurementEndpoint: '', targetValue: '', measurementUnit: '%',
  durationWeeks: '', targetPopulation: '', applicationFrequency: '', scientificContext: '',
};

/**
 * Structured claim creation. The claim text is stored together with its measurable parts
 * (endpoint, target, unit, duration, population) so the assessment never has to parse free text.
 * When `formulationId` is provided the claim is bound to that exact formulation version.
 */
export function ClaimForm({ products, productId: fixedProductId, formulationId: fixedFormulationId, onCreated, submitLabel = 'Create claim' }: {
  products: Product[]; productId?: string; formulationId?: string; onCreated: (claim: Claim) => void; submitLabel?: string;
}) {
  const { values, bind, set } = useFormState(EMPTY);
  const [productId, setProductId] = useState(fixedProductId ?? products[0]?.id ?? '');
  const [formulationId, setFormulationId] = useState(fixedFormulationId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formulations = useAsync(() => (productId && !fixedFormulationId ? api.get<Formulation[]>(`/products/${productId}/formulations`) : Promise.resolve([])), [productId, fixedFormulationId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const claim = await api.post<Claim>('/claims', {
        productId, formulationId: formulationId || undefined, title: values.title, description: values.description, benefitCategory: values.benefitCategory,
        targetOutcome: values.targetOutcome, measurementEndpoint: values.measurementEndpoint, targetValue: Number(values.targetValue), measurementUnit: values.measurementUnit,
        durationWeeks: Number(values.durationWeeks), targetPopulation: values.targetPopulation,
        applicationFrequency: String(values.applicationFrequency).trim() || undefined, scientificContext: String(values.scientificContext).trim() || undefined,
      });
      toast.success('Claim created');
      onCreated(claim);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {!fixedProductId && (
        <Field label="Product *"><Select required value={productId} onChange={(e) => { setProductId(e.target.value); setFormulationId(''); }}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      )}
      {!fixedFormulationId && (
        <Field label="Formulation version" hint="Optional for proposals; required before assessment">
          <Select value={formulationId} onChange={(e) => setFormulationId(e.target.value)}>
            <option value="">Not assigned yet</option>
            {formulations.data?.map((f) => <option key={f.id} value={f.id}>v{f.version} ({f.status.toLowerCase()})</option>)}
          </Select>
        </Field>
      )}
      <Field label="Claim title *" className="sm:col-span-2"><Input required minLength={5} placeholder="Reduces wrinkle depth by 20% in 4 weeks" {...bind('title')} /></Field>
      <Field label="Claim description *" className="sm:col-span-2"><Textarea required {...bind('description')} /></Field>
      <Field label="Benefit category *"><Select {...bind('benefitCategory')}>{BENEFIT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
      <Field label="Target outcome *"><Input required placeholder="Reduced wrinkle depth" {...bind('targetOutcome')} /></Field>
      <Field label="Measurement endpoint *" className="sm:col-span-2"><Input required placeholder="Wrinkle depth by skin profilometry" {...bind('measurementEndpoint')} /></Field>
      <Field label="Expected improvement / target *"><Input required type="number" step="0.01" min="0" {...bind('targetValue')} /></Field>
      <Field label="Measurement unit *"><Input required {...bind('measurementUnit')} onChange={(e) => set('measurementUnit', e.target.value)} /></Field>
      <Field label="Expected duration (weeks) *"><Input required type="number" min="1" max="520" {...bind('durationWeeks')} /></Field>
      <Field label="Target population *"><Input required placeholder="Women with facial wrinkles" {...bind('targetPopulation')} /></Field>
      <Field label="Application frequency"><Input placeholder="Twice daily" {...bind('applicationFrequency')} /></Field>
      <Field label="Additional scientific context"><Input {...bind('scientificContext')} /></Field>
      <div className="space-y-2 sm:col-span-2">
        <FormError message={error} />
        <div className="flex justify-end"><Button type="submit" loading={saving} disabled={!productId}>{submitLabel}</Button></div>
      </div>
    </form>
  );
}
