# Database design

Schema: `prisma/schema.prisma`. Migration history: `prisma/migrations` (applied with `prisma migrate deploy`).

## Conventions
UUID primary keys, enums for every status, `Decimal` for scientific values (`@db.Decimal(7,4)` for percentages), `createdAt/updatedAt`, explicit foreign keys with `onDelete` behaviour (Restrict where history matters, Cascade for owned children), indexes on foreign keys and searched columns.

## Models
| Model | Purpose | Notable constraints |
|---|---|---|
| `Ingredient` | Catalogue | unique `inciName`; optional sourced `min/maxConcentration`; `status` VERIFIED/UNVERIFIED/DEMO |
| `Evidence` | Study record | `scope` INGREDIENT/FINISHED_PRODUCT; `benefitCategories[]`; unique `doi`, `pmid`; `effectDirection`; optional `effectMagnitude` |
| `IngredientEvidence` | Ingredient <-> evidence (M:N) | composite PK |
| `FormulationEvidence` | Finished-product evidence <-> exact formulation version (M:N) | composite PK |
| `UploadedDocument` | PDF metadata | unique server-generated `storedName` |
| `Product` | Product identity | unique name |
| `Formulation` | Versioned formula | unique `(productId, version)`; `DRAFT/FINAL`; `basis` DISCLOSED/ILLUSTRATIVE |
| `FormulationIngredient` | Line items | unique `(formulationId, ingredientId)`; `percentage` Decimal; `position` |
| `Claim` | Structured claim | `formulationId` nullable until assigned; 11-value `ClaimStatus` |
| `Assessment` | Result + review | snapshots (JSON), `evidenceScore`, `scoreBreakdown`, `aiResult`, `guardrailNotes`, `inputHash`, review fields |
| `AssessmentEvidence` | Evidence used + role | composite PK; role SUPPORTING/CONTRADICTORY/CONTEXT; `relevanceScore` |

## Relationships
Product 1-N Formulation 1-N FormulationIngredient N-1 Ingredient. Formulation 1-N Claim. Claim 1-N Assessment. Evidence M:N Ingredient, Evidence M:N Formulation, Assessment M:N Evidence.

## History preservation
`Assessment.claimSnapshot`, `formulationSnapshot`, `evidenceSnapshot` freeze the exact inputs. `AssessmentEvidence -> Evidence` is `Restrict`, so evidence used in an assessment cannot be deleted (there is no delete API anyway). `FINAL` formulations are immutable at the service level. Editing ingredients, evidence, claims, prompts or models later never alters old reports.

## Duplicate detection
`Assessment.inputHash` = SHA-256 of claim + formulation + evidence package + provider + prompt version + weights. Identical inputs return the stored assessment.

## Seeding
`prisma/seed.ts` validates `demo-data.json` (references, formulas total 100%), checks the database is empty (ingredients + evidence + products = 0), inserts in one transaction, then creates demo assessments with the mock provider. If an interrupted first run left no assessments, it only adds missing demo assessments. It never updates or deletes.
