# Architecture

## Overview
```
Browser (React SPA)  --same-origin-->  NestJS (REST /api + static SPA)  --Prisma-->  PostgreSQL
                                            |
                                            +--(optional, ASSESSMENT_PROVIDER=claude)-->  Claude bridge (host) --> `claude -p`
```
One deployable application. The browser only ever talks to NestJS on the same origin; the Claude bridge URL and token exist only in the server environment.

## Why this shape (justification)
| Decision | Reason |
|---|---|
| Single NestJS app serving the SPA | One container to run and secure; no CORS; trivial `docker compose up` |
| PostgreSQL + Prisma | Relational integrity for versioned formulations, `Decimal` for concentrations, typed migrations |
| Metadata retrieval, no vector DB | Evidence is small and structured (ingredient, endpoint, duration, concentration). SQL filtering is explainable and auditable; semantic search is a roadmap item |
| Deterministic score + LLM reasoning | The score must be transparent and reproducible; the LLM adds explanation, not arithmetic |
| Backend guardrails on the verdict | Scientific rules (ingredient != product evidence) are enforced in code, not only in a prompt |
| Immutable snapshots | An assessment is a record; later edits must not rewrite it |
| Provider abstraction (mock / claude) | App is demonstrable offline; other models can be added later |
| Claude bridge on the host | The Claude CLI authenticates with the user's login, unreachable from a container |

## Backend modules (`apps/api/src/modules`)
`ingredients`, `evidence` (+ PDF upload/download), `products`, `formulations` (versioning, compare, composition rules), `claims` (workflow rules), `assessments` (engine + controllers), `dashboard` (+ health). Cross-cutting code in `common/` (config, error filter, pagination, persona header, Decimal interceptor) and `prisma/`.

## Assessment engine (`modules/assessments/engine`)
`evidence-retrieval.ts` -> `scoring.ts` -> `providers/providers.ts` -> `ai-schema.ts` (validation) -> `guardrails.ts` -> `assessment-pipeline.ts` (orchestrates and persists). Details: [AI_ASSESSMENT_ENGINE.md](AI_ASSESSMENT_ENGINE.md).

## Frontend (`apps/web/src`)
`pages/` routes, `features/` (studio, claims, evidence, ingredients), `components/ui` primitives, `services/api.ts` (single HTTP layer), `hooks/`, `layouts/`. State is native React; no state library.

## Request flow: `POST /api/claims/assess`
1. Validate body (`claimId` UUID only).
2. Load claim + formulation + ingredients from PostgreSQL; check status and readiness (100% total, required fields).
3. Retrieve and classify evidence; compute match factors and the deterministic score.
4. Fingerprint inputs; return the existing assessment for an identical duplicate (unless `forceNew`); share one in-flight run for concurrent duplicates.
5. Provider generates a structured result; validate (retry once with feedback); apply guardrails.
6. Transaction: save assessment + evidence links + snapshots, set claim `ASSESSED`.
7. Return the saved assessment.

## Extensibility
Provider interface, versioned prompt/rubric, evidence relations and snapshot JSON leave room for literature search, PDF extraction, regulatory checks, RBAC/SSO and audit trails without restructuring (see [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)).

## Known limitations
Persona selector is not authentication. No rate limiting, audit log or background jobs. The seed script runs TypeScript with `tsx` inside the image. Single-instance in-flight duplicate protection (in memory) would need a DB lock for multiple replicas.
