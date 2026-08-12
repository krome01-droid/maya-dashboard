# ============================================
# MAYA Dashboard — Dockerfile (Hostinger VPS)
# Next.js 16 — sortie standalone
# ============================================
FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Étage de production ----
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Bundle standalone de Next (embarque son propre serveur)
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3850/admin-maya/api/auth/session || exit 1

EXPOSE 3850
ENV PORT=3850
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
