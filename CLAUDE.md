# CLAUDE.md - Claims Intelligence Engine

## Purpose
Cosmetic formulation research and claims substantiation platform. Scientists build formulations, evaluators attach evidence, an AI engine assesses whether evidence supports each claim, a human evaluator decides. **Decision support only; never regulatory approval.**

## Architecture (keep it this light)
One NestJS app (REST, `/api`) + one PostgreSQL + one compiled React SPA served by NestJS (`@nestjs/serve-static`). Prisma ORM. No microservices, Redis, vector DB or agent frameworks. The only extra process is the optional host-side Claude bridge (`apps/claude-bridge`).

```
apps/api/src/modules/{ingredients,evidence,products,formulations,claims,assessments,dashboard}
apps/api/src/modules/assessments/engine/  retrieval, scoring, prompt, ai-schema, guardrails, providers, pipeline
apps/api/src/common/                      config, error filter, pagination, persona, Decimal interceptor
apps/web/src/{pages,features,components,hooks,services,types,layouts,lib}
apps/claude-bridge/server.mjs             `claude -p` as HTTP (host process, zero deps)
prisma/{schema.prisma,migrations,seed.ts,seed-data/demo-data.json}
docs/  .claude/skills/
```

## Commands
```
docker compose up --build        # run everything (http://localhost:3000)
docker compose down              # stop (data kept); `down -v` DELETES data
npm test                         # API tests (no DB, no API key needed)
npm run build                    # web + api production builds
npm run bridge                   # optional Claude bridge on the host
npx prisma migrate dev --name x  # create a migration (needs a local DATABASE_URL)
```

## Conventions
- TypeScript strict, no unnecessary `any`. Descriptive names, small functions, comments only where logic is non-obvious.
- Controllers thin; business logic in services; DTOs (`class-validator`) for every input. Small modules keep controller + service + DTOs in one `*.module.ts`; the assessment engine is split into files.
- Config is read **only** in `common/config.ts`. Never hardcode secrets.
- Lists return `{ items, total, page, pageSize }`; errors return `{ statusCode, error, message, details?, path, timestamp }`.
- Decimals are serialised as numbers by `DecimalInterceptor`.
- Frontend: native React state + small hooks (`useAsync`, `useFormState`). All HTTP goes through `services/api.ts`. No hardcoded data to fake screens.

## Database rules
- UUID keys, Prisma `Decimal` for all concentrations/scientific values, enums for statuses.
- Formulations are versioned; **FINAL versions are immutable**; claims reference one exact version.
- Assessments store immutable JSON snapshots (claim, formulation, evidence). Never make a past assessment read live data.
- Seed is idempotent and only runs on an empty DB. Never add destructive startup steps (`migrate reset`, truncates).

### Changing the schema
1. Edit `prisma/schema.prisma`.
2. With a dev DB: `npx prisma migrate dev --name <change>`. Without one: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (needs a shadow DB) and add a new folder under `prisma/migrations`.
3. Never edit an already-applied migration. Run `npx prisma generate`, update seed data/DTOs/tests.

## Scientific evidence rules (never violate)
1. Ingredient evidence does **not** prove a finished-product benefit.
2. Distinguish ingredient-level, finished-product (exact version), other-formulation, different-concentration and contradictory evidence.
3. Never fabricate studies, DOIs, PMIDs, results or evidence IDs. Missing evidence is stated, not invented.
4. Missing evidence is not proof a claim is false: use INCONCLUSIVE.
5. The score is computed by backend rules (`engine/scoring.ts`), labelled a prototype rubric, never presented as a probability.
6. Demo data must stay labelled (`DEMO` evidence, `ILLUSTRATIVE` formulas). Never present exact percentages as a manufacturer's unless a credible public source states them.
7. AI verdicts pass `validateAiAssessment` and `applyGuardrails` before saving. The human decision is stored separately from the AI verdict.

## Testing
Jest in `apps/api/test`. Mock Prisma and `fetch`; never call a real model in tests. Add tests with every rule change (composition, scoring, guardrails, pipeline, seed, endpoints).
