import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BenefitChips } from '@/components/BenefitChips';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { detectTarget } from '@/lib/lib';
import { api, errorText } from '@/services/api';

/**
 * One short form. Only the claim wording is required: the description, benefit chips and the numbers are optional
 * and Claude reads whatever is given, from the fields and from the free text. Submitting creates the claim and
 * immediately sends it to Claude; the user lands on the finished report. If Claude fails the claim is kept and the
 * evaluation can be retried.
 */
export function ClaimForm({ products, initialProductId }) {
  const navigate = useNavigate();
  const [productId, setProductId] = useState(products.find((p) => p.id === initialProductId)?.id ?? products[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [benefits, setBenefits] = useState([]);
  const [target, setTarget] = useState('');
  const [weeks, setWeeks] = useState('');
  const [population, setPopulation] = useState('');
  const [phase, setPhase] = useState({ name: 'idle' });

  const product = products.find((p) => p.id === productId);
  // Numbers typed into the wording or description fill the optional fields when those are left empty.
  const detected = detectTarget(`${title} ${description}`);
  const detectedNote = [!target && detected.percent != null ? `${detected.percent}%` : null, !weeks && detected.weeks != null ? `${detected.weeks} weeks` : null].filter(Boolean).join(' in ');

  const evaluate = async (claimId) => {
    setPhase({ name: 'working', step: 'evaluating' });
    try {
      const assessment = await api.post('/claims/assess', { claimId });
      navigate(`/assessments/${assessment.id}`);
    } catch (e) {
      setPhase({ name: 'failed', claimId, message: errorText(e) });
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setPhase({ name: 'working', step: 'saving' });
    const targetValue = target !== '' ? Number(target) : detected.percent;
    const durationWeeks = weeks !== '' ? Number(weeks) : detected.weeks;
    try {
      const claim = await api.post('/claims', {
        productId, title, description, benefits, targetValue, durationWeeks, targetPopulation: population,
      });
      await evaluate(claim.id);
    } catch (e) {
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
    <form onSubmit={submit} className="space-y-6 p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Claim title" className="sm:col-span-2">
          <Input required minLength={5} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reduces the look of pores by 20% in 4 weeks" className="h-12 text-base" />
        </Field>
        <Field label="Product">
          <Select required value={productId} onChange={(e) => setProductId(e.target.value)} className="h-12">{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
      </div>

      <Field label="Description" hint="Optional. Say more in your own words: who it is for, how it is used, what exactly changes.">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="Used twice daily on oily, blemish-prone skin; visibly smaller-looking pores and less shine." />
      </Field>

      <BenefitChips value={benefits} onChange={setBenefits} label="Benefits" hint="Optional. Pick any, or add your own." />

      <div>
        <p className="mb-2 text-xs font-medium text-slate-700">Details <span className="font-normal text-slate-500">Optional. Claude also reads your title and description.</span></p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Improvement (%)"><Input type="number" min="0" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="20" /></Field>
          <Field label="Within (weeks)"><Input type="number" min="1" max="520" value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="4" /></Field>
          <Field label="Target population"><Input value={population} onChange={(e) => setPopulation(e.target.value)} placeholder="Adults with oily skin" /></Field>
        </div>
        {detectedNote && <p className="mt-2 text-xs text-teal-700">Read from your text: {detectedNote}. This will be used unless you fill the field.</p>}
      </div>

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
