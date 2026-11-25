# API documentation

Base URL: `http://localhost:3000/api`. JSON in/out.

## Conventions
- **Lists** accept `page` (default 1) and `pageSize` (default 20, max 100) and return `{ items, total, page, pageSize }`.
- **Errors**: `{ "statusCode", "error", "message", "details"?, "path", "timestamp" }`. Validation errors have `message: "Validation failed"` and `details: string[]`. Internal errors never expose stack traces or SQL.
- Bodies are validated with `whitelist` + `forbidNonWhitelisted`: unknown fields are rejected.
- Decimals are returned as numbers.

## Health
`GET /health` -> `{status:"ok",database:"up"}`; 503 when the database is down.

## Ingredients
`GET /ingredients` (`q`, `category`, `status`) · `GET /ingredients/:id` · `POST /ingredients` · `PATCH /ingredients/:id` · `GET /ingredients/:id/evidence`

## Evidence
`GET /evidence` (`q`, `evidenceType`, `scope`, `status`, `ingredientId`) · `GET /evidence/:id` · `POST /evidence` (with `benefits` tags, `ingredientIds`, `formulationIds`) · `PATCH /evidence/:id` · `POST /evidence/:id/upload` (multipart `file`; PDF only; size limit `MAX_UPLOAD_MB`; signature checked) · `GET /evidence/:id/download`

## Products
`GET /products` (`q`) · `GET /products/:id` · `POST /products` with `{ name, ingredients: [{ ingredientId, percentage }] }`. The product and its formulation are created together; the composition must total exactly 100% (tolerance 0.001) with no duplicates, otherwise 400 with details.

## Claims
`GET /claims` (`q`, `productId`) · `GET /claims/:id` · `POST /claims` with `{ productId, title, description?, benefits?, targetValue?, durationWeeks?, targetPopulation?, measurementUnit? }`. Only `productId` and `title` are required; blank strings count as missing. `benefits` are tags (presets such as `acne-blemishes` or any custom text, normalised to lower-case hyphenated tags). The server uses the product's formulation.

## Assessments
| Method | Path | Notes |
|---|---|---|
| POST | `/claims/assess` | Body `{ "claimId": uuid, "forceNew"?: boolean }`. Returns the saved assessment plus `reused` (true if an identical assessment already existed). 400 not ready, 404 unknown claim, 422 refusal, 502 invalid Claude output, 503 Claude unavailable (bridge down, not logged in), 504 timeout |
| GET | `/assessments` | `q`, `verdict` |
| GET | `/assessments/meta` | Claude model and prompt version |
| GET | `/assessments/:id` | full report: breakdown, snapshots, evidence links |
| GET | `/claims/:id/assessments` | every evaluation of a claim |

### Example
```
POST /api/claims/assess  { "claimId": "3f0c1f5e-2b1a-4c3d-9e8f-1a2b3c4d5e6f" }
-> 201 { "id": "...", "verdict": "INCONCLUSIVE", "evidenceScore": 63, "model": "sonnet",
         "scoreBreakdown": { ... }, "aiResult": { ... }, "evidence": [ ... ], "reused": false }
```
