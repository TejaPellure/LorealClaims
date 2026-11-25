// Structured AI output: JSON schema (sent to Claude) and the server-side validator.
// The validator checks that the answer is well-formed and only cites studies that were actually supplied.
// It never changes Claude's verdict, score or reasoning.
import { Verdict } from '@prisma/client';
import { AiAssessment, EvidenceCandidate, EvidenceNote, EvidenceUsage, UsageRole } from './types';

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
    score: { type: 'integer', minimum: 0, maximum: 100 },
    scoreExplanation: { type: 'string' },
    summary: { type: 'string' },
    strengths: stringArray,
    limitations: stringArray,
    ingredientEvidenceAnalysis: noteArray,
    formulationEvidenceAnalysis: noteArray,
    contradictoryEvidence: noteArray,
    evidenceRoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { evidenceId: { type: 'string' }, role: { type: 'string', enum: ['SUPPORTS', 'DISAGREES', 'BACKGROUND'] } },
        required: ['evidenceId', 'role'],
        additionalProperties: false,
      },
    },
    missingEvidence: stringArray,
    recommendedTests: stringArray,
    evidenceReferences: stringArray,
    reasoning: { type: 'string' },
  },
  required: [
    'verdict', 'score', 'scoreExplanation', 'summary', 'strengths', 'limitations', 'ingredientEvidenceAnalysis', 'formulationEvidenceAnalysis',
    'contradictoryEvidence', 'evidenceRoles', 'missingEvidence', 'recommendedTests', 'evidenceReferences', 'reasoning',
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
const ROLES: UsageRole[] = ['SUPPORTS', 'DISAGREES', 'BACKGROUND'];
const MAX_TEXT = 6000;
const MAX_ITEMS = 40;
/** Models sometimes write the two characters backslash + n instead of a line break. */
const cleanText = (value: string) => value.replace(/\\n/g, '\n').trim();

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
    return typeof value === 'string' ? cleanText(value).slice(0, MAX_TEXT) : '';
  };
  const strings = (field: string): string[] => {
    const value = obj[field];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      problems.push(`"${field}" must be an array of strings`);
      return [];
    }
    return value.slice(0, MAX_ITEMS).map((v: string) => cleanText(v).slice(0, MAX_TEXT)).filter(Boolean);
  };
  /** Notes must cite real evidence ids, and (optionally) only evidence of the right kind. */
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
      return [{ evidenceId: candidate.id, note: cleanText(entry.note).slice(0, MAX_TEXT) }];
    });
  };
  const roles = (): EvidenceUsage[] => {
    const value = obj.evidenceRoles;
    if (!Array.isArray(value)) {
      problems.push('"evidenceRoles" must be an array');
      return [];
    }
    const seen = new Set<string>();
    return value.slice(0, MAX_ITEMS).flatMap((item: unknown, index) => {
      const entry = item as Partial<EvidenceUsage>;
      if (typeof entry?.evidenceId !== 'string' || !byId.has(entry.evidenceId)) {
        problems.push(`"evidenceRoles[${index}]" cites an unknown evidenceId`);
        return [];
      }
      if (!ROLES.includes(entry.role as UsageRole)) {
        problems.push(`"evidenceRoles[${index}].role" must be SUPPORTS, DISAGREES or BACKGROUND`);
        return [];
      }
      if (seen.has(entry.evidenceId)) return [];
      seen.add(entry.evidenceId);
      return [{ evidenceId: entry.evidenceId, role: entry.role as UsageRole }];
    });
  };

  const verdict = obj.verdict as Verdict;
  if (!VERDICTS.includes(verdict)) problems.push('"verdict" must be SUPPORTED, NOT_SUPPORTED or INCONCLUSIVE');
  const score = Number(obj.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) problems.push('"score" must be a number from 0 to 100');

  const result: AiAssessment = {
    verdict,
    score: Math.round(score),
    scoreExplanation: text('scoreExplanation'),
    summary: text('summary'),
    strengths: strings('strengths'),
    limitations: strings('limitations'),
    // Ingredient evidence and finished-product evidence must stay in their own sections.
    ingredientEvidenceAnalysis: notes('ingredientEvidenceAnalysis', (e) => e.relation === 'INGREDIENT', 'must cite ingredient-level evidence only'),
    formulationEvidenceAnalysis: notes('formulationEvidenceAnalysis', (e) => e.relation !== 'INGREDIENT', 'must cite finished-product evidence only'),
    contradictoryEvidence: notes('contradictoryEvidence', () => true, ''),
    evidenceRoles: roles(),
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
