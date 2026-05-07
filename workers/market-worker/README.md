# Market Worker

Worker externo del Core de Inteligencia de Mercado (`docs/core-sistema-mercado*.md`).
Captura listings desde portales inmobiliarios y persiste en Neon como
`MarketRawListing`. La app principal (Vercel) lo invoca por HTTP usando
`MarketWorkerClient` (`lib/workers/contracts/market-worker-client.ts`).

## Arquitectura

- Server HTTP: Fastify (`src/server.ts`).
- Lógica testeable: `lib/workers/market-worker/runtime.ts` (importada del
  monorepo, no duplicada).
- Extractores por portal: `src/portals/<source>/`.
- Persistencia: Prisma client generado con el schema del raíz.

## Endpoints

- `GET /internal/health` — sin auth en producción Railway (lo usa el
  healthcheck), pero acepta el header `x-worker-secret` cuando se quiere
  comprobar el secreto.
- `POST /internal/market/crawl/seed` — protegido por `x-worker-secret`.
  Body: `MarketCrawlSeedRequest` (ver `lib/workers/contracts/market-worker.ts`).

## Desarrollo local

```bash
# Una sola vez
cd workers/market-worker
cp .env.example .env
npm install
npx playwright install --with-deps chromium

# Generar Prisma client (apunta al schema del raíz)
npx prisma generate --schema ../../prisma/schema.prisma

# Arrancar en watch
npm run dev
```

Smoke local desde el repo raíz (en otra terminal):

```bash
npx tsx scripts/test-market-worker-local.ts --limit 5
```

## Deploy a Railway

- Build: `Dockerfile` (incluye Chromium oficial).
- Variables obligatorias: `WORKER_SHARED_SECRET`, `DATABASE_URL`.
- Healthcheck: `GET /internal/health` cada 30s (`railway.json`).
- Sin Bright Data en V1 (Fotocasa es laxo).

## Tests

```bash
npm test
```

Los tests del runtime viven en el repo raíz
(`lib/workers/market-worker/__tests__/`) porque comparten infra con el resto
del monorepo. Aquí solo viven tests específicos del Worker (extractor,
fixtures HTML, server).
