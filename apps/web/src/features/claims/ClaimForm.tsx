import { Loader2, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { BENEFIT_CATEGORIES, humanize } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Assessment, Claim, Product } from '@/types';

type Phase = { name: 'idle' } | { name: 'working'; step: 'saving' | 'evaluating' } | { name: 'failed'; claimId: string; message: string };

/**
 * One short form. Submitting creates the claim and immediately sends it to Claude;
 * the user lands on the finished report. If Claude fails, the claim is kept and the evaluation can be retried.
 */
export function ClaimForm({ products, initialProductId }: { products: Product[]; initialProductId?: string }) {
  const navigate = useNavigate();
  const [productId, setProductId] = useState(products.find((p) => p.id === initialProductId)?.id ?? products[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('ANTI_WRINKLE');
  const [target, setTarget] = useState('');
  const [weeks, setWeeks] = useState('');
  const [population, setPopulation] = useState('Adults');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });

  const product = products.find((p) => p.id === productId);
  const evaluate = async (claimId: string) => {
    setPhase({ name: 'working', step: 'evaluating' });
    try {
      const assessment = await api.post<Assessment>('/claims/assess', { claimId });
      navigate(`/assessments/${assessment.id}`);
    } catch (e) {
      setPhase({ name: 'failed', claimId, message: errorText(e) });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPhase({ name: 'working', step: 'saving' });
    try {
      const claim = await api.post<Claim>('/claims', {
        productId, title, benefitCategory: category, targetValue: Number(target), durationWeeks: Number(weeks), targetPopulation: population,
      });
      await evaluate(claim.id);
    } catch (e) {
      setPhase({ name: 'idle' });
      setPhase({ name: 'failed', claimId: '', message: errorText(e) });
    }
  };

  if (phase.name === 'working') {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-14 text-center" role="status" aria-live="polite">
        <Loader2 className="h-9 w-9 animate-spin text-teal-700" aria-hidden />
        <p className="font-display text-2xl text-slate-900">{phase.step === 'saving' ? 'Saving your claim…' : 'Claude is reviewing the evidence…'}</p>
        <p className="max-w-md text-sm text-slate-600">
          {phase.step === 'evaluating' ? `Comparing "${title}" with the ingredients, concentrations and studies for ${product?.name}. This usually takes one to two minutes.` : 'One moment.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
      <Field label="Claim wording">
        <Input required minLength={5} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reduces wrinkle depth by 20% in 4 weeks" className="h-12 text-base" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Product" className="lg:col-span-2">
          <Select required value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        <Field label="Benefit"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{BENEFIT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
        <Field label="Improvement (%)"><Input required type="number" min="0" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="20" /></Field>
        <Field label="Within (weeks)"><Input required type="number" min="1" max="520" value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="4" /></Field>
      </div>
      <Field label="Target population"><Input required minLength={2} value={population} onChange={(e) => setPopulation(e.target.value)} placeholder="Women with facial wrinkles" /></Field>

      {product && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
          Formula: {product.formulations[0]?.ingredients.map((l) => `${l.ingredient.name} ${l.percentage}%`).join(' · ')}
        </p>
      )}
      {phase.name === 'failed' && (
        <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p>{phase.message}</p>
          {phase.claimId && <Button type="button" size="sm" variant="secondary" onClick={() => evaluate(phase.claimId)}>Try the evaluation again</Button>}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="md" disabled={!productId}><Sparkles className="h-4 w-4" />Evaluate with Claude</Button>
      </div>
    </form>
  );
}
