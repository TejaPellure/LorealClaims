# Claims Intelligence Engine

A cosmetic formulation research and **claims substantiation** platform. Business teams propose claims, claim managers screen them, scientists build formulations, evaluators attach evidence, and an AI assessment engine checks whether the evidence supports each claim, with an explainable, traceable report that a human evaluator then accepts or rejects.

> **Decision support, not approval.** The AI never approves a cosmetic claim. All scores are prototype rubrics requiring scientific validation. Demo formulas are illustrative, not manufacturer recipes.

## Main features

| Area | What it does |
|---|---|
| Dashboard | Live KPIs, outcome distribution, pending workflow actions, recent products / assessments / uploads |
| Ingredient Library | Search + filters, full profile, add/edit, evidence links, sources; verified vs unverified is always shown |
| Evidence Library | 7 evidence categories, ingredient + formulation links, PDF upload (persistent volume), traceable records |
| Formulation Studio | Three-panel workspace with drag-and-drop (`@dnd-kit`), live 100% validation, versioning, claim creation |
| Claims Assessment | 11-state workflow, structured claims bound to an exact formulation version, one-click AI assessment |
| Assessment Report | Verdict, transparent 0-100 evidence score, reasoning, traceable evidence, human evaluator decision |
| Assessment History | Searchable history, immutable snapshots, formulation version comparison |

## Technology stack

NestJS 11 + TypeScript, Prisma 6 + PostgreSQL 16, React 19 + Vite 7, Tailwind CSS v4, shadcn/ui-style components (Radix), Lucide icons, React Router 7, `@dnd-kit`, Docker + Docker Compose. One NestJS app serves both the API and the compiled React SPA.

## Prerequisites

Only **Docker** and **Docker Compose**. No local Node.js or PostgreSQL needed.

## Quick start

```powershell
docker compose up --build
```

Then open:

- App: http://localhost:3000
- API: http://localhost:3000/api
- Health: http://localhost:3000/api/health

The first start builds the image, waits for PostgreSQL, applies migrations (`prisma migrate deploy`), seeds demo data **only if the database is empty**, and starts the server. It runs in **mock AI mode** by default, so no API key is required.

Optional: `copy .env.example .env` to change database credentials or the provider. Compose also works with no `.env` at all.

## AI assessment modes

`ASSESSMENT_PROVIDER` selects the engine:

- `mock` (default): deterministic, evidence-aware rules. The UI shows a **Demo / Mock AI** badge everywhere, and reports state they were not produced by Claude.
- `claude`: real Claude assessment through the **Claude bridge**.

### Enabling Claude

Docker containers cannot reach your logged-in `claude` CLI, so a tiny bridge (`apps/claude-bridge/server.mjs`, no dependencies) runs **on your machine** and turns `claude -p` into an HTTP API. NestJS calls it through `host.docker.internal`.

1. Make sure the Claude Code CLI is installed and signed in on the host (`claude --version`, then run `claude` once to log in).
2. Create `.env` from `.env.example` and set a bridge token (treat it like an API key; `.env` is git-ignored):
   ```powershell
   node -e "console.log('cie_'+require('crypto').randomBytes(24).toString('hex'))"
   ```
   Put the output in `CLAUDE_BRIDGE_TOKEN=` and set `ASSESSMENT_PROVIDER=claude`.
3. Start the bridge on the host (needs Node.js 22+ on the host, for this optional step only):
   ```powershell
   npm run bridge
   ```
4. Restart the stack: `docker compose up -d --force-recreate app`.

The token and bridge URL never reach the browser. The bridge listens on `127.0.0.1`, requires the bearer token, and runs the CLI with tools disabled. See [docs/AI_ASSESSMENT_ENGINE.md](docs/AI_ASSESSMENT_ENGINE.md).

## Demo walkthrough

1. **Dashboard**: all numbers come from the database.
2. **Claims**: open *"Reduces wrinkle depth by 20% in 12 weeks"* (Ready for assessment) and click **Run AI assessment**.
3. Read the report: the score, why the verdict is *Inconclusive* (ingredient evidence only), missing evidence and recommended tests.
4. Open *"Increases skin hydration by 25% in 4 weeks"*: finished-product evidence exists, so it is *Supported*. Switch persona to **Evaluator** to record a decision.
5. **Formulation Studio**: pick *Revitalizing Skin Serum*, drag in ingredients, watch the 100% meter, save a new version.
6. **Assessment History > Formulation versions**: compare v1 and v2.

## Sample data

`prisma/seed-data/demo-data.json`: 11 ingredients, 13 evidence records, 3 products (4 formulation versions), 6 claims, and 4 mock assessments with evaluator comments.

- **6 evidence records are real publications** whose DOI/PMID were checked against PubMed on 2026-11-25; summaries restate only what each abstract says.
- **7 records are fictitious DEMO studies** (no DOI/PMID, flagged "Demo data" in the UI) so the demo can show finished-product evidence, conflicting evidence and weak evidence.
- **All formulas are `ILLUSTRATIVE`** reconstructions with round example percentages. Manufacturers do not publish exact percentages, and none are claimed.

Details and sources: [docs/RESEARCH_AND_ASSUMPTIONS.md](docs/RESEARCH_AND_ASSUMPTIONS.md).

## Database behaviour

- Migrations are committed in `prisma/migrations` and applied with `prisma migrate deploy` at startup. Nothing destructive ever runs automatically.
- The seed runs only when ingredients, evidence and products are all empty. Restarts never reseed or overwrite data.
- Data lives in the named volume `pgdata`; uploaded PDFs live in `uploads`.

```powershell
docker compose down          # stop; data is kept
docker compose up -d         # start again, data intact
docker compose down -v       # DELETES the database and uploads (fresh start, reseeds)
```

## API

All endpoints are under `/api`; see [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md). The core endpoint is `POST /api/claims/assess` with `{ "claimId": "<uuid>" }`: the server loads the claim, formulation and evidence from PostgreSQL itself, so the client can never supply evidence.

## Tests

Tests run without a database or API key (Prisma and Claude are mocked):

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:22-bookworm-slim sh -c "npm ci && npx prisma generate && npm test"
```

Or, if Node.js 22+ is installed locally: `npm ci; npx prisma generate; npm test`.

## Security and demo limitations

Implemented: Helmet headers, global input validation (`whitelist` + `forbidNonWhitelisted`), 1 MB JSON limit, PDF-only uploads with size limit and signature check, server-generated file names, safe errors, non-root container, secrets only in server environment.

**Demo-only, needs work before production:** the persona selector is a label (`x-demo-persona` header), **not authentication or authorisation**; there is no rate limiting, audit log, SSO or RBAC; the Claude bridge is intended for a trusted local machine.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot reach the server` in UI | `docker compose ps`; check `docker compose logs app` |
| App restarts repeatedly | Database unhealthy: `docker compose logs db`; verify `.env` credentials match the existing volume (`docker compose down -v` resets) |
| Port 3000 busy | Change the mapping in `docker-compose.yml` (`"3001:3000"`) |
| Claude assessment returns 503 | Bridge not running, wrong `CLAUDE_BRIDGE_TOKEN`, or `claude` not logged in on the host |
| Claude assessment returns 502 | Model returned invalid JSON twice; retry. Nothing unvalidated is saved |
| Windows line-ending error in entrypoint | The repo stores `docker-entrypoint.sh` with LF; keep `core.autocrlf=input` |

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_DESIGN.md) · [API](docs/API_DOCUMENTATION.md) · [AI engine](docs/AI_ASSESSMENT_ENGINE.md) · [Business workflow](docs/BUSINESS_WORKFLOW.md) · [Research](docs/RESEARCH_AND_ASSUMPTIONS.md) · [Docker](docs/DOCKER_AND_DEPLOYMENT.md) · [Technical proposal](docs/TECHNICAL_PROPOSAL.md) · [Roadmap](docs/PRODUCT_ROADMAP.md)
