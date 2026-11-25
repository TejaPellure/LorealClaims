# Docker and deployment

## Run
```powershell
docker compose up --build        # http://localhost:3000
```
Requires only Docker + Docker Compose.

## Services
| Service | Image | Notes |
|---|---|---|
| `db` | `postgres:16-alpine` | volume `pgdata`; healthcheck `pg_isready` |
| `app` | built from `Dockerfile` | waits for `db` healthy; port 3000; volume `uploads` -> `/data/uploads`; restart `unless-stopped` |

## Image build (multi-stage)
`base` -> `deps` (npm ci) -> `web-build` (Vite) -> `api-build` (Prisma generate + Nest build) -> `prod-deps` (`npm ci --omit=dev`) -> `runtime` (non-root `node` user, `NODE_ENV=production`, healthcheck). The React build is copied to `apps/api/public` and served by `@nestjs/serve-static`; `/api/{*path}` is excluded from the SPA fallback so API 404s stay JSON.

## Startup sequence (`docker-entrypoint.sh`)
1. `prisma migrate deploy` with up to 30 retries (waits for PostgreSQL, then fails with a clear message).
2. `tsx prisma/seed.ts` (idempotent, only on an empty DB).
3. `node apps/api/dist/main.js`.
No `migrate reset` or other destructive command ever runs.

## Environment
See `.env.example`. Key variables: `POSTGRES_*`, `ASSESSMENT_PROVIDER` (`mock`|`claude`), `CLAUDE_BRIDGE_URL`, `CLAUDE_BRIDGE_TOKEN`, `CLAUDE_MODEL`, `CLAUDE_TIMEOUT_MS`, `SCORING_WEIGHTS`, `SUPPORTED_MIN_SCORE`, `MAX_UPLOAD_MB`, `UPLOAD_DIR`. `.env` is git-ignored; compose has safe local defaults so it also runs without one.

## Persistence
`docker compose down` keeps data. `docker compose down -v` removes `pgdata` and `uploads` (a fresh database reseeds). Back up with `docker compose exec db pg_dump -U cie cie > backup.sql`.

## Claude bridge (optional)
Runs on the host (`npm run bridge`); the container reaches it at `host.docker.internal:8787` (`extra_hosts` maps it on Linux too). It is not a Compose service because it needs the host's Claude login. It binds to 127.0.0.1 by default; with Docker Desktop this is reachable from containers. If your Docker setup cannot reach it, set `BRIDGE_HOST=0.0.0.0` (the bearer token still protects it, and restrict with a firewall).

## Before production
Real authentication/authorisation (SSO + RBAC), rate limiting, audit trail, TLS termination, secret management, backups, malware scanning for uploads, a hardened or hosted Claude integration instead of the local bridge, dependency audit (`npm audit` reports advisories in dev tooling that should be reviewed).
