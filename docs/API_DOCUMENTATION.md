# API documentation

Base URL: `http://localhost:3000/api`. JSON in/out. Optional header `x-demo-persona: BUSINESS | CLAIM_MANAGER | SCIENTIST | EVALUATOR` is recorded as `createdBy`/`reviewedBy` (**demo label, not authentication**).

## Conventions
- **Lists** (`GET` collections) accept `page` (default 1) and `pageSize` (default 20, max 100) and return `{ items, total, page, pageSize }`.
- **Errors**: `{ "statusCode", "error", "message", "details"?, "path", "timestamp" }`. Validation errors have `message: "Validation failed"` and `details: string[]`. Internal errors never expose stack traces or SQL.
- Request bodies are validated with `whitelist` + `forbidNonWhitelisted`: unknown fields are rejected.
- Decimals are returned as numbers.

## Health and dashboard
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status:"ok",database:"up"}`; 503 when the DB is down |
| GET | `/dashboard/summary` | KPI totals, verdict distribution, claims by status |
| GET | `/dashboard/recent-activity` | recent products, assessments, evidence, pending claims |

## Ingredients
`GET /ingredients` (`q`, `category`, `status`) · `GET /ingredients/:id` · `POST /ingredients` · `PATCH /ingredients/:id` · `GET /ingredients/:id/evidence`

## Evidence
`GET /evidence` (`q`, `evidenceType`, `scope`, `status`, `ingredientId`) · `GET /evidence/:id` · `POST /evidence` (with `ingredientIds`, `formulationIds`) · `PATCH /evidence/:id` · `POST /evidence/:id/upload` (multipart `file`, PDF only, size limit `MAX_UPLOAD_MB`, signature checked) · `GET /evidence/:id/download`

## Products and formulations
`GET/POST /products`, `GET/PATCH /products/:id` · `GET /products/:id/formulations`
`GET /formulations/:id` (includes `composition` check) · `POST /formulations` (`productId`, `ingredients[{ingredientId, percentage}]`, `status` DRAFT|FINAL) · `POST /formulations/:id/versions` (next version of the same product) · `PATCH /formulations/:id` (DRAFT only; FINAL returns 409) · `GET /formulations/compare?from=&to=` (added/removed/changed ingredients, evidence gained/lost, previous/latest assessment)

A FINAL formulation must total 100% (tolerance 0.001); drafts may be incomplete but never exceed 100%.

## Claims
`GET /claims` (`q`, `status`, `productId`) · `GET /claims/:id` · `POST /claims` · `PATCH /claims/:id` · `PATCH /claims/:id/status` (`{status, managerNotes?}`; transitions enforced; `READY_FOR_ASSESSMENT` validates readiness and finalises the formulation; `ASSESSED`/`APPROVED_BY_EVALUATOR` cannot be set manually)

## Assessments
| Method | Path | Notes |
|---|---|---|
| POST | `/claims/assess` | Body `{ "claimId": uuid, "forceNew"?: boolean }`. Returns the saved assessment plus `reused` (true when an identical assessment already existed). 400 not ready, 404 unknown claim, 502 invalid AI output, 503 provider unavailable, 504 provider timeout, 422 refusal |
| GET | `/assessments` | `q`, `verdict`, `reviewDecision` |
| GET | `/assessments/meta` | active provider, model, prompt/rubric versions, weights |
| GET | `/assessments/:id` | full report incl. score breakdown, snapshots, evidence links |
| GET | `/claims/:id/assessments` | history for a claim |
| PATCH | `/assessments/:id/review` | `{decision: APPROVED\|REJECTED\|MORE_EVIDENCE_REQUESTED, comments?}`; comments required unless approving; updates claim status if it is the latest assessment |

### Example
```
POST /api/claims/assess  { "claimId": "3f0c1f5e-2b1a-4c3d-9e8f-1a2b3c4d5e6f" }
-> 201 { "id": "...", "verdict": "INCONCLUSIVE", "evidenceScore": 65, "provider": "MOCK",
         "scoreBreakdown": { "total": 65, "breakdown": [ ... ] }, "aiResult": { ... }, "evidence": [ ... ], "reused": false }
```
