# CLAUDE.md - Claims Intelligence

## Purpose
Scientists build a product formula, state a claim, and Claude evaluates whether the evidence library supports it. **Decision support only; never regulatory approval.** This is a proof of concept (the header shows a PoC tag). The AI is real; the library is mostly real PubMed-verified evidence, plus two starter products and three invented "internal clinical study" records in `prisma/seed-data/reference-data.json` so all three verdicts can be demonstrated. There is no mock AI and no fake workflow.

## Flow
Formulate (product + ingredients = 100%) -> Claim (title required; description, benefit chips, numbers optional; auto-evaluated by Claude) -> Result report (History button lists past claims). No review stage, no claim statuses, no personas, no formulation versions: a product is always new and has one immutable formulation.

## Architecture (keep it this light)
One NestJS app (REST `/api`) + one PostgreSQL + one compiled React SPA served by NestJS. Prisma ORM. No microservices, Redis, vector DB or agent frameworks. The only extra process is the host-side Claude bridge (`apps/claude-bridge`), which wraps `claude -p`.

```
apps/api/src/modules/{ingredients,evidence,products,claims,assessments}
apps/api/src/modules/assessments/engine/  retrieval, playbook, prompt, ai-schema, providers (Claude), pipeline
apps/api/src/common/                      config, error filter, pagination, Decimal interceptor, health
apps/web/src/{pages,features,components,hooks,services,types,layouts,lib}
apps/claude-bridge/server.mjs             `claude -p` as authenticated HTTP (host process, zero deps)
prisma/{schema.prisma,migrations,seed.ts,seed-data/reference-data.json}
docs/  .claude/skills/
```

## Commands
```
claude auth login                 # once, on the host
npm run bridge                    # Claude bridge (host); needs CLAUDE_BRIDGE_TOKEN in .env
docker compose up --build         # app + database -> http://localhost:3000
docker compose down               # stop (data kept); `down -v` DELETES data
npm test                          # API tests (no DB, no Claude needed)
npm run build                     # web + api production builds
```

## Conventions
- TypeScript strict, no unnecessary `any`, descriptive names, small functions, comments only where logic is non-obvious.
- Controllers thin; logic in services; DTOs (`class-validator`) for every input. Small modules keep controller + service + DTOs in one `*.module.ts`; the assessment engine is split into files.
- Config is read **only** in `common/config.ts`. Never hardcode secrets.
- Lists return `{ items, total, page, pageSize }`; errors `{ statusCode, error, message, details?, path, timestamp }`. Decimals are serialised as numbers.
- Frontend: native React state + small hooks. All HTTP through `services/api.ts`. Brand style: see the frontend-design skill. Keep forms short; derive what the server can derive.

## Database rules
UUID keys, `Decimal` for concentrations, enums for statuses. A claim references one formulation. Assessments store immutable JSON snapshots (claim, formulation, evidence): never make a past assessment read live data. The seed is idempotent and only runs on an empty database; never add destructive startup steps.

### Changing the schema
Edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` (needs a dev DB) or `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` into a new migration folder. Never edit an applied migration. Run `npx prisma generate`; update seed, DTOs, tests, docs.

## Scientific evidence rules (never violate)
1. Ingredient evidence does **not** prove a finished-product benefit.
2. Distinguish ingredient-level, finished-product (this formula), other-formulation, different-concentration and contradictory evidence.
3. Never fabricate studies, DOIs, PMIDs, results or evidence IDs. The only invented evidence is the PoC set listed in docs/RESEARCH_AND_ASSUMPTIONS.md (source "Internal clinical study", no DOI/PMID); do not add more without recording it there. Missing evidence is stated.
4. Missing evidence is not proof a claim is false: use INCONCLUSIVE.
5. Claude does all the judging: verdict, 0-100 score, which studies matter and every explanation. The backend must not score, filter by relevance, match keywords or override verdicts; it only gathers facts, validates the shape of the answer and stores it.
6. Claude's output passes `validateAiAssessment` (shape and cited ids only) before saving. The scientific rules (for example SUPPORTED needs a study of this exact formula) live in the prompt and playbook.

## Testing
Jest in `apps/api/test`. Replace Prisma and the provider with test doubles; never call the real model in tests. Add tests with every rule change.
