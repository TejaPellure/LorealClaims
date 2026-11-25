---
name: domain-model
description: Domain entities, relationships, formulation versioning and the claim lifecycle of the Claims Intelligence Engine. Use when changing the Prisma schema, services, seed data or anything touching products, formulations, claims, evidence or assessments.
---

# Domain model

## Entities
- **Ingredient**: catalogue item (INCI name unique, category, optional sourced reference range, `VERIFIED|UNVERIFIED|DEMO`).
- **Evidence**: one study/report. `scope` = `INGREDIENT` or `FINISHED_PRODUCT`; `benefitCategories[]`; `effectDirection`; optional `effectMagnitude` (only if the source states it); `quality`; one record is reused by many ingredients/formulations. Linked through `IngredientEvidence` and `FormulationEvidence`. PDFs: `UploadedDocument` (server-generated stored name).
- **Product** -> many **Formulation** versions (`version` unique per product) -> many **FormulationIngredient** (`Decimal` percentage, `position`).
- **Claim**: structured (category, endpoint, target value + unit, duration, population). Belongs to a product; `formulationId` is nullable only while it is a business proposal.
- **Assessment**: result for one claim + one formulation version, with `claimSnapshot`, `formulationSnapshot`, `evidenceSnapshot`, deterministic `evidenceScore`, validated `aiResult`, `guardrailNotes`, human review fields. **AssessmentEvidence** lists the evidence used and its role (`SUPPORTING|CONTRADICTORY|CONTEXT`).

## Versioning rules
- `DRAFT` formulations are editable in place. `FINAL` is immutable (409 on edit); changing it creates the next version.
- Submitting a claim for assessment (`READY_FOR_ASSESSMENT`) finalises its formulation.
- Finished-product evidence is linked to the **exact version** tested. On another version it counts only as "different formulation" evidence.
- Assessments never read live data after creation; the snapshots are the record.

## Claim lifecycle
`DRAFT -> SUBMITTED -> UNDER_MANAGER_REVIEW -> ACCEPTED_FOR_FORMULATION | REJECTED -> FORMULATION_IN_PROGRESS -> AWAITING_EVIDENCE -> READY_FOR_ASSESSMENT -> ASSESSED -> APPROVED_BY_EVALUATOR | REQUIRES_MORE_EVIDENCE | REJECTED`
Transition table: `apps/api/src/modules/claims/claim-rules.ts`. `ASSESSED` and `APPROVED_BY_EVALUATOR` are set only by the assessment/review endpoints.

## Checklist when changing the model
Schema + migration, DTOs, seed JSON + `validateDemoData`, snapshot shapes (`engine/types.ts`), docs/DATABASE_DESIGN.md, tests.
