// Prompt construction. Bump PROMPT_VERSION whenever the wording, the playbook or the package format changes;
// it is stored with every assessment so old results stay interpretable.
import { EVALUATION_PLAYBOOK } from './playbook';
import { EvidencePackage } from './types';

export const PROMPT_VERSION = 'claims-assess-v3';

const RULES = `You are a scientific evidence reviewer for cosmetic claim substantiation. You assist human evaluators; you never grant regulatory or legal approval.

Judge ONLY from the evidence records supplied in the user message (plus the playbook's judgement rules). Strict rules:
1. Ingredient-level evidence does NOT prove that the finished formulation delivers the same benefit. Evidence with relation INGREDIENT may be cited only in ingredientEvidenceAnalysis; finished-product evidence (FINISHED_EXACT or FINISHED_OTHER) only in formulationEvidenceAnalysis.
2. FINISHED_OTHER is a study of a DIFFERENT formulation; it is supporting context, not direct proof.
3. Compare tested vs formulated concentration, population, duration, endpoint, study design, study quality and the reported effect size against the claimed target.
4. Never invent studies, results, DOIs or evidence ids. Cite only the "id" values provided. If evidence is missing, say so explicitly in missingEvidence.
5. Verdicts: SUPPORTED = evidence sufficiently supports the claim as worded (magnitude, timeframe, population). NOT_SUPPORTED = evidence contradicts the claim or does not reach its magnitude/scope. INCONCLUSIVE = evidence is insufficient to decide. Missing evidence is NOT proof that a claim is false: use INCONCLUSIVE.
6. A SUPPORTED verdict requires directly applicable finished-product evidence of this exact formulation (relation FINISHED_EXACT).
7. Records with endpointMatch=false are context only: they do not measure the claimed benefit. Use them only to explain gaps.
8. Do not output a numeric score; scoring is done elsewhere.
9. Be concise and specific. Recommend concrete tests that would close each evidence gap.`;

export const SYSTEM_PROMPT = `${RULES}\n\n${EVALUATION_PLAYBOOK}`;

/** Compact JSON keeps token usage low; only fields the model needs are included. */
export function buildUserPrompt(pkg: EvidencePackage): string {
  const { claim, formulation, evidence } = pkg;
  const payload = {
    claim: {
      wording: claim.title,
      ...(claim.description && { description: claim.description }),
      ...(claim.benefits.length && { benefits: claim.benefits }),
      ...(claim.targetValue != null && { target: `${claim.targetValue}${claim.measurementUnit}` }),
      ...(claim.durationWeeks != null && { durationWeeks: claim.durationWeeks }),
      ...(claim.targetPopulation && { population: claim.targetPopulation }),
    },
    formulation: {
      product: formulation.productName,
      ingredients: formulation.ingredients.map((i) => ({
        name: i.name, pct: i.percentage, role: i.function,
        ...(i.minConcentration != null || i.maxConcentration != null ? { sourcedRangePct: `${i.minConcentration ?? ''}-${i.maxConcentration ?? ''}` } : {}),
      })),
    },
    evidence: evidence.map((e) => ({
      id: e.id, relation: e.relation, title: e.title, type: e.evidenceType, design: e.studyDesign, n: e.sampleSize,
      population: e.population, weeks: e.durationWeeks, tested: e.testedSubject, testedPct: e.testedConcentration,
      formulatedPct: e.formulatedConcentration, endpoint: e.endpoint, results: e.resultsSummary, direction: e.effectDirection,
      effectPct: e.effectMagnitude, limitations: e.limitations, quality: e.quality, endpointMatch: e.categoryMatch,
    })),
  };
  return `Assess whether the claim is substantiated by this evidence package. Respond with the required JSON structure only.\n\n${JSON.stringify(payload)}`;
}
