# Database design

Schema: `prisma/schema.prisma`. Migration history: `prisma/migrations` (applied with `prisma migrate deploy`).

## Conventions
UUID primary keys, enums for statuses, `Decimal` for scientific values (`Decimal(7,4)` for percentages), `createdAt/updatedAt`, explicit foreign keys with `onDelete` (Restrict where history matters, Cascade for owned children), indexes on foreign keys and searched columns.

## Models
| Model | Purpose | Notes |
|---|---|---|
| `Ingredient` | Library | unique `inciName`; optional sourced `min/maxConcentration`; `VERIFIED/UNVERIFIED` |
| `Evidence` | Study record | `scope` INGREDIENT/FINISHED_PRODUCT; `benefits[]` (tags); unique `doi`, `pmid`; `effectDirection`; optional `effectMagnitude`; `studyDesign` holds design and methods |
| `IngredientEvidence` | Ingredient <-> evidence (M:N) | composite PK |
| `FormulationEvidence` | Finished-product evidence <-> the formulation it tested (M:N) | composite PK |
| `UploadedDocument` | PDF metadata | unique server-generated `storedName` |
| `Product` | Product name | always new |
| `Formulation` | A product's composition | immutable once created |
| `FormulationIngredient` | Line items | unique `(formulationId, ingredientId)`; `percentage` Decimal; `position` |
| `Claim` | Claim wording + optional description, `benefits[]`, `targetValue`, `durationWeeks`, `targetPopulation` | bound to one formulation; only the wording is required |
| `Assessment` | Claude's result | `model`, prompt/rubric versions, `verdict`, `evidenceScore`, `scoreBreakdown`, `aiResult`, `guardrailNotes`, `inputHash`, three snapshots |
| `AssessmentEvidence` | Evidence used + role | composite PK; SUPPORTING/CONTRADICTORY/CONTEXT; `relevanceScore` |

## Relationships
Product 1-N Formulation 1-N FormulationIngredient N-1 Ingredient. Formulation 1-N Claim 1-N Assessment. Evidence M:N Ingredient, Evidence M:N Formulation, Assessment M:N Evidence.

## History preservation
`claimSnapshot`, `formulationSnapshot` and `evidenceSnapshot` freeze the exact inputs of every assessment. `AssessmentEvidence -> Evidence` is `Restrict`. Editing ingredients, evidence or claims later never alters an old report. Re-evaluating a claim creates a new assessment and keeps the old ones.

## Duplicate detection
`Assessment.inputHash` = SHA-256 of claim + formulation + evidence package + prompt version + weights. Identical inputs return the stored assessment.

## Seeding
`prisma/seed.ts` validates `seed-data/reference-data.json` (no duplicate keys, every ingredient reference resolves, every evidence record has a DOI, PMID or URL), checks that ingredients and evidence are both empty, and inserts in one transaction. It never updates or deletes. Products, claims and assessments are created only by users.
