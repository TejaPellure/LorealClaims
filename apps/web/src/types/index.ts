// API types, mirroring the NestJS responses. Decimals arrive as numbers (see DecimalInterceptor).

export type Persona = 'BUSINESS' | 'CLAIM_MANAGER' | 'SCIENTIST' | 'EVALUATOR';
export type Verdict = 'SUPPORTED' | 'NOT_SUPPORTED' | 'INCONCLUSIVE';
export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'DEMO';
export type BenefitCategory = 'HYDRATION' | 'ANTI_WRINKLE' | 'BARRIER_REPAIR' | 'BRIGHTENING' | 'SOOTHING' | 'OTHER';
export type EvidenceScope = 'INGREDIENT' | 'FINISHED_PRODUCT';
export type QualityRating = 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';
export type ReviewDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'MORE_EVIDENCE_REQUESTED';
export type ClaimStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_MANAGER_REVIEW' | 'ACCEPTED_FOR_FORMULATION' | 'FORMULATION_IN_PROGRESS'
  | 'AWAITING_EVIDENCE' | 'READY_FOR_ASSESSMENT' | 'ASSESSED' | 'APPROVED_BY_EVALUATOR' | 'REQUIRES_MORE_EVIDENCE' | 'REJECTED';

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

export interface Source { name: string; url?: string }

export interface Ingredient {
  id: string; name: string; inciName: string; chemicalName?: string | null; description: string; category: string;
  primaryFunction: string; commonApplications: string[]; minConcentration?: number | null; maxConcentration?: number | null;
  concentrationSource?: string | null; solubility?: string | null; compatibilityNotes?: string | null; regulatoryNotes?: string | null;
  sources: Source[]; status: VerificationStatus; evidenceCount: number; createdAt: string; updatedAt: string;
}

export interface Evidence {
  id: string; title: string; evidenceType: string; scope: EvidenceScope; benefitCategories: BenefitCategory[]; sourceName: string;
  doi?: string | null; pmid?: string | null; sourceUrl?: string | null; publishedAt?: string | null; studyDesign: string;
  sampleSize?: number | null; population: string; durationWeeks?: number | null; testedSubject: string; testedConcentration?: number | null;
  endpoint: string; methodology: string; resultsSummary: string; effectDirection: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  effectMagnitude?: number | null; limitations: string; quality: QualityRating; status: VerificationStatus; createdAt: string;
  ingredientLinks?: { ingredient: { id: string; name: string; inciName: string } }[];
  formulationLinks?: { formulation: { id: string; version: number; product: { id: string; name: string } } }[];
  documents?: { id: string; originalName: string; sizeBytes: number }[];
}

export interface FormulationLine { id?: string; ingredientId: string; percentage: number; position?: number; ingredient: Ingredient }

export interface CompositionCheck { total: number; remaining: number; status: 'EMPTY' | 'UNDER' | 'OVER' | 'VALID'; errors: string[]; warnings: string[] }

export interface Formulation {
  id: string; productId: string; version: number; status: 'DRAFT' | 'FINAL'; basis: 'DISCLOSED' | 'ILLUSTRATIVE'; basisNote?: string | null;
  notes?: string | null; createdAt: string; product: { id: string; name: string }; ingredients: FormulationLine[];
  composition: CompositionCheck; claims?: { id: string; title: string; status: ClaimStatus }[];
}

export interface Product {
  id: string; name: string; description: string; category: string; createdAt: string;
  formulations: { id: string; version: number; status: 'DRAFT' | 'FINAL'; basis: string }[];
  _count: { formulations: number; claims: number };
}

export interface Claim {
  id: string; productId: string; formulationId: string | null; title: string; description: string; benefitCategory: BenefitCategory;
  targetOutcome: string; measurementEndpoint: string; targetValue: number; measurementUnit: string; durationWeeks: number;
  targetPopulation: string; applicationFrequency?: string | null; scientificContext?: string | null; status: ClaimStatus;
  managerNotes?: string | null; createdBy: string; createdAt: string; updatedAt: string;
  product: { id: string; name: string }; formulation: { id: string; version: number; status: string } | null;
  assessments: { id: string; verdict: Verdict; evidenceScore: number; createdAt: string; reviewDecision: ReviewDecision; provider: string }[];
}

export interface CriterionScore { key: string; label: string; weight: number; value: number; points: number; explanation: string }
export interface ScoreResult { total: number; rubricVersion: string; breakdown: CriterionScore[]; disclaimer: string; anchorEvidenceId: string | null }
export interface EvidenceNote { evidenceId: string; note: string }

export interface AiResult {
  verdict: Verdict; summary: string; strengths: string[]; limitations: string[]; ingredientEvidenceAnalysis: EvidenceNote[];
  formulationEvidenceAnalysis: EvidenceNote[]; contradictoryEvidence: EvidenceNote[]; missingEvidence: string[];
  recommendedTests: string[]; evidenceReferences: string[]; reasoning: string;
}

export interface AssessmentSummary {
  id: string; createdAt: string; verdict: Verdict; evidenceScore: number; provider: 'MOCK' | 'CLAUDE'; model?: string | null;
  reviewDecision: ReviewDecision; reviewedBy?: string | null; reviewedAt?: string | null;
  claim: { id: string; title: string; status: ClaimStatus; product: { id: string; name: string } };
  formulation: { id: string; version: number };
}

export interface Assessment extends Omit<AssessmentSummary, 'formulation'> {
  formulation: { id: string; version: number; basis: 'DISCLOSED' | 'ILLUSTRATIVE'; product: { id: string; name: string } };
  promptVersion: string; scoringVersion: string; scoreBreakdown: ScoreResult; summary: string; reasoning: string;
  missingEvidence: string[]; recommendedTests: string[]; guardrailNotes: string[]; aiResult: AiResult; reviewComments?: string | null;
  claimSnapshot: Record<string, unknown>;
  formulationSnapshot: { productName: string; version: number; basis: string; ingredients: { name: string; inciName: string; percentage: number }[] };
  evidenceSnapshot: { id: string; relation: string; role: string; title: string; ingredientNames: string[] }[];
  evidence: { evidenceId: string; role: 'SUPPORTING' | 'CONTRADICTORY' | 'CONTEXT'; relevanceScore: number; note?: string | null; evidence: { id: string; title: string; scope: EvidenceScope; status: VerificationStatus; doi?: string | null; pmid?: string | null; documents: { id: string }[] } }[];
  reused?: boolean;
}

export interface AssessmentMeta {
  provider: 'MOCK' | 'CLAUDE'; isMock: boolean; model: string; promptVersion: string; rubricVersion: string;
  weights: Record<string, number>; supportedMinScore: number;
}

export interface VersionComparison {
  from: { id: string; version: number; product: { name: string }; composition: CompositionCheck };
  to: { id: string; version: number; product: { name: string }; composition: CompositionCheck };
  added: { ingredient: string; percentage: number }[];
  removed: { ingredient: string; percentage: number }[];
  changed: { ingredient: string; from: number; to: number }[];
  evidence: { gained: { id: string; title: string; scope: string }[]; lost: { id: string; title: string; scope: string }[]; unchangedCount: number };
  previousAssessment: { id: string; verdict: Verdict; evidenceScore: number; createdAt: string; claim: { title: string } } | null;
  latestAssessment: { id: string; verdict: Verdict; evidenceScore: number; createdAt: string; claim: { title: string } } | null;
}
