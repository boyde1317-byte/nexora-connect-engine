# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/

RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

COPY . .

# Generate Prisma client
RUN pnpm --filter @workspace/api-server run db:generate

# Build
RUN pnpm --filter @workspace/api-server run build

# ─── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/node_modules ./api-server-modules

# Prisma client
COPY --from=builder /app/artifacts/api-server/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/artifacts/api-server/node_modules/@prisma ./node_modules/@prisma

EXPOSE 5000

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
