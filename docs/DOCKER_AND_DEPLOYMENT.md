# Docker and deployment

## Run
```powershell
claude auth login          # once, on the host
npm run bridge             # Claude bridge on the host (leave running)
docker compose up --build  # http://localhost:3000
```
The app and database need only Docker. The bridge needs Node.js 22+ and a logged-in Claude CLI on the host.

## Services
| Service | Image | Notes |
|---|---|---|
| `db` | `postgres:16-alpine` | volume `pgdata`; healthcheck `pg_isready` |
| `app` | built from `Dockerfile` | waits for `db` healthy; port 3000; volume `uploads` -> `/data/uploads`; restart `unless-stopped` |

## Image build (multi-stage)
`base` -> `deps` (npm ci) -> `web-build` (Vite) -> `api-build` (Prisma generate + Nest build) -> `prod-deps` (`npm ci --omit=dev`) -> `runtime` (non-root `node` user, healthcheck). The React build is copied to `apps/api/public` and served by `@nestjs/serve-static`; `/api/{*path}` is excluded from the SPA fallback so API 404s stay JSON. `*.tsbuildinfo` is ignored (a stale file would make the compiler skip emit).

## Startup sequence (`docker-entrypoint.sh`)
1. `prisma migrate deploy`, retried up to 30 times (waits for PostgreSQL, then fails with a clear message).
2. `tsx prisma/seed.ts` (idempotent, only on an empty database).
3. `node apps/api/dist/main.js`.
No `migrate reset` or other destructive command ever runs.

## Environment
See `.env.example`: `POSTGRES_*`, `CLAUDE_BRIDGE_URL`, `CLAUDE_BRIDGE_TOKEN`, `CLAUDE_MODEL`, `CLAUDE_TIMEOUT_MS` (default 180000), `MAX_UPLOAD_MB`, `UPLOAD_DIR`. `.env` is git-ignored. Compose has safe local defaults for the database; `CLAUDE_BRIDGE_TOKEN` must be set (the same value for the bridge and the app).

## Persistence
`docker compose down` keeps data. `docker compose down -v` removes `pgdata` and `uploads` (a fresh database reseeds the library). Back up with `docker compose exec db pg_dump -U cie cie > backup.sql`.

## Claude bridge
Runs on the host and is reached at `host.docker.internal:8787` (`extra_hosts` maps it on Linux too). It binds to 127.0.0.1 by default, which Docker Desktop on Windows can reach. If your Docker setup cannot reach it, set `BRIDGE_HOST=0.0.0.0` (the bearer token still protects it; restrict with a firewall). It requires the token, never logs prompts, and runs the CLI with tools disabled.

## Before production
Real authentication and authorisation, rate limiting, audit trail, TLS termination, secret management, backups, malware scanning for uploads, a hosted or hardened Claude integration instead of the local bridge, a job queue for the 1-2 minute evaluations, and a review of `npm audit` advisories in dev tooling.
