import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

/** "ANTI_WRINKLE" -> "Anti wrinkle" */
export const humanize = (value) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '-');

export const INGREDIENT_CATEGORIES = ['BASE', 'HUMECTANT', 'ACTIVE', 'EMOLLIENT', 'BARRIER_LIPID', 'PRESERVATIVE', 'TEXTURIZER', 'ANTIOXIDANT'];
export const EVIDENCE_TYPES = [
  'CLINICAL_STUDY', 'DERMATOLOGICAL_STUDY', 'INSTRUMENTAL_MEASUREMENT', 'IN_VITRO_RESEARCH', 'LITERATURE_REVIEW', 'FINISHED_PRODUCT_TRIAL', 'SAFETY_COMPATIBILITY_STUDY',
];
export const VERDICT_LABEL = { SUPPORTED: 'Supported', NOT_SUPPORTED: 'Not supported', INCONCLUSIVE: 'Inconclusive' };

/** Client-side mirror of the server composition rule (integers at 1e-4 precision). Server stays authoritative. */
export function compositionOf(percentages) {
  const scaled = percentages.reduce((sum, p) => sum + Math.round((Number.isFinite(p) ? p : 0) * 10000), 0);
  const deviation = scaled - 1_000_000;
  const status = percentages.length === 0 ? 'EMPTY' : Math.abs(deviation) <= 10 ? 'VALID' : deviation > 0 ? 'OVER' : 'UNDER';
  return { total: scaled / 10000, remaining: (1_000_000 - scaled) / 10000, status } ;
}

// ── Benefits: preset chips plus anything the user types ──
export const BENEFIT_PRESETS = [
  { tag: 'hydration', label: 'Hydration' },
  { tag: 'anti-wrinkle', label: 'Anti-wrinkle' },
  { tag: 'firmness-elasticity', label: 'Firmness' },
  { tag: 'barrier-repair', label: 'Barrier repair' },
  { tag: 'brightening', label: 'Brightening' },
  { tag: 'anti-pigmentation', label: 'Dark spots' },
  { tag: 'soothing', label: 'Soothing' },
  { tag: 'acne-blemishes', label: 'Pimples / blemishes' },
  { tag: 'oil-control', label: 'Oil control' },
  { tag: 'pores', label: 'Pores' },
  { tag: 'exfoliation', label: 'Smoothing' },
  { tag: 'antioxidant', label: 'Antioxidant' },
];

/** Same rule as the server: "Acne / Blemishes" -> "acne-blemishes". */
export const normalizeBenefit = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const benefitLabel = (tag) => BENEFIT_PRESETS.find((p) => p.tag === tag)?.label ?? humanize(tag.replace(/-/g, '_'));

/** Reads an improvement % and a timeframe out of free text, e.g. "Reduces pores by 20% in 28 days" -> 20 %, 4 weeks. */
export function detectTarget(text) {
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const weeks = text.match(/(\d+)\s*(?:weeks?|wks?)\b/i);
  const days = text.match(/(\d+)\s*days?\b/i);
  const months = text.match(/(\d+)\s*months?\b/i);
  return {
    percent: percent ? Number(percent[1]) : undefined,
    weeks: weeks ? Number(weeks[1]) : days ? Math.max(1, Math.ceil(Number(days[1]) / 7)) : months ? Number(months[1]) * 4 : undefined,
  };
}
