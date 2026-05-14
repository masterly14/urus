# Plan de Implementación del Core de Inteligencia de Mercado

> Documento operativo. Define el orden, las decisiones bloqueantes, el esquema de base de datos, la orquestación con QStash, la configuración del Worker externo y la comunicación entre la UI y el Worker para construir el Core descrito en `docs/core-sistema-mercado.md`.
>
> **Estado de ejecución (al 6 de mayo de 2026):**
>
> - Fases **0, 1, 2.a y 2.b** completadas.
> - Alcance MVP cerrado en **2 portales activos**: Fotocasa (`source_a`) y Pisos.com (`source_b`).
> - **Milanuncios (`source_c`) e Idealista (`source_d`) quedan fuera del MVP** (requieren Bright Data). El modelo, mappings y scripts de captura los conservan para reactivación futura.
> - **Idealista (Fase 2.c):** la chain anti-bot definitiva quedó cerrada tras la validación operativa de Statefox image cache. Se invierte respecto al diseño abstracto inicial: `webUnlocker` (Bright Data REST, premium domain) es **primary** y `residentialProxy + warm-session-cookies` queda como fallback. Detalle en §4.5 y en `docs/core-sistema-mercado-decisiones.md` §11.
> - Para inventario detallado de lo entregado y la lista cerrada de tareas pendientes para llegar a MVP completo, ver **`docs/core-mvp-status.md`**.

---

## 0. Resumen ejecutivo

El Core se compone de cuatro bloques que se construyen en cascada:

1. **Adquisición** (Worker externo de scraping resiliente).
2. **Normalización + Identidad** (servicios stateless invocados por jobs).
3. **Versionado + Snapshot** (proyecciones de lectura).
4. **Distribución** (API interna, alertas, UI).

Se usa el siguiente stack ya consolidado en la plataforma:

- **Plataforma app/API/UI**: Next.js sobre Vercel.
- **Persistencia + cola**: Neon PostgreSQL (Prisma) con tablas dedicadas para `Event` y `JobQueue`.
- **Scheduler de crons**: Upstash QStash.
- **Worker externo de scraping**: servicio Node.js (Railway) con Playwright + Bright Data.
- **CDN/medios**: Cloudinary.

---

## 1. Orden recomendado de implementación

Se ejecuta en 6 fases. Cada fase es **demoable** y **reversible**.

### Fase 0 — Decisiones bloqueantes (1 día)
Definir antes de escribir código. Sin esto no se puede empezar.

### Fase 1 — Base de datos + contratos (2-3 días)
Migraciones Prisma, enums, tipos TypeScript del dominio.

### Fase 2 — Worker externo de adquisición (4-6 días)
Servicio Railway con health-check, contrato HTTP, anti-bot por estrategia.

### Fase 3 — Pipeline de normalización + identidad (3-5 días)
Job handlers que consumen lo capturado y materializan canonical + clusters.

### Fase 4 — Versionado, snapshot y eventos (3-4 días)
Diff engine, eventos `MARKET_*`, proyección `MarketSnapshot`.

### Fase 5 — Crons en QStash + orquestación end-to-end (2-3 días)
Endpoints `/api/cron/market/*`, scheduler, idempotencia.

### Fase 6 — API interna + UI mínima (3-4 días)
Endpoints `/api/market/*`, panel de salud, panel de búsqueda.

---

## 2. Decisiones bloqueantes (Fase 0)

Estas preguntas deben tener respuesta antes de codificar. **No se asume ninguna**.

### 2.1 Cobertura inicial
- Ciudades objetivo (lista cerrada inicial).
- Tipologías de inmueble cubiertas.
- Operación: solo venta, solo alquiler o ambos.
- Volumen estimado de listings por ciudad.

### 2.2 Fuentes de datos
- Portales objetivo iniciales.
- Estrategia anti-bot por portal: directo / sesión warm / unlocker / proxy residencial.
- Política de respeto a `robots.txt` por fuente.
- Frecuencia mínima por portal y ciudad.

### 2.3 SLOs del sistema
- **Frescura objetivo**: ej. inventario nunca con más de N horas de antigüedad.
- **Cobertura mínima**: porcentaje esperado de listings vivos por ciudad.
- **Latencia API**: percentil 95 de respuesta.
- **Disponibilidad**: porcentaje mensual.

### 2.4 Identidad cross-portal
- Política de merge automático (umbrales).
- Política de revisión manual.
- ¿Se cachean medios o solo URLs?

### 2.5 Privacidad y cumplimiento
- Datos de anunciante: privado vs profesional.
- Política de retención por tipo de tabla.
- Roles y permisos para datasets sensibles.

### 2.6 Presupuesto operativo
- Coste objetivo mensual de proxies/unlocker.
- Coste objetivo mensual de almacenamiento medios.
- Coste objetivo mensual de DB y cómputo.

---

## 3. Esquema de base de datos (Prisma)

Se introduce un namespace `Market*` para evitar acoplamiento con otros dominios.

### 3.1 Enums

```prisma
enum MarketSource {
  source_a
  source_b
  source_c
  source_d
  unknown
}

enum MarketOperation {
  sale
  rent
}

enum MarketHousingType {
  flat
  house
  countryhouse
  duplex
  penthouse
  studio
  loft
  garage
  office
  premises
  land
  building
  storage
  warehouse
  room
}

enum MarketListingStatus {
  active
  inactive
  removed
  blocked
  unknown
}

enum CrawlRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  PARTIAL
}

enum RawListingStatus {
  CAPTURED
  NORMALIZED
  REJECTED
  STALE
}

enum MarketEventType {
  MARKET_LISTING_CREATED
  MARKET_LISTING_UPDATED
  MARKET_LISTING_PRICE_CHANGED
  MARKET_LISTING_STATUS_CHANGED
  MARKET_LISTING_REMOVED
  MARKET_LISTING_REAPPEARED
  MARKET_PROPERTY_MERGED
  MARKET_PROPERTY_SPLIT
  MARKET_SNAPSHOT_REFRESHED
}
```

### 3.2 Tablas principales

```prisma
model MarketSeed {
  id              String         @id @default(cuid())
  source          MarketSource
  operation       MarketOperation
  city            String
  zone            String?
  url             String
  active          Boolean        @default(true)
  priority        Int            @default(100)
  cadenceMinutes  Int            @default(120)
  lastRunAt       DateTime?
  lastCursor      String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@unique([source, operation, city, zone, url])
  @@index([active, lastRunAt])
}

model MarketCrawlRun {
  id              String          @id @default(cuid())
  seedId          String
  source          MarketSource
  status          CrawlRunStatus  @default(PENDING)
  startedAt       DateTime        @default(now())
  finishedAt      DateTime?
  pagesScanned    Int             @default(0)
  itemsCaptured   Int             @default(0)
  itemsRejected   Int             @default(0)
  blockedCount    Int             @default(0)
  errorCode       String?
  errorMessage    String?
  budgetMs        Int             @default(60000)
  budgetRequests  Int             @default(50)
  cursorIn        String?
  cursorOut       String?
  correlationId   String

  @@index([seedId, startedAt])
  @@index([status, startedAt])
  @@index([correlationId])
}

model MarketRawListing {
  id              String            @id @default(cuid())
  source          MarketSource
  externalId      String?
  canonicalUrl    String
  crawlRunId      String
  httpStatus      Int?
  contentHash     String
  payload         Json
  status          RawListingStatus  @default(CAPTURED)
  rejectionReason String?
  capturedAt      DateTime          @default(now())

  @@unique([source, contentHash])
  @@index([crawlRunId])
  @@index([source, externalId])
  @@index([status, capturedAt])
}

model MarketListing {
  id              String              @id @default(cuid())
  source          MarketSource
  externalId      String
  canonicalUrl    String
  operation       MarketOperation
  housingType     MarketHousingType
  status          MarketListingStatus @default(active)

  price           Float?
  currency        String              @default("EUR")
  pricePerMeter   Float?

  builtArea       Float?
  rooms           Int?
  bathrooms       Int?
  floor           String?

  city            String
  zone            String?
  addressApprox   String?
  lat             Float?
  lng             Float?
  geohash         String?

  advertiserType  String?
  advertiserName  String?
  phones          String[]            @default([])

  mainImageUrl    String?
  imageUrls       String[]            @default([])

  qualityScore    Float               @default(0)
  qualityFlags    Json                @default("[]")

  propertyId      String?
  firstSeenAt     DateTime            @default(now())
  lastSeenAt      DateTime            @default(now())
  lastChangeAt    DateTime?

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([source, externalId])
  @@index([city, zone])
  @@index([operation, housingType])
  @@index([status, lastSeenAt])
  @@index([price])
  @@index([propertyId])
  @@index([geohash])
}

model MarketListingVersion {
  id              String          @id @default(cuid())
  listingId       String
  changedFields   String[]
  before          Json
  after           Json
  capturedAt      DateTime        @default(now())

  @@index([listingId, capturedAt])
}

model MarketProperty {
  id              String          @id @default(cuid())
  city            String
  zone            String?
  geohash         String?
  fingerprint     String          @unique
  representativeListingId String?
  listingsCount   Int             @default(0)
  firstSeenAt     DateTime        @default(now())
  lastSeenAt      DateTime        @default(now())
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([city, zone])
  @@index([geohash])
}

model MarketEvent {
  id              String           @id @default(cuid())
  type            MarketEventType
  listingId       String?
  propertyId      String?
  source          MarketSource?
  payload         Json
  fingerprint     String
  correlationId   String
  occurredAt      DateTime         @default(now())

  @@unique([type, fingerprint])
  @@index([type, occurredAt])
  @@index([listingId, occurredAt])
  @@index([propertyId, occurredAt])
  @@index([correlationId])
}

model MarketSnapshotIndex {
  id              String              @id @default(cuid())
  city            String
  housingType     MarketHousingType
  operation       MarketOperation
  freshAt         DateTime            @default(now())
  totalActive     Int                 @default(0)
  priceMin        Float?
  priceMax        Float?
  priceMedian     Float?
  ppmMedian       Float?

  @@unique([city, housingType, operation])
  @@index([freshAt])
}

model MarketCircuitBreaker {
  source          MarketSource     @id
  status          String           @default("CLOSED")
  failureCount    Int              @default(0)
  openedAt        DateTime?
  halfOpenAt      DateTime?
  closedAt        DateTime?
  updatedAt       DateTime         @updatedAt
}
```

### 3.3 Enum extensible en `JobType`

Se añaden los tipos de job del Core:

```
MARKET_DISCOVER_SEEDS
MARKET_CRAWL_SEED
MARKET_FETCH_DETAIL
MARKET_NORMALIZE_BATCH
MARKET_RESOLVE_IDENTITY
MARKET_DIFF_AND_VERSION
MARKET_REFRESH_SNAPSHOT
MARKET_RUN_RULES
MARKET_REINDEX_PROPERTY
```

---

## 4. Worker externo de adquisición

### 4.1 ¿Por qué un worker externo?
- Tiempos de ejecución largos (Playwright, sesiones warm).
- Aislamiento de dependencias pesadas (navegador headless, proxies).
- Aislamiento de IP y sesiones del bloque serverless.
- Posibilidad de mantener pools de sesiones calientes en memoria.

### 4.2 Stack del Worker
- Runtime: Node.js LTS.
- Framework HTTP: Fastify o Express con health-check.
- Scraping: Playwright + Bright Data (Scraping Browser y/o Web Unlocker).
- Persistencia opcional in-process: Redis para pool de sesiones.

### 4.3 Endpoints HTTP del Worker
Todos protegidos por header secreto compartido (`x-worker-secret`).

```
POST /v1/crawl/seed
POST /v1/crawl/detail
GET  /v1/health
GET  /v1/metrics
```

### 4.4 Contrato `POST /v1/crawl/seed`
Request:

```ts
type CrawlSeedRequest = {
  runId: string;
  source: MarketSource;
  operation: MarketOperation;
  url: string;
  cursor?: string;
  budgetMs: number;
  budgetRequests: number;
  traceId: string;
};
```

Response (modo síncrono corto):

```ts
type CrawlSeedResponse =
  | {
      status: "completed";
      itemsCaptured: number;
      pagesScanned: number;
      cursorOut?: string;
    }
  | {
      status: "accepted";
      reason: "BUDGET_EXCEEDED" | "BACKGROUND";
    }
  | {
      status: "blocked";
      reason: string;
    }
  | {
      status: "failed";
      errorCode: string;
      errorReason: string;
    };
```

### 4.5 Estrategias anti-bot (por fuente)

Estrategias disponibles como fetchers componibles en `workers/market-worker/src/fetchers/`:

- `directBrowser` → Playwright Chromium directo, sin proxy.
- `webUnlocker` → Bright Data Web Unlocker (REST `POST /request`, sin browser, factura **solo éxito** en modo default). Cliente compartido con Statefox image cache (`lib/scraping/web-unlocker/client.ts`).
- `residentialProxy` → Playwright + proxy residencial Bright Data (sticky session opcional vía `-session-<id>` en el username).
- `warmSession` → cookies cálidas obtenidas previamente vía Bright Data Scraping Browser CDP en home, persistidas en `PortalWarmSession` (TTL 4 h, `maxRequests` 40). **No es un fetcher por sí sola**: las cookies se inyectan en `residentialProxy` cuando se necesitan.

Composición vía `createChainedFetcher` (`fetchers/chain.ts`): el extractor del portal proporciona `isBlocked(result)` y el chain prueba las estrategias en orden hasta que una devuelva HTML no bloqueado.

Chain recomendada por portal (basada en evidencia operativa, ver `docs/portal-html-analysis.md` y `docs/statefox-image-cache.md`):

| Portal      | Chain                                                                                            | Notas |
| ----------- | ------------------------------------------------------------------------------------------------ | ----- |
| Fotocasa    | `directBrowser` (`scrollToBottom: true`, `hydratedSelector`)                                     | MVP cubre pág. 1; pág. 2+ y fichas requieren `webUnlocker` (post-MVP). |
| Pisos.com   | `directBrowser` (sin scroll)                                                                     | Sin protección reactiva detectada. JSON-LD `SingleFamilyResidence` por anuncio + DOM `<div class="ad-preview">`. |
| Idealista   | `webUnlocker` (premium domain, `country=es`) → `residentialProxy + warm-session-cookies`         | **Bright Data Browser API por CDP devuelve 403 contra Idealista**: el path CDP **solo** se usa para calentar cookies en home antes de la rama `residentialProxy`. Nunca como path primario contra URLs de listing/ficha. Fase 2.c. |
| Milanuncios | `webUnlocker` → `residentialProxy`                                                               | Capturar HTML real con `webUnlocker` antes de implementar. Post-MVP. |

Política operativa:

- Chain ordenada por fuente, declarada al construir el extractor en `server.ts`.
- Circuit breaker por fuente (`MarketCircuitBreaker`) y observabilidad por estrategia (callback `onFallback` del chain).
- Backoff por código de bloqueo (HTTP 401/403/429 → estrategia siguiente; otros errores HTTP → backoff exponencial dentro de la misma estrategia).
- **Custom Headers & Cookies en zone Web Unlocker = NO**. Activarlo factura el 100 % de requests (éxito + fallo). Las cookies cálidas se inyectan por la rama `residentialProxy`.
- **Premium Domain habilitado** en la zone Web Unlocker que se use contra Idealista (sin esto, Bright Data no desbloquea `idealista.com`).

### 4.6 Variables de entorno del Worker

```
# Núcleo
WORKER_PORT=8080
WORKER_SHARED_SECRET=...
DATABASE_URL=postgres://...
LOG_LEVEL=info
SENTRY_DSN=...

# Bright Data — Web Unlocker (path primario contra Idealista; opcional para otros portales)
BRIGHTDATA_API_TOKEN=...
BRIGHTDATA_WEB_UNLOCKER_ZONE=web_unlocker_market   # zone dedicada al Worker (separada de la de Statefox)
BRIGHTDATA_WEB_UNLOCKER_COUNTRY=es
BRIGHTDATA_WEB_UNLOCKER_TIMEOUT_MS=60000

# Bright Data — Scraping Browser CDP (solo se usa para calentar cookies de Idealista; no como path primario)
BRIGHTDATA_SCRAPING_BROWSER_URL=...

# Bright Data — Residential Proxy (fallback de Idealista cuando el Web Unlocker bloquea)
BRIGHTDATA_RESIDENTIAL_PROXY_URL=...
BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME=...
BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD=...
BRIGHTDATA_RESIDENTIAL_PROXY_SESSION=...           # sticky session opcional
```

### 4.7 Persistencia desde el Worker
Dos opciones soportadas:
- **A. Worker escribe directamente a Neon** (más simple, recomendado para volúmenes medios).
- **B. Worker devuelve payload y la app lo persiste** (más control, mayor coste de red).

Recomendación: **A** con Prisma cliente en el Worker apuntando a misma DB.

---

## 5. Crons en QStash

Patrón ya consolidado en la plataforma:
- QStash → POST a un endpoint `/api/cron/market/...` en Vercel.
- El endpoint valida con `isQstashAuthorized`.
- El endpoint encola jobs en `JobQueue` o invoca al Worker externo.

### 5.1 Endpoints cron a crear

```
POST /api/cron/market/discover-seeds
POST /api/cron/market/crawl-tick
POST /api/cron/market/consumer
POST /api/cron/market/refresh-snapshot
POST /api/cron/market/run-rules
POST /api/cron/market/health-check
```

### 5.2 Frecuencias recomendadas

| Endpoint                              | Frecuencia    | Propósito                                       |
| ------------------------------------- | ------------- | ----------------------------------------------- |
| `/cron/market/discover-seeds`         | Cada 15 min   | Selecciona seeds vencidos y encola crawls       |
| `/cron/market/crawl-tick`             | Cada 5 min    | Procesa lote de jobs `MARKET_CRAWL_SEED`        |
| `/cron/market/consumer`               | Cada 1 min    | Procesa jobs intermedios (normalize/identity/diff) |
| `/cron/market/refresh-snapshot`       | Cada 30 min   | Recalcula `MarketSnapshotIndex` por ciudad       |
| `/cron/market/run-rules`              | Cada 10 min   | Ejecuta reglas y produce alertas                 |
| `/cron/market/health-check`           | Cada 5 min    | Mide frescura, cobertura y estado de breakers    |

### 5.3 Esqueleto de endpoint cron

```ts
import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { discoverMarketSeeds } from "@/lib/market/scheduler";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await discoverMarketSeeds();
  return NextResponse.json(result);
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/market/discover-seeds" },
  postHandler,
);

export const maxDuration = 60;
```

### 5.4 Idempotencia obligatoria
- `MARKET_CRAWL_SEED.idempotencyKey = market:crawl:{seedId}:{windowBucket}`
- `MARKET_NORMALIZE_BATCH.idempotencyKey = market:normalize:{contentHash}`
- `MARKET_DIFF_AND_VERSION.idempotencyKey = market:diff:{listingId}:{capturedAt}`

### 5.5 Manejo de errores transitorios
Replicar el patrón existente: errores transitorios devuelven HTTP 200 con `skipped:true` para que QStash **no** reintente.

```ts
const TRANSIENT = new Set(["RATE_LIMIT","NETWORK_ERROR","TIMEOUT","DB_ERROR","BLOCKED_TEMPORARY"]);
```

---

## 6. Pipeline lógico detallado

### 6.1 Fase Adquisición

1. `discover-seeds` selecciona `MarketSeed` activos con `lastRunAt + cadence < now`.
2. Por cada seed crea `MarketCrawlRun` y encola `MARKET_CRAWL_SEED`.
3. `crawl-tick` toma N jobs del tipo `MARKET_CRAWL_SEED`.
4. Para cada job, llama al Worker (`POST /v1/crawl/seed`).
5. El Worker captura listados y persiste `MarketRawListing` con `contentHash`.
6. El Worker actualiza `MarketCrawlRun` con resultado.

### 6.2 Fase Normalización

1. `consumer` procesa `MARKET_NORMALIZE_BATCH`.
2. Lee `MarketRawListing` con `status=CAPTURED`.
3. Aplica reglas de normalización (campos canónicos + score de calidad).
4. Crea/actualiza `MarketListing` por `(source, externalId)`.
5. Marca `MarketRawListing.status=NORMALIZED` o `REJECTED`.

### 6.3 Fase Identidad

1. `MARKET_RESOLVE_IDENTITY` calcula `fingerprint` por listing.
2. Busca `MarketProperty` existente con mismo `fingerprint` o suficientemente similar.
3. Asigna `MarketListing.propertyId` o crea nuevo `MarketProperty`.
4. Decisiones de merge:
   - score >= alto → auto-merge,
   - score medio → marca para revisión,
   - score bajo → no se vincula.

### 6.4 Fase Diff y Versionado

1. `MARKET_DIFF_AND_VERSION` compara estado nuevo vs último `MarketListingVersion`.
2. Calcula `changedFields` y `before/after`.
3. Inserta `MarketListingVersion`.
4. Emite `MarketEvent` correspondiente con `fingerprint` único para idempotencia.

### 6.5 Fase Snapshot

1. `refresh-snapshot` recorre todas las combinaciones `(city, housingType, operation)`.
2. Recalcula totales y métricas en `MarketSnapshotIndex`.
3. Emite `MARKET_SNAPSHOT_REFRESHED`.

### 6.6 Fase Reglas

1. `run-rules` evalúa reglas activas:
   - alta nueva en zona objetivo,
   - bajada de precio relevante,
   - reactivación,
   - particular detectado en cobertura.
2. Cada regla genera notificaciones internas o externas (canal definido por la regla).

---

## 7. Comunicación UI ↔ Worker

La UI **no habla nunca directo** con el Worker. Toda interacción pasa por la API de Next.js para mantener:
- autenticación uniforme,
- rate limiting,
- observabilidad,
- contratos versionados.

### 7.1 Topología

```
[ UI Next.js ]  --HTTPS-->  [ /api/market/* ] --enqueue/HTTP-->  [ JobQueue / Worker Externo ]
        ^                                                                    |
        |                                                                    v
        +---------- polling / SSE / WebSocket  <-----------  [ DB + projections ]
```

### 7.2 Endpoints de UI mínimos (`/api/market/*`)

```
GET  /api/market/snapshot
GET  /api/market/listings/search
GET  /api/market/listings/:id
GET  /api/market/listings/:id/timeline
GET  /api/market/properties/:id
GET  /api/market/health
POST /api/market/seeds            (admin)
POST /api/market/crawls/trigger   (admin, manual rerun)
POST /api/market/rules            (admin)
```

### 7.3 Contrato de búsqueda

```ts
type SearchListingsQuery = {
  city: string;
  housingType?: MarketHousingType;
  operation?: MarketOperation;
  priceMin?: number;
  priceMax?: number;
  metersMin?: number;
  metersMax?: number;
  roomsMin?: number;
  zone?: string;
  cursor?: string;
  limit?: number; // max 100
};

type SearchListingsResponse = {
  items: MarketListingDTO[];
  cursor?: string;
  meta: {
    total: number;
    freshAt: string;
  };
};
```

### 7.4 Patrones de comunicación en tiempo real
- **Health/operación**: polling cada 30s al endpoint `/api/market/health`.
- **Cambios de mercado en panel**: SSE en `/api/market/stream` (alimentado por `MarketEvent`).
- **Disparo manual desde UI**: `POST /api/market/crawls/trigger` con `{ seedId }` → encola `MARKET_CRAWL_SEED` con `idempotencyKey` corto.

### 7.5 Seguridad
- Auth de sesión Better Auth para endpoints de lectura.
- Rol `admin` para endpoints de escritura/triggers.
- Worker externo solo accesible desde el backend con `WORKER_SHARED_SECRET`.

---

## 8. Observabilidad y operación

### 8.1 Métricas de plataforma
- `market.crawl.itemsCaptured` por source y city.
- `market.normalize.rejectionRate`.
- `market.identity.mergeRate`.
- `market.snapshot.freshnessSeconds` por city.
- `market.events.emitted` por type.
- `market.worker.latencyMs`.

### 8.2 Logs estructurados
- `correlationId` por ciclo cron.
- `runId` por crawl.
- `traceId` por llamada al Worker.
- `phase` ∈ { discover, crawl, normalize, identity, diff, snapshot, rules }.

### 8.3 Alertas operativas
- `snapshot stale`: city sin refresco en N horas.
- `coverage drop`: caída > X% día/día.
- `breaker open`: cualquier source en `OPEN`.
- `worker down`: health-check fallido N veces seguidas.

---

## 9. Configuración y variables de entorno

### 9.1 Vercel (app + crons)

```
DATABASE_URL=postgres://...
NEXT_PUBLIC_APP_URL=https://...
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
CRON_SECRET=...
WORKER_BASE_URL=https://worker.internal/...
WORKER_SHARED_SECRET=...
WORKER_REQUEST_TIMEOUT_MS=8000
MARKET_FEATURE_ENABLED=true
```

### 9.2 Worker (Railway)

```
# Núcleo
WORKER_PORT=8080
WORKER_SHARED_SECRET=...
DATABASE_URL=postgres://...
LOG_LEVEL=info
MAX_CONCURRENT_BROWSERS=2
DEFAULT_BUDGET_MS=60000
DEFAULT_BUDGET_REQUESTS=50

# Bright Data — Web Unlocker (Idealista en Fase 2.c)
BRIGHTDATA_API_TOKEN=...
BRIGHTDATA_WEB_UNLOCKER_ZONE=web_unlocker_market
BRIGHTDATA_WEB_UNLOCKER_COUNTRY=es
BRIGHTDATA_WEB_UNLOCKER_TIMEOUT_MS=60000

# Bright Data — Scraping Browser CDP (solo para calentar cookies de Idealista)
BRIGHTDATA_SCRAPING_BROWSER_URL=...

# Bright Data — Residential Proxy (fallback Idealista)
BRIGHTDATA_RESIDENTIAL_PROXY_URL=...
BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME=...
BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD=...
BRIGHTDATA_RESIDENTIAL_PROXY_SESSION=...
```

---

## 10. Plan de fases con entregables verificables

### Fase 0 — Decisiones (1 día)
- Documento `docs/core-sistema-mercado-decisiones.md` con respuestas a la sección 2.

### Fase 1 — DB + contratos (2-3 días)
- Migración Prisma con todas las entidades de la sección 3.
- Tipos TypeScript del dominio en `lib/market/types.ts`.
- Tests unitarios de mappers básicos.

### Fase 2 — Worker externo (4-6 días)
- Servicio Railway con `/v1/health`, `/v1/crawl/seed`.
- Cliente `MarketWorkerClient` en `lib/market/worker-client.ts`.
- Estrategias anti-bot por source (al menos 2).
- Persistencia de `MarketRawListing` y `MarketCrawlRun`.

### Fase 3 — Normalización + identidad (3-5 días)
- Normalizer puro en `lib/market/normalize.ts` con tests.
- Resolver de identidad en `lib/market/identity.ts` con tests.
- Job handlers `MARKET_NORMALIZE_BATCH` y `MARKET_RESOLVE_IDENTITY`.

### Fase 4 — Diff + snapshot + eventos (3-4 días)
- Diff engine + versioning con tests.
- Emisión de `MarketEvent` con `fingerprint` único.
- Refresco de `MarketSnapshotIndex` y métricas.

### Fase 5 — Crons en QStash (2-3 días)
- Endpoints `/api/cron/market/*`.
- Configuración de QStash con frecuencias de la sección 5.2.
- Idempotencia y manejo de errores transitorios.

### Fase 6 — API interna + UI mínima (3-4 días)
- Endpoints `/api/market/*`.
- Panel `/platform/market/health` con frescura por city.
- Buscador `/platform/market/search`.

---

## 11. Criterios de aceptación globales

El Core se considera operativo cuando, durante 7 días seguidos:
- la frescura del snapshot por ciudad cumple el SLO definido,
- la tasa de errores por fuente está por debajo del umbral acordado,
- la cola `JobQueue` no acumula backlog sostenido,
- los eventos `MARKET_*` son auditables y no presentan duplicados,
- la API responde dentro del p95 objetivo,
- existen alertas operativas activas para snapshot stale y breakers abiertos.

---

## 12. Riesgos y mitigaciones

| Riesgo                                  | Mitigación                                                              |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Bloqueo masivo de una fuente            | Circuit breaker por source + estrategia chain + reducción automática    |
| Crecimiento descontrolado de tablas raw | TTL/retención periódica + particionado por mes                          |
| Identidad cross-source incorrecta       | Umbrales conservadores + cola de revisión manual                         |
| Coste descontrolado de proxies          | Budget por seed + presupuesto mensual + alerta de gasto + zone Web Unlocker dedicada por consumidor (Mercado vs Statefox) para trazabilidad |
| Snapshot inconsistente                  | Refresco idempotente + cómputo determinístico + tests E2E nocturnos      |
| Worker caído                            | Health-check + alerta + endpoints cron en modo `skipped:true`            |
| Bright Data Browser API CDP rechazado por DataDome (Idealista) | Web Unlocker REST como path **primario** contra Idealista (probado en producción para Statefox image cache). CDP solo se usa para calentar cookies en home antes del fallback `residentialProxy`. |
| Web Unlocker Custom Headers & Cookies infla coste | Mantener la zone en modo default (factura solo éxito). Las cookies cálidas se inyectan por la rama `residentialProxy`, no por Web Unlocker. |
| Idealista cae en lista no-premium o cambia tier | Monitorizar `GET /unblocker/success_rate/idealista.com` con cron diario. Email de Bright Data avisa con 30 días de antelación de cambios en lista de premium domains. |

---

## 13. Próximo paso recomendado

Cerrar la **Fase 0**: convocar una sesión corta para responder cada punto de la sección 2 y dejarlo escrito. Sin esas respuestas, las fases 1–6 no son ejecutables sin asunciones.
