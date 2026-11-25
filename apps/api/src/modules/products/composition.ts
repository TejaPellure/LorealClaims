// Formulation percentage validation. Pure functions, no database access.
//
// Concentrations are compared as scaled integers (value * 10_000) so that binary floating-point
// artefacts (0.1 + 0.2 !== 0.3) can never make a valid 100% formula look invalid.

export const PERCENT_SCALE = 10_000;
/** Allowed rounding tolerance on the 100% total: +/- 0.001 percentage points. */
export const TOTAL_TOLERANCE_SCALED = 10;

export interface CompositionLine {
  ingredientId: string;
  percentage: number;
  /** Optional reference range from ingredient metadata (only present when a source supports it). */
  ingredientName?: string;
  minConcentration?: number | null;
  maxConcentration?: number | null;
}

export type CompositionStatus = 'EMPTY' | 'UNDER' | 'OVER' | 'VALID';

export interface CompositionCheck {
  total: number;
  remaining: number;
  status: CompositionStatus;
  /** Blocking problems: a formula with errors cannot be finalised or assessed. */
  errors: string[];
  /** Non-blocking notes, e.g. outside the documented reference range. */
  warnings: string[];
}

const toScaled = (percentage: number) => Math.round(percentage * PERCENT_SCALE);

export function checkComposition(lines: CompositionLine[]): CompositionCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lines.length === 0) {
    return { total: 0, remaining: 100, status: 'EMPTY', errors: ['The formulation has no ingredients.'], warnings };
  }

  const seen = new Set<string>();
  let totalScaled = 0;
  for (const line of lines) {
    const label = line.ingredientName ?? line.ingredientId;
    if (seen.has(line.ingredientId)) errors.push(`${label} appears more than once.`);
    seen.add(line.ingredientId);
    if (!(line.percentage > 0)) errors.push(`${label} must have a concentration greater than 0%.`);
    if (line.percentage > 100) errors.push(`${label} cannot exceed 100%.`);
    totalScaled += toScaled(line.percentage);

    // Reference ranges are context only: staying inside one is NOT evidence of safety or efficacy.
    if (line.minConcentration != null && line.percentage < line.minConcentration) {
      warnings.push(`${label} is below its documented reference range (${line.minConcentration}%).`);
    }
    if (line.maxConcentration != null && line.percentage > line.maxConcentration) {
      warnings.push(`${label} exceeds its documented maximum (${line.maxConcentration}%).`);
    }
  }

  const deviation = totalScaled - 100 * PERCENT_SCALE;
  const status: CompositionStatus =
    Math.abs(deviation) <= TOTAL_TOLERANCE_SCALED ? 'VALID' : deviation > 0 ? 'OVER' : 'UNDER';
  const total = totalScaled / PERCENT_SCALE;

  if (status === 'OVER') errors.push(`Over-allocated: total is ${total}% (${(deviation / PERCENT_SCALE).toFixed(4)}% too much).`);
  if (status === 'UNDER') errors.push(`Under-allocated: total is ${total}% (${(-deviation / PERCENT_SCALE).toFixed(4)}% missing).`);

  return { total, remaining: Number(((100 * PERCENT_SCALE - totalScaled) / PERCENT_SCALE).toFixed(4)), status, errors, warnings };
}
