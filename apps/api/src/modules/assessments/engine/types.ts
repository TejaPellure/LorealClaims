// Shared types for the claim assessment engine.
import { EffectDirection, EvidenceRole, EvidenceScope, EvidenceType, QualityRating, VerificationStatus, Verdict } from '@prisma/client';

/**
 * How a piece of evidence relates to the formulation being assessed.
 * This distinction is the heart of the scientific rules: ingredient evidence is never finished-product proof.
 */
export type EvidenceRelation =
  | 'FINISHED_EXACT' // finished-product study of THIS formulation
  | 'FINISHED_OTHER' // finished-product study of a DIFFERENT formulation
  | 'INGREDIENT'; // study of an ingredient or simple vehicle

/** 0..1 match factors between one evidence record and the claim/formulation. */
export interface MatchFactors {
  endpoint: number; // endpoint family match, scaled by reported magnitude vs claimed target
  concentration: number;
  duration: number;
  population: number;
  quality: number; // methodological quality weight
  scope: number; // directness of the evidence (finished > ingredient)
  fit: number; // blended score used only to pick the "anchor" evidence
  magnitudeShortfall: boolean; // reported effect is smaller than the claimed effect
}

/** One evidence record as seen by the assessment (also stored as the immutable evidence snapshot). */
export interface EvidenceCandidate {
  id: string;
  title: string;
  evidenceType: EvidenceType;
  scope: EvidenceScope;
  relation: EvidenceRelation;
  role: EvidenceRole;
  categoryMatch: boolean;
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
  formulatedConcentration: number | null; // concentration of the linked ingredient in THIS formulation
  endpoint: string;
  resultsSummary: string;
  effectDirection: EffectDirection;
  effectMagnitude: number | null;
  limitations: string;
  quality: QualityRating;
  status: VerificationStatus;
  factors: MatchFactors;
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

export interface CriterionScore {
  key: string;
  label: string;
  weight: number;
  value: number; // 0..1
  points: number;
  explanation: string;
}

export interface ScoreResult {
  total: number; // 0..100
  rubricVersion: string;
  anchorEvidenceId: string | null;
  breakdown: CriterionScore[];
  disclaimer: string;
}

export interface EvidencePackage {
  claim: ClaimInput;
  formulation: FormulationInput;
  evidence: EvidenceCandidate[];
}

// ───────────── Structured AI output ─────────────

export interface EvidenceNote {
  evidenceId: string;
  note: string;
}

export interface AiAssessment {
  verdict: Verdict;
  summary: string;
  strengths: string[];
  limitations: string[];
  ingredientEvidenceAnalysis: EvidenceNote[];
  formulationEvidenceAnalysis: EvidenceNote[];
  contradictoryEvidence: EvidenceNote[];
  missingEvidence: string[];
  recommendedTests: string[];
  evidenceReferences: string[];
  reasoning: string;
}
