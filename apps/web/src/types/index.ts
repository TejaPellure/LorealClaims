// API types, mirroring the NestJS responses. Decimals arrive as numbers (see DecimalInterceptor).

export type Verdict = 'SUPPORTED' | 'NOT_SUPPORTED' | 'INCONCLUSIVE';
export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED';
export type EvidenceScope = 'INGREDIENT' | 'FINISHED_PRODUCT';
export type QualityRating = 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Source { name: string; url?: string }

export interface Ingredient {
  id: string; name: string; inciName: string; chemicalName?: string | null; description: string; category: string;
  primaryFunction: string; commonApplications: string[]; minConcentration?: number | null; maxConcentration?: number | null;
  concentrationSource?: string | null; solubility?: string | null; compatibilityNotes?: string | null; regulatoryNotes?: string | null;
  sources: Source[]; status: VerificationStatus; evidenceCount: number; createdAt: string; updatedAt: string;
}

export interface Evidence {
  id: string; title: string; evidenceType: string; scope: EvidenceScope; benefits: string[]; sourceName: string;
  doi?: string | null; pmid?: string | null; sourceUrl?: string | null; publishedAt?: string | null; studyDesign: string;
  sampleSize?: number | null; population: string; durationWeeks?: number | null; testedSubject: string; testedConcentration?: number | null;
  endpoint: string; resultsSummary: string; effectDirection: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  effectMagnitude?: number | null; limitations: string; quality: QualityRating; status: VerificationStatus; createdAt: string;
  ingredientLinks?: { ingredient: { id: string; name: string; inciName: string } }[];
  formulationLinks?: { formulation: { id: string; product: { id: string; name: string } } }[];
  documents?: { id: string; originalName: string; sizeBytes: number }[];
}

export interface Product {
  id: string; name: string; createdAt: string; _count: { claims: number };
  formulations: { id: string; ingredients: { ingredientId: string; percentage: number; ingredient: { id: string; name: string; inciName: string; category: string } }[] }[];
}

export interface Claim {
  id: string; productId: string; title: string; description?: string | null; benefits: string[]; targetValue?: number | null;
  measurementUnit: string; durationWeeks?: number | null; targetPopulation?: string | null; createdAt: string;
  product: { id: string; name: string };
  assessments: { id: string; verdict: Verdict; evidenceScore: number; createdAt: string }[];
  _count: { assessments: number };
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
  id: string; createdAt: string; verdict: Verdict; evidenceScore: number; model: string;
  claim: { id: string; title: string; product: { id: string; name: string } };
}

export interface Assessment extends AssessmentSummary {
  promptVersion: string; scoringVersion: string; scoreBreakdown: ScoreResult; summary: string; reasoning: string;
  missingEvidence: string[]; recommendedTests: string[]; guardrailNotes: string[]; aiResult: AiResult;
  claim: AssessmentSummary['claim'] & { description?: string | null; benefits: string[]; targetValue?: number | null; measurementUnit: string; durationWeeks?: number | null; targetPopulation?: string | null };
  formulationSnapshot: { productName: string; ingredients: { name: string; inciName: string; percentage: number }[] };
  evidenceSnapshot: { id: string; relation: string; role: string; title: string; ingredientNames: string[] }[];
  evidence: { evidenceId: string; role: 'SUPPORTING' | 'CONTRADICTORY' | 'CONTEXT'; relevanceScore: number; note?: string | null; evidence: { id: string; title: string; scope: EvidenceScope; status: VerificationStatus; doi?: string | null; pmid?: string | null; documents: { id: string }[] } }[];
  reused?: boolean;
}
