-- Claude now gives the score and the per-study roles; the backend rubric, guardrails and match scores are gone.
-- AlterTable
ALTER TABLE "Assessment" DROP COLUMN "scoreBreakdown",
DROP COLUMN "scoringVersion",
DROP COLUMN "guardrailNotes",
ADD COLUMN "scoreExplanation" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "AssessmentEvidence" DROP COLUMN "relevanceScore";
