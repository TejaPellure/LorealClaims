#!/bin/sh
# Container startup: wait for PostgreSQL -> apply committed migrations -> idempotent seed -> start API.
# Never runs `prisma migrate reset` or any destructive command.
set -e

echo "[startup] Applying database migrations (waiting for PostgreSQL if needed)..."
attempt=1
until ./node_modules/.bin/prisma migrate deploy; do
  if [ "$attempt" -ge 30 ]; then
    echo "[startup] ERROR: PostgreSQL is not reachable or migrations failed after $attempt attempts." >&2
    echo "[startup] Check DATABASE_URL and that the 'db' container is healthy (docker compose ps)." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  echo "[startup] Database not ready, retrying in 2s (attempt $attempt/30)..."
  sleep 2
done

echo "[startup] Running idempotent seed (only populates an empty database)..."
./node_modules/.bin/tsx prisma/seed.ts

echo "[startup] Starting Claims Intelligence Engine..."
exec node apps/api/dist/main.js
