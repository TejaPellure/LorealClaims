---
name: docker-workflow
description: Docker architecture, multi-stage build, startup sequence (migrate then seed), volumes, Claude bridge networking and troubleshooting for the Claims Intelligence Engine. Use when editing Dockerfile, docker-compose.yml, entrypoint, migrations or deployment docs.
---

# Docker workflow

## Services (`docker-compose.yml`)
- `db`: `postgres:16-alpine`, volume `pgdata`, `pg_isready` healthcheck.
- `app`: built from `Dockerfile`, `depends_on: db: service_healthy`, port 3000, volume `uploads` at `/data/uploads`, `restart: unless-stopped`, `extra_hosts: host.docker.internal:host-gateway`.
React is **not** a separate server: Vite output is copied into `apps/api/public` and served by NestJS (`/api/{*path}` is excluded from the SPA fallback).

## Dockerfile stages
`base` (node:22-bookworm-slim + openssl) -> `deps` (`npm ci`) -> `web-build` (vite) -> `api-build` (prisma generate + nest build) -> `prod-deps` (`npm ci --omit=dev` + generate) -> `runtime` (non-root `node` user, healthcheck on `/api/health`).
`prisma` and `tsx` are production dependencies because the entrypoint runs `prisma migrate deploy` and `tsx prisma/seed.ts`.

## Startup (`docker-entrypoint.sh`)
1. `prisma migrate deploy` in a retry loop (waits for the DB; fails with a clear message after 30 tries).
2. `tsx prisma/seed.ts`: idempotent, seeds only an empty DB.
3. `node apps/api/dist/main.js`.
Never add `migrate reset`, `db push --force-reset`, or truncation here.

## Commands
```
docker compose up --build        docker compose logs -f app
docker compose down              docker compose down -v   # deletes data
docker compose exec db psql -U cie -d cie
```

## Claude bridge
Runs on the host (`npm run bridge`), reached at `CLAUDE_BRIDGE_URL=http://host.docker.internal:8787` with `CLAUDE_BRIDGE_TOKEN`. It is not part of Compose because the container cannot access the host's Claude login.

## Troubleshooting
App crash-loops: `docker compose logs db app`; password mismatch with an existing `pgdata` volume -> recreate the volume or restore credentials. `exec ./docker-entrypoint.sh: no such file` -> CRLF line endings. Prisma "openssl" errors -> the base image must keep `openssl`.
