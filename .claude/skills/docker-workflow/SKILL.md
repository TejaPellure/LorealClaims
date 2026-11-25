---
name: docker-workflow
description: Docker architecture, multi-stage build, startup sequence (migrate then seed), volumes, Claude bridge networking and troubleshooting for Claims Intelligence. Use when editing Dockerfile, docker-compose.yml, entrypoint, migrations or deployment docs.
---

# Docker workflow

## Services (`docker-compose.yml`)
- `db`: `postgres:16-alpine`, volume `pgdata`, `pg_isready` healthcheck.
- `app`: built from `Dockerfile`, waits for `db` healthy, port 3000, volume `uploads` at `/data/uploads`, `restart: unless-stopped`, `extra_hosts: host.docker.internal:host-gateway`.
React is not a separate server: Vite output is copied into `apps/api/public` and served by NestJS (`/api/{*path}` is excluded from the SPA fallback).

## Dockerfile stages
`base` (node:22-bookworm-slim + openssl) -> `deps` (`npm ci`) -> `web-build` (vite) -> `api-build` (prisma generate + nest build) -> `prod-deps` (`npm ci --omit=dev` + generate) -> `runtime` (non-root `node` user, healthcheck on `/api/health`).
- `prisma` and `tsx` are production dependencies: the entrypoint runs `prisma migrate deploy` and `tsx prisma/seed.ts`.
- npm may nest workspace packages under `apps/api/node_modules`; the runtime stage copies that folder.
- `*.tsbuildinfo` must stay out of the build context (a stale file makes tsc skip emit and `dist` is missing).

## Startup (`docker-entrypoint.sh`)
1. `prisma migrate deploy` in a retry loop (waits for the DB; clear failure after 30 tries).
2. `tsx prisma/seed.ts`: idempotent, seeds only an empty DB.
3. `node apps/api/dist/main.js`.
Never add `migrate reset`, `db push --force-reset` or truncation here.

## Commands
```
docker compose up --build        docker compose logs -f app
docker compose down              docker compose down -v   # deletes data
docker compose exec db psql -U cie -d cie
```

## Claude bridge
Required for every assessment. Runs on the host (`npm run bridge`), reached at `CLAUDE_BRIDGE_URL=http://host.docker.internal:8787` with `CLAUDE_BRIDGE_TOKEN`. Not a Compose service because it needs the host's Claude login (`claude auth login`).

## Troubleshooting
App crash-loops: `docker compose logs db app`; a password mismatch with an existing `pgdata` volume needs the volume recreated. `exec ./docker-entrypoint.sh: no such file` means CRLF line endings. Prisma "openssl" errors mean the base image lost `openssl`. Docker Desktop engine will not start: check `%LOCALAPPDATA%\Docker\log\host` for the cause.
