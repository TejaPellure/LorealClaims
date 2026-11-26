import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { benefitLabel, BENEFIT_PRESETS, cn, normalizeBenefit } from '@/lib/lib';

/**
 * Benefit picker: toggle preset chips, or type your own and press Enter. Values are normalised tags
 * (the same rule the server uses), so "Acne / Blemishes" and the preset chip are one thing.
 */
export function BenefitChips({ value, onChange, label = 'Benefits', hint }) {
  const [draft, setDraft] = useState('');
  const custom = value.filter((tag) => !BENEFIT_PRESETS.some((p) => p.tag === tag));

  const toggle = (tag) => onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  const addDraft = () => {
    const tag = normalizeBenefit(draft);
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  const onKey = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // do not submit the surrounding form
      addDraft();
    }
  };

  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-slate-700">{label}{hint && <span className="ml-2 font-normal text-slate-500">{hint}</span>}</legend>
      <div className="flex flex-wrap gap-2">
        {BENEFIT_PRESETS.map((p) => {
          const on = value.includes(p.tag);
          return (
            <button key={p.tag} type="button" aria-pressed={on} onClick={() => toggle(p.tag)}
              className={cn('cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors', on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-700 hover:text-teal-800')}>
              {p.label}
            </button>
          );
        })}
        {custom.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-rose-brand bg-teal-50 py-1.5 pl-3.5 pr-2 text-sm text-teal-800">
            {benefitLabel(tag)}
            <button type="button" onClick={() => toggle(tag)} aria-label={`Remove ${benefitLabel(tag)}`} className="cursor-pointer rounded-full p-0.5 hover:bg-teal-100"><X className="h-3.5 w-3.5" aria-hidden /></button>
          </span>
        ))}
        <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-white pl-3.5 pr-1">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} maxLength={40} placeholder="Add your own" aria-label="Add your own benefit"
            className="w-32 bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
          <button type="button" onClick={addDraft} disabled={!draft.trim()} aria-label="Add benefit" className="cursor-pointer rounded-full p-1.5 text-teal-700 hover:bg-teal-50 disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden /></button>
        </span>
      </div>
    </fieldset>
  );
}
