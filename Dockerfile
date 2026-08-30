# syntax=docker/dockerfile:1
#
# Production image for the rootloot / NutJob Next.js app.
#
# Node 20 matches the NODE_VERSION that was pinned in netlify.toml — the only
# record of the intended runtime version anywhere in the repo. Next 16 needs
# Node 20.9+, which node:20-alpine satisfies.
#
# Relies on `output: 'standalone'` in next.config.ts.

# ---- deps -------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are INLINED INTO THE CLIENT BUNDLE at build time. They
# must be present in this stage, not just at runtime. In Coolify each of these
# must be ticked "Available at build time" — otherwise the container boots
# healthy and every browser request fails, which looks like a Supabase outage
# rather than a config mistake.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_OPENROUTER_CONFIGURED
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_OPENROUTER_CONFIGURED=$NEXT_PUBLIC_OPENROUTER_CONFIGURED

ENV NEXT_TELEMETRY_DISABLED=1
# Measured on the target box 2026-08-30: 7.7 GB total, ~2.7 GB available once
# Coolify, the other project's stack and NutJob's own Supabase stack are running,
# plus 3.7 GB free swap.
#
# 3072 rather than 4096 deliberately: a higher cap doesn't reserve memory, it
# just lets V8 defer GC until the heap is that large — which on this box means
# pushing well over a gigabyte into swap and thrashing. A tighter cap makes V8
# collect sooner and stay closer to RAM. If a build ever fails with
# "JavaScript heap out of memory", raise this rather than assuming the box is
# too small; that error is explicit, whereas an OOM kill just looks like a
# container that died for no reason.
ENV NODE_OPTIONS=--max-old-space-size=3072

RUN npm run build

# ---- runner -----------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# HOSTNAME=0.0.0.0 binds inside the CONTAINER's own network namespace, which is
# correct and is not a public exposure — Coolify's Traefik proxy fronts this.
# See INFRA.md §5.
CMD ["node", "server.js"]
