-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('BASE', 'HUMECTANT', 'ACTIVE', 'EMOLLIENT', 'BARRIER_LIPID', 'PRESERVATIVE', 'TEXTURIZER', 'ANTIOXIDANT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('CLINICAL_STUDY', 'DERMATOLOGICAL_STUDY', 'INSTRUMENTAL_MEASUREMENT', 'IN_VITRO_RESEARCH', 'LITERATURE_REVIEW', 'FINISHED_PRODUCT_TRIAL', 'SAFETY_COMPATIBILITY_STUDY');

-- CreateEnum
CREATE TYPE "EvidenceScope" AS ENUM ('INGREDIENT', 'FINISHED_PRODUCT');

-- CreateEnum
CREATE TYPE "QualityRating" AS ENUM ('HIGH', 'MODERATE', 'LOW', 'VERY_LOW');

-- CreateEnum
CREATE TYPE "EffectDirection" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "EvidenceRole" AS ENUM ('SUPPORTING', 'CONTRADICTORY', 'CONTEXT');

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inciName" TEXT NOT NULL,
    "chemicalName" TEXT,
    "description" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL,
    "primaryFunction" TEXT NOT NULL,
    "commonApplications" TEXT[],
    "minConcentration" DECIMAL(7,4),
    "maxConcentration" DECIMAL(7,4),
    "concentrationSource" TEXT,
    "solubility" TEXT,
    "compatibilityNotes" TEXT,
    "regulatoryNotes" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "evidenceType" "EvidenceType" NOT NULL,
    "scope" "EvidenceScope" NOT NULL,
    "benefits" TEXT[],
    "sourceName" TEXT NOT NULL,
    "doi" TEXT,
    "pmid" TEXT,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "studyDesign" TEXT NOT NULL,
    "sampleSize" INTEGER,
    "population" TEXT NOT NULL,
    "durationWeeks" INTEGER,
    "testedSubject" TEXT NOT NULL,
    "testedConcentration" DECIMAL(7,4),
    "endpoint" TEXT NOT NULL,
    "resultsSummary" TEXT NOT NULL,
    "effectDirection" "EffectDirection" NOT NULL,
    "effectMagnitude" DECIMAL(7,2),
    "limitations" TEXT NOT NULL,
    "quality" "QualityRating" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientEvidence" (
    "ingredientId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientEvidence_pkey" PRIMARY KEY ("ingredientId","evidenceId")
);

-- CreateTable
CREATE TABLE "FormulationEvidence" (
    "formulationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormulationEvidence_pkey" PRIMARY KEY ("formulationId","evidenceId")
);

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formulation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Formulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulationIngredient" (
    "id" TEXT NOT NULL,
    "formulationId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FormulationIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "formulationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "benefits" TEXT[],
    "targetValue" DECIMAL(8,2),
    "measurementUnit" TEXT NOT NULL DEFAULT '%',
    "durationWeeks" INTEGER,
    "targetPopulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "formulationId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "evidenceScore" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "missingEvidence" TEXT[],
    "recommendedTests" TEXT[],
    "guardrailNotes" TEXT[],
    "aiResult" JSONB NOT NULL,
    "rawResponse" JSONB,
    "claimSnapshot" JSONB NOT NULL,
    "formulationSnapshot" JSONB NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentEvidence" (
    "assessmentId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "role" "EvidenceRole" NOT NULL,
    "relevanceScore" DECIMAL(4,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "AssessmentEvidence_pkey" PRIMARY KEY ("assessmentId","evidenceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_inciName_key" ON "Ingredient"("inciName");

-- CreateIndex
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");

-- CreateIndex
CREATE INDEX "Ingredient_status_idx" ON "Ingredient"("status");

-- CreateIndex
CREATE INDEX "Ingredient_name_idx" ON "Ingredient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_doi_key" ON "Evidence"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_pmid_key" ON "Evidence"("pmid");

-- CreateIndex
CREATE INDEX "Evidence_evidenceType_idx" ON "Evidence"("evidenceType");

-- CreateIndex
CREATE INDEX "Evidence_scope_idx" ON "Evidence"("scope");

-- CreateIndex
CREATE INDEX "Evidence_status_idx" ON "Evidence"("status");

-- CreateIndex
CREATE INDEX "Evidence_title_idx" ON "Evidence"("title");

-- CreateIndex
CREATE INDEX "IngredientEvidence_evidenceId_idx" ON "IngredientEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "FormulationEvidence_evidenceId_idx" ON "FormulationEvidence"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_storedName_key" ON "UploadedDocument"("storedName");

-- CreateIndex
CREATE INDEX "UploadedDocument_evidenceId_idx" ON "UploadedDocument"("evidenceId");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE INDEX "Formulation_productId_idx" ON "Formulation"("productId");

-- CreateIndex
CREATE INDEX "FormulationIngredient_ingredientId_idx" ON "FormulationIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "FormulationIngredient_formulationId_ingredientId_key" ON "FormulationIngredient"("formulationId", "ingredientId");

-- CreateIndex
CREATE INDEX "Claim_productId_idx" ON "Claim"("productId");

-- CreateIndex
CREATE INDEX "Claim_formulationId_idx" ON "Claim"("formulationId");

-- CreateIndex
CREATE INDEX "Assessment_claimId_createdAt_idx" ON "Assessment"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_formulationId_idx" ON "Assessment"("formulationId");

-- CreateIndex
CREATE INDEX "Assessment_verdict_idx" ON "Assessment"("verdict");

-- CreateIndex
CREATE INDEX "Assessment_inputHash_idx" ON "Assessment"("inputHash");

-- CreateIndex
CREATE INDEX "AssessmentEvidence_evidenceId_idx" ON "AssessmentEvidence"("evidenceId");

-- AddForeignKey
ALTER TABLE "IngredientEvidence" ADD CONSTRAINT "IngredientEvidence_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientEvidence" ADD CONSTRAINT "IngredientEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationEvidence" ADD CONSTRAINT "FormulationEvidence_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationEvidence" ADD CONSTRAINT "FormulationEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formulation" ADD CONSTRAINT "Formulation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationIngredient" ADD CONSTRAINT "FormulationIngredient_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationIngredient" ADD CONSTRAINT "FormulationIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvidence" ADD CONSTRAINT "AssessmentEvidence_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvidence" ADD CONSTRAINT "AssessmentEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

