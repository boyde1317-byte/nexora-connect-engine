#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run db:generate
pnpm --filter @workspace/api-server exec prisma migrate deploy --schema ./prisma/schema.prisma
