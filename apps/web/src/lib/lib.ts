import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { BenefitCategory, Verdict } from '@/types';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

/** "ANTI_WRINKLE" -> "Anti wrinkle" */
export const humanize = (value?: string | null) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '-');

export const BENEFIT_CATEGORIES: BenefitCategory[] = ['HYDRATION', 'ANTI_WRINKLE', 'BARRIER_REPAIR', 'BRIGHTENING', 'SOOTHING', 'OTHER'];
export const INGREDIENT_CATEGORIES = ['BASE', 'HUMECTANT', 'ACTIVE', 'EMOLLIENT', 'BARRIER_LIPID', 'PRESERVATIVE', 'TEXTURIZER', 'ANTIOXIDANT'];
export const EVIDENCE_TYPES = [
  'CLINICAL_STUDY', 'DERMATOLOGICAL_STUDY', 'INSTRUMENTAL_MEASUREMENT', 'IN_VITRO_RESEARCH', 'LITERATURE_REVIEW', 'FINISHED_PRODUCT_TRIAL', 'SAFETY_COMPATIBILITY_STUDY',
];
export const VERDICT_LABEL: Record<Verdict, string> = { SUPPORTED: 'Supported', NOT_SUPPORTED: 'Not supported', INCONCLUSIVE: 'Inconclusive' };

/** Client-side mirror of the server composition rule (integers at 1e-4 precision). Server stays authoritative. */
export function compositionOf(percentages: number[]) {
  const scaled = percentages.reduce((sum, p) => sum + Math.round((Number.isFinite(p) ? p : 0) * 10000), 0);
  const deviation = scaled - 1_000_000;
  const status = percentages.length === 0 ? 'EMPTY' : Math.abs(deviation) <= 10 ? 'VALID' : deviation > 0 ? 'OVER' : 'UNDER';
  return { total: scaled / 10000, remaining: (1_000_000 - scaled) / 10000, status } as const;
}
