# Claims Intelligence

Formulate a cosmetic product, write the claim you want to make, and **Claude evaluates whether the available scientific evidence supports it**, with an explainable, traceable report.

> Decision support, not approval. The score is a prototype rubric needing scientific validation, and an evaluation never constitutes regulatory approval.

## The flow (3 steps)

1. **Formulate**: type a product name, add ingredients (drag or click Add), set concentrations so they total 100%, save.
2. **Claim**: write a claim title (the only required field), optionally a description, benefit chips (pick presets or add your own) and the numbers you know (improvement %, weeks, population). Claude reads the title, the description and the fields together. Submitting sends it to Claude immediately. Earlier claims are behind the **History** button.
3. **Result**: the report shows the verdict (Supported / Not supported / Inconclusive), a transparent 0-100 evidence score, Claude's reasoning, strengths, limitations, missing evidence, recommended tests and the exact studies used.

Plus two libraries: **Ingredients** (16) and **Evidence** (29 real, PubMed-verified studies, at least one for every ingredient that has any; add your own and upload PDFs). When you evaluate a claim, Claude is given the evidence for the ingredients in your formula, so a niacinamide product claiming fewer pimples or smaller pores is judged against the real niacinamide acne and sebum studies.

## Technology

NestJS 11 + TypeScript, Prisma 6 + PostgreSQL 16, React 19 + Vite 7, Tailwind CSS v4, Radix-based shadcn-style components, Lucide icons, `@dnd-kit`, Docker Compose. One NestJS app serves the API and the compiled React app.

## Prerequisites

- **Docker + Docker Compose** (runs the app and database; no local Node/PostgreSQL needed).
- **Claude Code CLI logged in on your machine** (Claude evaluates every claim through it) and **Node.js 22+ on the host** only to run the small Claude bridge.

## Run

1. One-time Claude login (opens your browser):
   ```powershell
   claude auth login
   ```
2. Create `.env` with a bridge token (treat it like an API key; `.env` is git-ignored):
   ```powershell
   copy .env.example .env
   node -e "console.log('cie_'+require('crypto').randomBytes(24).toString('hex'))"
   ```
   Paste the output into `CLAUDE_BRIDGE_TOKEN=` in `.env`.
3. Start the Claude bridge (leave it running):
   ```powershell
   npm run bridge
   ```
4. Start the app:
   ```powershell
   docker compose up --build
   ```
5. Open http://localhost:3000 (API: http://localhost:3000/api, health: http://localhost:3000/api/health).

### Why a bridge?
Docker containers cannot use your logged-in `claude` CLI. `apps/claude-bridge/server.mjs` (no dependencies) runs on your machine, turns `claude -p` into a small authenticated HTTP API, and NestJS calls it through `host.docker.internal`. It listens on 127.0.0.1, requires the bearer token, and runs the CLI with tools disabled. The token and URL never reach the browser.

If the bridge is not running or Claude is not logged in, evaluating a claim shows a clear error and the claim is kept so you can retry. Nothing is faked.

## Database and data

- Migrations (`prisma/migrations`) are applied with `prisma migrate deploy` at startup; nothing destructive ever runs.
- The seed loads the ingredient library and the verified evidence **only when the database is empty**. Restarts never reseed or overwrite data. Products, claims and assessments are created by you.
- Data lives in the Docker volumes `pgdata` and `uploads`.

```powershell
docker compose down        # stop, keep data
docker compose up -d       # start again
docker compose down -v     # DELETE all data (fresh start, reseeds)
```

## About the data

`prisma/seed-data/reference-data.json`:
- **Evidence**: 29 real publications. DOI/PMID were checked against PubMed on 2026-11-25 and summaries restate only what each abstract says (numbers only where the abstract gives them). None of these studies tested *your* formulas, so most claims will correctly come back **Inconclusive** (with a score showing how close the ingredient evidence is) until finished-product evidence for your formula is added in the Evidence library and linked to the product.
- **Proof-of-concept data**: the app header carries a **PoC** tag because part of the library is invented so that every verdict can be demonstrated: two starter products (Radiance Serum, Clear Pore Serum) and three "internal clinical study" records of those exact formulas, which have no DOI or PMID. Everything else is real. The invented records are listed in [docs/RESEARCH_AND_ASSUMPTIONS.md](docs/RESEARCH_AND_ASSUMPTIONS.md). Try these claims:

  | Product | Claim | Expected |
  |---|---|---|
  | Radiance Serum | Brightens and evens skin tone by 20% in 4 weeks | **Supported**: a finished-product trial of this exact formula shows 28% in 4 weeks |
  | Radiance Serum | Reduces wrinkle depth by 15% in 8 weeks | **Inconclusive**: only ingredient-level wrinkle studies, no trial of this formula |
  | Clear Pore Serum | Reduces the look of pores by 25% in 8 weeks | **Supported**: its trial shows 32% |
  | Clear Pore Serum | Brightens skin tone by 20% in 4 weeks | **Not supported**: its own trial found no brightness change, even though niacinamide alone has brightening studies |

  Claude makes the final call, so wording and verdicts can vary slightly.
- **Ingredients**: 16, general descriptions. An ingredient is Verified when it has at least one attached study or regulatory source. Purified water and xanthan gum are vehicle ingredients with no efficacy studies, so they stay unverified.

See [docs/RESEARCH_AND_ASSUMPTIONS.md](docs/RESEARCH_AND_ASSUMPTIONS.md).

## API

`POST /api/claims/assess` with `{ "claimId": "<uuid>" }` loads the claim, formula and evidence from PostgreSQL itself (the client can never supply evidence), calls Claude, saves and returns the assessment. Full list: [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

## Tests

Tests need no database and no Claude login (Prisma and the bridge are replaced by test doubles):

```powershell
npm ci; npx prisma generate; npm test
```

## Security notes

Helmet headers, strict input validation (unknown fields rejected), 1 MB JSON limit, PDF-only uploads with size limit and signature check, server-generated file names, safe errors, non-root container. **Not production-ready**: there is no user authentication or authorisation, rate limiting or audit log, and the Claude bridge is meant for a trusted local machine.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach the Claude bridge" | Run `npm run bridge` on the host; check `CLAUDE_BRIDGE_TOKEN` is the same for the bridge and the app (`.env`), then `docker compose up -d --force-recreate app` |
| "Failed to authenticate" / OAuth expired | Run `claude auth login` again on the host |
| Evaluation takes ~1-2 minutes | Normal: Claude reviews the full evidence package; the timeout is 3 minutes (`CLAUDE_TIMEOUT_MS`) |
| App restarts repeatedly | `docker compose logs db app`; credentials in `.env` must match an existing `pgdata` volume (or `down -v`) |
| Port 3000 busy | Change the mapping in `docker-compose.yml` |

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_DESIGN.md) · [API](docs/API_DOCUMENTATION.md) · [AI engine](docs/AI_ASSESSMENT_ENGINE.md) · [Business flow](docs/BUSINESS_WORKFLOW.md) · [Research](docs/RESEARCH_AND_ASSUMPTIONS.md) · [Docker](docs/DOCKER_AND_DEPLOYMENT.md) · [Technical proposal](docs/TECHNICAL_PROPOSAL.md) · [Roadmap](docs/PRODUCT_ROADMAP.md)
