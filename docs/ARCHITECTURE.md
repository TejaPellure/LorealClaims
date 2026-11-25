# Architecture

```
Browser (React SPA) --same origin--> NestJS (REST /api + static SPA) --Prisma--> PostgreSQL
                                          |
                                          +--HTTP + bearer token--> Claude bridge (host) --> `claude -p`
```
One deployable application. The browser only talks to NestJS on its own origin; the bridge URL and token exist only in the server environment.

## Decisions
| Decision | Reason |
|---|---|
| Single NestJS app serving the SPA | One container to run and secure; no CORS |
| PostgreSQL + Prisma | Relational integrity, `Decimal` concentrations, typed migrations |
| Metadata retrieval, no vector DB | Evidence is small and structured (ingredient, endpoint, duration, concentration); SQL filtering is explainable and auditable |
| Claude does all the judging | Verdict, score and explanations come from one place, the model; the backend only gathers facts, validates the shape and stores the answer |
| Strict prompt + playbook | The scientific rules (ingredient evidence is not product proof; SUPPORTED needs a study of the exact formula) are stated to Claude, not coded around it |
| Immutable snapshots | An assessment is a record; later edits never rewrite it |
| Claude through a host bridge | The Claude CLI uses the user's login, which a container cannot reach |
| No review stage, statuses or versions | The product needs one short path from formula to answer; every extra step was removed |

## Backend modules (`apps/api/src/modules`)
`ingredients`, `evidence` (+ PDF upload/download), `products` (product + formulation, 100% validation), `claims`, `assessments` (engine + controllers). Cross-cutting code in `common/` (config, error filter, pagination, Decimal interceptor, health) and `prisma/`.

## Assessment engine (`modules/assessments/engine`)
`evidence-retrieval.ts` -> `providers/providers.ts` (Claude via bridge) -> `ai-schema.ts` (shape validation) -> `assessment-pipeline.ts` (orchestrates and stores). See [AI_ASSESSMENT_ENGINE.md](AI_ASSESSMENT_ENGINE.md).

## Frontend (`apps/web/src`)
`pages/` (Formulate, Claims, Report, Ingredients, Evidence), `features/` (studio, claims, evidence, ingredients), `components/ui` primitives, `services/api.ts`, `hooks/`, `layouts/`. Native React state only.

## Request flow: submitting a claim
1. UI `POST /api/claims` (product, title; optionally description, benefit chips, improvement %, weeks, population). The server binds the product's formulation.
2. UI `POST /api/claims/assess { claimId }`.
3. Server loads claim + formulation + ingredients, checks readiness (title present, formulation = 100%) and gathers every verified study for the formula's ingredients.
4. Duplicate inputs return the stored assessment; concurrent identical runs share one call.
5. Claude returns structured JSON (verdict, score, explanations, the role of each study) via the bridge; the server validates its shape (one retry with feedback) and saves it unchanged with snapshots.
6. The saved assessment is returned; the UI shows the report.

## Limitations
No authentication, rate limiting or audit log. The Claude bridge targets a trusted local machine. In-flight duplicate protection is in memory (a database lock would be needed for several replicas). Evaluations take about 1-2 minutes and run inside the HTTP request (a job queue would be the next step).
