// Prompt construction. Bump PROMPT_VERSION whenever the wording, the playbook or the package format changes;
// it is stored with every assessment so old results stay interpretable.
// All judging is done by Claude: the verdict, the 0-100 score, which studies matter and how. The backend only checks the shape.
import { EVALUATION_PLAYBOOK } from './playbook';
import { EvidencePackage } from './types';

export const PROMPT_VERSION = 'claims-assess-v6';

const RULES = `You are a scientific evidence reviewer for cosmetic claim substantiation. You assist human evaluators; you never grant regulatory or legal approval. You make every judgement yourself: nothing is pre-scored or pre-filtered for you.

Judge ONLY from the evidence records supplied in the user message (plus the playbook's judgement rules). Strict rules:
1. Ingredient-level evidence does NOT prove that the finished formulation delivers the same benefit. Evidence with relation INGREDIENT may be cited only in ingredientEvidenceAnalysis; finished-product evidence (FINISHED_EXACT or FINISHED_OTHER) only in formulationEvidenceAnalysis.
2. FINISHED_OTHER is a study of a DIFFERENT formulation; it is supporting context, not direct proof. FINISHED_EXACT is a study of this exact formulation and is the strongest evidence.
3. First decide which of the supplied studies are actually about the benefit the claim makes (compare the benefit tags, endpoint and results with the claim wording, description and benefits). Studies about other benefits are background only.
4. Compare tested vs formulated concentration (testedPct vs formulatedPct), population, duration, endpoint, study design, study quality and the reported effect size against the claimed target.
5. Never invent studies, results, DOIs or evidence ids. Cite only the "id" values provided. If evidence is missing, say so explicitly in missingEvidence.
6. Verdicts. The question is "can this claim be made on the strength of the supplied evidence?".
   SUPPORTED = evidence sufficiently supports the claim as worded (size, timeframe, population).
   NOT_SUPPORTED = the claim cannot be made on this evidence. Use it when (a) evidence contradicts the claim or does not reach its size, timeframe or scope, OR (b) none of the supplied studies is about the benefit the claim makes, for this formula or its ingredients (for example a hair-strength claim when every study is about skin hydration, or a brightening claim when the studies only show pore or oil-control effects). Evidence of other benefits never counts for the claimed one.
   INCONCLUSIVE = reserved for claims where at least one supplied study IS about the claimed benefit (for this formula, a similar formula or an ingredient) and points the right way, but is too indirect, too small, too short, at the wrong dose or population, or too mixed to decide. It is the "promising but unproven" verdict, not the default for "nothing found".
   In the summary and missingEvidence, still say plainly that this is a lack of supporting evidence and not proof the product cannot work: the verdict says the claim is not substantiated yet.
7. A SUPPORTED verdict requires directly applicable finished-product evidence of this exact formulation (relation FINISHED_EXACT). Never mark a claim SUPPORTED on ingredient studies alone.
8. score is an integer from 0 to 100: how strongly the supplied evidence supports the claim as worded (0 = nothing supports it, 100 = conclusive). Base it on the directness of the evidence (this exact formula, a different formula, or an ingredient), study quality, benefit match, concentration, duration, population, the size of the reported effect and whether studies agree. Keep it consistent with the verdict and inside its band: SUPPORTED 70-100, INCONCLUSIVE 25-69, NOT_SUPPORTED 0-40 (no study about the claimed benefit = 0-15). scoreExplanation is one or two plain sentences saying why you gave that score.
9. evidenceRoles: for every supplied study say how you used it: SUPPORTS (about the claimed benefit and in favour), DISAGREES (about the claimed benefit and against it or showing no effect) or BACKGROUND (not about the claimed benefit, or too weak or indirect to matter).
10. Be concise and specific. Recommend concrete tests that would close each evidence gap.
11. Readers include non-scientists (for example a brand or marketing manager). Write scoreExplanation, summary, strengths, limitations, missingEvidence and recommendedTests in plain, jargon-free language: summary 1-2 short sentences; at most 4 short bullets per list; no evidence ids, abbreviations or statistics in those fields. Put technical detail, numbers and evidence ids only in reasoning and the *Analysis / contradictoryEvidence fields.`;

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
      id: e.id, relation: e.relation, title: e.title, type: e.evidenceType, benefits: e.benefits, design: e.studyDesign, n: e.sampleSize,
      population: e.population, weeks: e.durationWeeks, tested: e.testedSubject, testedPct: e.testedConcentration,
      formulatedPct: e.formulatedConcentration, endpoint: e.endpoint, results: e.resultsSummary, direction: e.effectDirection,
      effectPct: e.effectMagnitude, limitations: e.limitations, quality: e.quality,
    })),
  };
  return `Assess whether the claim is substantiated by this evidence package. Respond with the required JSON structure only.\n\n${JSON.stringify(payload)}`;
}
