# syntax=docker/dockerfile:1
# Multi-stage build: dependencies -> React build -> NestJS build -> slim production image.

FROM node:22-bookworm-slim AS base
# openssl + CA certs are required by the Prisma engine and outbound HTTPS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && apt-get clean
WORKDIR /app

# Stage 1: install all workspace dependencies (cached while package files are unchanged)
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Stage 2: build the React SPA (Vite) -> apps/web/dist
FROM deps AS web-build
COPY apps/web apps/web
RUN npm run build -w apps/web

# Stage 3: generate the Prisma client and compile NestJS -> apps/api/dist
FROM deps AS api-build
COPY prisma prisma
COPY apps/api apps/api
RUN npx prisma generate && npm run build -w apps/api

# Stage 4: production-only dependencies (+ Prisma client for the runtime)
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev
COPY prisma prisma
RUN npx prisma generate

# Stage 5: runtime image
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
COPY --from=prod-deps /app/node_modules ./node_modules
# npm may nest workspace-specific versions under apps/api/node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
# The seed script (run with tsx) imports the pure assessment/validation modules from source.
COPY --from=api-build /app/apps/api/src ./apps/api/src
# React build is served by NestJS from apps/api/public
COPY --from=web-build /app/apps/web/dist ./apps/api/public
COPY prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
