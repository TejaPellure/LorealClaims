// Shared types for the claim assessment engine.
// The backend only gathers facts and stores Claude's answer. It does not score, rank by relevance or decide verdicts.
import { EffectDirection, EvidenceScope, EvidenceType, QualityRating, VerificationStatus, Verdict } from '@prisma/client';

/**
 * How a study relates to the formulation being assessed. This is a FACT read from the database links,
 * not a judgement: ingredient evidence is never finished-product proof, and Claude is told so.
 */
export type EvidenceRelation =
  | 'FINISHED_EXACT' // finished-product study linked to THIS formulation
  | 'FINISHED_OTHER' // finished-product study of a DIFFERENT formulation
  | 'INGREDIENT'; // study of an ingredient or simple vehicle

/** One evidence record as sent to Claude (also stored as the immutable evidence snapshot). */
export interface EvidenceCandidate {
  id: string;
  title: string;
  evidenceType: EvidenceType;
  scope: EvidenceScope;
  relation: EvidenceRelation;
  benefits: string[];
  ingredientNames: string[];
  sourceName: string;
  doi: string | null;
  pmid: string | null;
  publishedAt: string | null;
  studyDesign: string;
  sampleSize: number | null;
  population: string;
  durationWeeks: number | null;
  testedSubject: string;
  testedConcentration: number | null;
  formulatedConcentration: number | null; // concentration of the linked ingredient in THIS formulation (a fact from the formula)
  endpoint: string;
  resultsSummary: string;
  effectDirection: EffectDirection;
  effectMagnitude: number | null;
  limitations: string;
  quality: QualityRating;
  status: VerificationStatus;
}

export interface ClaimInput {
  id: string;
  title: string; // the claim wording
  description: string | null;
  benefits: string[];
  targetValue: number | null;
  measurementUnit: string;
  durationWeeks: number | null;
  targetPopulation: string | null;
}

export interface FormulationInput {
  id: string;
  productName: string;
  ingredients: { ingredientId: string; name: string; inciName: string; percentage: number; function: string; minConcentration: number | null; maxConcentration: number | null }[];
}

export interface EvidencePackage {
  claim: ClaimInput;
  formulation: FormulationInput;
  evidence: EvidenceCandidate[];
}

// ───────────── Structured AI output (everything below comes from Claude) ─────────────

export interface EvidenceNote {
  evidenceId: string;
  note: string;
}

/** How Claude used each study. */
export type UsageRole = 'SUPPORTS' | 'DISAGREES' | 'BACKGROUND';

export interface EvidenceUsage {
  evidenceId: string;
  role: UsageRole;
}

export interface AiAssessment {
  verdict: Verdict;
  /** 0-100: how strongly the supplied evidence supports the claim as worded. Claude's own judgement. */
  score: number;
  scoreExplanation: string;
  summary: string;
  strengths: string[];
  limitations: string[];
  ingredientEvidenceAnalysis: EvidenceNote[];
  formulationEvidenceAnalysis: EvidenceNote[];
  contradictoryEvidence: EvidenceNote[];
  evidenceRoles: EvidenceUsage[];
  missingEvidence: string[];
  recommendedTests: string[];
  evidenceReferences: string[];
  reasoning: string;
}
