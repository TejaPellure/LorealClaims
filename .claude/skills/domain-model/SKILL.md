 (tags)---
name: domain-model
description: Domain entities, relationships and the simplified formulate-claim-result flow of Claims Intelligence. Use when changing the Prisma schema, services, seed data or anything touching products, claims, evidence or assessments.
---

# Domain model

## Entities
- **Ingredient**: library item (unique INCI name, category, optional sourced reference range, `VERIFIED|UNVERIFIED`).
- **Evidence**: one study. `scope` INGREDIENT or FINISHED_PRODUCT; `benefitCategories[]`; `effectDirection`; optional `effectMagnitude` (only if the source states it); `quality`. Linked to ingredients (`IngredientEvidence`) and, for finished-product studies, to the exact formulation tested (`FormulationEvidence`). PDFs: `UploadedDocument` (server-generated stored name).
- **Product** -> **Formulation** (created together, immutable; schema allows several for the future) -> **FormulationIngredient** (`Decimal` percentage, `position`; must total 100).
- **Claim**: wording (required) + optional description, benefit tags (presets or custom), improvement %, weeks and population, bound to one formulation. Claude reads the text and the fields together.
- **Assessment**: result for one claim: Claude model, prompt version, verdict, Claude's 0-100 score and explanation, validated `aiResult`, immutable snapshots (claim, formulation, evidence). **AssessmentEvidence** lists the evidence used and its role (SUPPORTING / CONTRADICTORY / CONTEXT).

## Flow
Create product (+formulation) -> create claim -> `POST /claims/assess` (UI does both in one submit) -> report. A claim can be evaluated again; every result is kept. There are no claim statuses, reviews, personas or versions.

## Rules
- A product's formulation never changes; a different composition is a new product.
- Assessments never read live data after creation; the snapshots are the record.
- Finished-product evidence applies to the exact formulation it is linked to; for any other formulation it is "different formulation" evidence.

## Checklist when changing the model
Schema + migration, DTOs, seed JSON + `validateReferenceData`, snapshot shapes (`engine/types.ts`), docs/DATABASE_DESIGN.md, tests.
