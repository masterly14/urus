# syntax=docker/dockerfile:1.6
#
# Imagen del Market Worker para Railway.
#
# - Base: Playwright oficial (incluye Chromium + dependencias del sistema).
# - Runtime: tsx (no se compila a JS, ahorra build step y simplifica deploy).
# - Cliente Prisma se genera en build con el schema del repo principal.
#
# Construir desde la raíz del monorepo:
#   docker build -f workers/market-worker/Dockerfile -t market-worker .

FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_HEADLESS=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1) Dependencias del Worker (instalación reproducible con package-lock)
COPY workers/market-worker/package.json workers/market-worker/package-lock.json workers/market-worker/
WORKDIR /app/workers/market-worker
RUN npm ci --omit=dev --no-audit --no-fund
RUN ln -s /app/workers/market-worker/node_modules /app/node_modules

# 2) Schema Prisma + cliente generado (apuntamos al schema del raíz)
WORKDIR /app
COPY prisma ./prisma
RUN cd workers/market-worker \
    && npx --no-install prisma generate --schema ../../prisma/schema.prisma

# 3) Código fuente: lib/ relevante + src del Worker
# IMPORTANTE: el worker importa código del root del repo via paths relativos
# (../../../../lib/...) y a través de él, código que usa el alias `@/...`
# (resuelto contra `/app` por el tsconfig). Hay que copiar TODOS los
# directorios que el grafo de imports toca en runtime. Cualquier import nuevo
# a `lib/<otro>/...` desde `workers/market-worker` o desde código `lib/`
# arrastrado por él requiere añadir aquí su `COPY` correspondiente.
#
# Cadena actual (lib/scraping/warm-session → lib/scraping/browser → ...):
#   - lib/prisma.ts        ← lazy require desde warm-session si alguna API
#                            legacy se invocara (no debería, pero se incluye
#                            por defensa)
#   - lib/idealista/*      ← createIdealistaBrowser, IDEALISTA_USER_AGENT
#   - lib/fotocasa/*       ← FOTOCASA_USER_AGENT
COPY lib/prisma.ts ./lib/prisma.ts
COPY lib/market ./lib/market
COPY lib/scraping ./lib/scraping
COPY lib/idealista ./lib/idealista
COPY lib/fotocasa ./lib/fotocasa
COPY lib/workers/contracts ./lib/workers/contracts
COPY lib/workers/market-worker ./lib/workers/market-worker
COPY workers/market-worker/src ./workers/market-worker/src
COPY workers/market-worker/tsconfig.json ./workers/market-worker/tsconfig.json

WORKDIR /app/workers/market-worker

EXPOSE 8080

# Healthcheck a /internal/health (Railway también lo configura en railway.json).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_PORT||8080)+'/internal/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
