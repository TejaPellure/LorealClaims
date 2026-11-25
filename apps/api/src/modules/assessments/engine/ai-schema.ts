// Structured AI output: JSON schema (sent to Claude) and the server-side validator (never trust the model).
import { Verdict } from '@prisma/client';
import { AiAssessment, EvidenceCandidate, EvidenceNote } from './types';

const noteArray = {
  type: 'array',
  items: {
    type: 'object',
    properties: { evidenceId: { type: 'string' }, note: { type: 'string' } },
    required: ['evidenceId', 'note'],
    additionalProperties: false,
  },
};
const stringArray = { type: 'array', items: { type: 'string' } };

/** JSON schema passed to the Claude CLI (`--json-schema`) so the output is structured. */
export const AI_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE'] },
    summary: { type: 'string' },
    strengths: stringArray,
    limitations: stringArray,
    ingredientEvidenceAnalysis: noteArray,
    formulationEvidenceAnalysis: noteArray,
    contradictoryEvidence: noteArray,
    missingEvidence: stringArray,
    recommendedTests: stringArray,
    evidenceReferences: stringArray,
    reasoning: { type: 'string' },
  },
  required: [
    'verdict', 'summary', 'strengths', 'limitations', 'ingredientEvidenceAnalysis', 'formulationEvidenceAnalysis',
    'contradictoryEvidence', 'missingEvidence', 'recommendedTests', 'evidenceReferences', 'reasoning',
  ],
  additionalProperties: false,
};

/** Thrown when the model output is unusable; carries every problem found so it can be fed back for a retry. */
export class InvalidAiResponseError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid AI response: ${problems.join('; ')}`);
  }
}

const VERDICTS: Verdict[] = ['SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE'];
const MAX_TEXT = 6000;
const MAX_ITEMS = 25;

export function validateAiAssessment(raw: unknown, evidence: EvidenceCandidate[]): AiAssessment {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidAiResponseError(['response is not a JSON object']);
  }
  const obj = raw as Record<string, unknown>;
  const byId = new Map(evidence.map((e) => [e.id, e]));

  const text = (field: string): string => {
    const value = obj[field];
    if (typeof value !== 'string' || !value.trim()) problems.push(`"${field}" must be a non-empty string`);
    return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
  };
  const strings = (field: string): string[] => {
    const value = obj[field];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      problems.push(`"${field}" must be an array of strings`);
      return [];
    }
    return value.slice(0, MAX_ITEMS).map((v: string) => v.trim().slice(0, MAX_TEXT)).filter(Boolean);
  };
  /** Notes must cite real evidence IDs, and (optionally) only evidence of the right kind. */
  const notes = (field: string, allowed: (e: EvidenceCandidate) => boolean, rule: string): EvidenceNote[] => {
    const value = obj[field];
    if (!Array.isArray(value)) {
      problems.push(`"${field}" must be an array`);
      return [];
    }
    return value.slice(0, MAX_ITEMS).flatMap((item: unknown, index) => {
      const entry = item as Partial<EvidenceNote>;
      const candidate = typeof entry?.evidenceId === 'string' ? byId.get(entry.evidenceId) : undefined;
      if (!candidate) problems.push(`"${field}[${index}]" cites an unknown evidenceId`);
      else if (!allowed(candidate)) problems.push(`"${field}[${index}]" ${rule}`);
      if (!candidate || typeof entry.note !== 'string' || !entry.note.trim()) {
        if (candidate) problems.push(`"${field}[${index}]" needs a note`);
        return [];
      }
      return [{ evidenceId: candidate.id, note: entry.note.trim().slice(0, MAX_TEXT) }];
    });
  };

  const verdict = obj.verdict as Verdict;
  if (!VERDICTS.includes(verdict)) problems.push('"verdict" must be SUPPORTED, NOT_SUPPORTED or INCONCLUSIVE');

  const result: AiAssessment = {
    verdict,
    summary: text('summary'),
    strengths: strings('strengths'),
    limitations: strings('limitations'),
    // Ingredient evidence and finished-product evidence must stay in their own sections.
    ingredientEvidenceAnalysis: notes('ingredientEvidenceAnalysis', (e) => e.relation === 'INGREDIENT', 'must cite ingredient-level evidence only'),
    formulationEvidenceAnalysis: notes('formulationEvidenceAnalysis', (e) => e.relation !== 'INGREDIENT', 'must cite finished-product evidence only'),
    contradictoryEvidence: notes('contradictoryEvidence', () => true, ''),
    missingEvidence: strings('missingEvidence'),
    recommendedTests: strings('recommendedTests'),
    evidenceReferences: strings('evidenceReferences'),
    reasoning: text('reasoning'),
  };

  const unknownRefs = result.evidenceReferences.filter((id) => !byId.has(id));
  if (unknownRefs.length) problems.push(`"evidenceReferences" contains unknown ids: ${unknownRefs.join(', ')}`);

  if (problems.length) throw new InvalidAiResponseError(problems);
  return result;
}
