// Backend guardrails applied to EVERY verdict, whichever provider produced it.
// They keep the scientific rules enforceable even if the model is too generous or too harsh.
import { Verdict } from '@prisma/client';
import { EvidenceCandidate } from './types';

/** Facts about the evidence set that drive the guardrails. */
export function evidenceFacts(candidates: EvidenceCandidate[]) {
  const exact = candidates.filter((c) => c.relation === 'FINISHED_EXACT' && c.categoryMatch);
  return {
    exactSupport: exact.filter((c) => c.effectDirection === 'POSITIVE' && !c.factors.magnitudeShortfall),
    exactContradiction: exact.filter((c) => c.effectDirection !== 'POSITIVE'),
    exactShortfall: exact.filter((c) => c.effectDirection === 'POSITIVE' && c.factors.magnitudeShortfall),
    anyContradiction: candidates.filter((c) => c.role === 'CONTRADICTORY'),
  };
}

export function applyGuardrails(
  proposed: Verdict,
  candidates: EvidenceCandidate[],
  score: number,
  supportedMinScore: number,
): { verdict: Verdict; notes: string[] } {
  const facts = evidenceFacts(candidates);
  const notes: string[] = [];
  let verdict = proposed;

  if (verdict === 'SUPPORTED') {
    if (facts.exactSupport.length === 0) {
      verdict = 'INCONCLUSIVE';
      notes.push('SUPPORTED downgraded to INCONCLUSIVE: no directly applicable finished-product study of this exact formulation version supports the claim.');
    } else if (facts.exactContradiction.length > 0) {
      verdict = 'INCONCLUSIVE';
      notes.push('SUPPORTED downgraded to INCONCLUSIVE: finished-product evidence for this formulation also contradicts the claim.');
    } else if (score < supportedMinScore) {
      verdict = 'INCONCLUSIVE';
      notes.push(`SUPPORTED downgraded to INCONCLUSIVE: evidence sufficiency score ${score} is below the minimum of ${supportedMinScore}.`);
    }
  }

  if (verdict === 'NOT_SUPPORTED' && facts.anyContradiction.length === 0 && facts.exactShortfall.length === 0) {
    verdict = 'INCONCLUSIVE';
    notes.push('NOT_SUPPORTED changed to INCONCLUSIVE: missing evidence is not evidence that the claim is false, and nothing contradicts it.');
  }
  return { verdict, notes };
}
