# Core de Mercado — Estado del MVP

> **Fecha de corte:** 6 de mayo de 2026 (cierre de Fases 3-6 + hardening del MVP base; diseño de Fase 2.c — Idealista — cerrado el mismo día).
> **Estado del MVP:** **código completo**. Queda solo configuración operativa (6 schedules en Upstash QStash) y validación en producción (≥ 7 días estables contra Neon real).
> **Contexto:** este documento es la única fuente de verdad sobre **qué está construido** en el Core de Inteligencia de Mercado y **qué falta** para considerar el MVP cerrado. Sustituye a cualquier estimación previa del plan original (`docs/core-sistema-mercado-plan-implementacion.md`) cuando ambos diverjan.
>
> Documentos relacionados (no duplican lo aquí descrito):
>
> - `docs/core-sistema-mercado.md` — definición del producto.
> - `docs/core-sistema-mercado-plan-implementacion.md` — plan abstracto en 6 fases.
> - `docs/core-sistema-mercado-decisiones.md` — decisiones de Fase 0 + decisiones específicas de Fase 2.c (§11, vinculantes).
> - `docs/portal-html-analysis.md` — observaciones reales del HTML por portal.
> - `docs/market-worker-deploy.md` — runbook de despliegue del Worker en Railway.
> - `docs/statefox-image-cache.md` — evidencia operativa de Bright Data Web Unlocker contra Idealista (base de la chain anti-bot definitiva del Worker de Mercado).

---

## 1. Definición operativa del MVP

El MVP del Core de Mercado se considera entregado cuando, de forma totalmente automatizada y sin intervención manual:

1. Cada `MarketSeed` activo se captura con la cadencia configurada y persiste en `MarketRawListing` y `MarketCrawlRun`.
2. Los `MarketRawListing` recientes se normalizan a `MarketListing` canónico y se resuelve identidad cross-portal en `MarketProperty`.
3. Los cambios de cada listing se versionan en `MarketListingVersion` y emiten eventos `MARKET_*` (alta, baja, rebaja, cambio relevante).
4. Existe un `MarketSnapshotIndex` por ciudad refrescado con la frecuencia del SLO (≤ 2h de frescura objetivo).
5. La app expone `/api/market/*` mínimo (read-only) para QA interna y hay un panel `/platform/market/health` con frescura, cobertura, breakers y ratio de bloqueo por portal.
6. Los crons en QStash orquestan todo el pipeline de extremo a extremo y los handlers son idempotentes.
7. Los portales activos del MVP (Fotocasa y Pisos.com) corren en producción contra Neon real durante al menos 7 días con estabilidad demostrada.

Cualquier funcionalidad que requiera Bright Data (Web Unlocker o residencial) queda **fuera del MVP base** por decisión explícita: Idealista (`source_d`) y Milanuncios (`source_c`).

Para Idealista el diseño de Fase 2.c **ya está cerrado** (chain anti-bot, presupuesto, infraestructura reusable, pasos de implementación) y se documenta en `docs/core-sistema-mercado-decisiones.md` §11 y en §4 de este documento. La implementación queda diferida hasta cerrar Fases 3–6 del MVP base; ver §4 para los huecos abiertos que la bloquean.

---

## 2. Lo que ya está implementado

### 2.1 Fase 0 — Decisiones bloqueantes
- **Cerradas y documentadas** en `docs/core-sistema-mercado-decisiones.md` (versión 1.0 + adenda post-Fase 2.b):
  - Geografía: Córdoba capital.
  - Operación: solo `sale`.
  - Tipologías cubiertas y excluidas.
  - Volumen estimado: 5.000 – 15.000 listings activos.
  - Política de identidad balanceada con umbrales `0.90` (auto-merge) y `0.70` (revisión manual).
  - Política de medios: URLs originales en MVP.
  - Presupuesto: 0 USD/mes en MVP (sin Bright Data); tope 50 USD/mes cuando entren Idealista/Milanuncios.
  - Privacidad y retención: 30 días para `MarketRawListing`, 12 meses para `MarketListingVersion`.

### 2.2 Fase 1 — Base de datos + contratos
- **Migración aplicada**: `prisma/migrations/20260506180000_add_market_core/migration.sql`.
  - 8 enums nuevos (`MarketSource`, `MarketOperation`, `MarketHousingType`, `MarketAdvertiserType`, `MarketCrawlStatus`, `MarketListingStatus`, `MarketEventType`, `MarketBreakerStatus`).
  - 9 modelos: `MarketSeed`, `MarketCrawlRun`, `MarketRawListing`, `MarketListing`, `MarketListingVersion`, `MarketProperty`, `MarketEvent`, `MarketSnapshotIndex`, `MarketCircuitBreaker`.
  - Índices únicos clave: `MarketRawListing(source, contentHash)`, `MarketListing(source, externalId)`.
  - Extensión del enum `JobType` con 9 valores `MARKET_*` listados en el plan §3.3.
- **Contratos TypeScript** en `lib/market/`:
  - `types.ts`: re-export de enums Prisma + DTOs `RawListing`, `CanonicalListing`, `MarketListingDTO`, contratos de Worker, payloads de eventos.
  - `normalize.ts`: `normalizeRawListing`, `canonicalizeUrl`, `parseSpanishNumber`, `extractPrice`, `mapHousingType`, `mapOperation`, `geohashEncode`.
  - `identity.ts`: `computePropertyFingerprint`, `computePropertySimilarity`, umbrales `IDENTITY_AUTO_MERGE_THRESHOLD` / `IDENTITY_MANUAL_REVIEW_THRESHOLD`.
  - `quality.ts`: `computeQuality`, `applyQuality`, `isPublishable`.
  - `source-mapping.ts`: `MarketSource` ↔ `PortalSlug`, `detectPortalFromUrl`, `ACTIVE_PORTALS_V1` (sólo `fotocasa` y `pisoscom` en MVP).
  - `index.ts`: barrel público estable.
- **Tests unitarios** en `lib/market/__tests__/` para `types`, `normalize`, `identity`, `quality`, `source-mapping`. Verde.
- **`.env.example`** actualizado con las variables del Core (Worker base URL + shared secret, defaults de cadencia, flags de feature).

### 2.3 Fase 2.a — Worker externo de adquisición
- **Servicio dedicado** en `workers/market-worker/`:
  - `package.json` (CommonJS, `tsx` runtime, dependencias `fastify`, `playwright`, `@prisma/client`, `zod`, `dotenv`).
  - `tsconfig.json` con `lib: ["ES2022", "DOM"]` (necesario por callbacks `page.evaluate`).
  - `Dockerfile` basado en imagen oficial de Playwright + `prisma generate`.
  - `railway.json` con healthcheck `/internal/health`.
  - `.env.example` y `README.md` documentados.
- **Contrato HTTP** entre app y Worker:
  - `lib/workers/contracts/market-worker.ts`: tipos `MarketCrawlSeedRequest`, `MarketCrawlSeedResponse`, constantes de path y header de auth.
  - `lib/workers/contracts/market-worker-client.ts`: `MarketWorkerClient` (fetch + manejo de errores tipados).
- **Runtime testeable** en `lib/workers/market-worker/`:
  - `runtime.ts`: `MarketWorkerRuntime` con autenticación por shared secret, validación Zod, control de concurrencia, `deadlineMs` con fallback a `accepted` (background), persistencia idempotente de `MarketRawListing` y actualización de `MarketCrawlRun`.
  - `extractor.ts`: interfaz `MarketExtractor` que cada portal implementa.
  - Tests unitarios en `__tests__/runtime.test.ts` con `PrismaClient` mockeado.
- **Server Fastify** (`workers/market-worker/src/server.ts`):
  - `GET /internal/health` (público).
  - `POST /internal/market/crawl/seed` (auth por `x-worker-secret`).
  - Apagado limpio en `SIGTERM`/`SIGINT`.
  - Registry de extractors limitado a `source_a` (Fotocasa) y `source_b` (Pisos.com) en MVP.
- **Abstracción de fetchers** en `workers/market-worker/src/fetchers/`:
  - `types.ts` (interfaz `Fetcher`, error tipado `FetcherError`).
  - `direct-browser.ts` (Playwright sin proxy, con opciones `scrollToBottom` y `hydratedSelector`).
  - `web-unlocker.ts` (envoltorio del cliente Bright Data Web Unlocker — implementado pero **no usado en MVP**).
  - `residential-proxy.ts` (Playwright + proxy residencial Bright Data — implementado pero **no usado en MVP**).
  - `chain.ts` (`createChainedFetcher` para combinar estrategias).
  - Tests en `__tests__/chain.test.ts` y `__tests__/web-unlocker.test.ts`.
- **Robots.txt genérico** en `lib/scraping/portal-robots/` (parser + evaluación, con tests).
- **Smoke E2E local** (`scripts/test-market-worker-local.ts`):
  - Crea/reutiliza `MarketSeed`, llama al Worker contra Neon real, valida persistencia de `MarketCrawlRun` y `MarketRawListing`, confirma idempotencia en segunda corrida.
  - Soporta `--portal fotocasa|pisoscom` (Milanuncios queda con guarda informativa).
- **Runbook de despliegue**: `docs/market-worker-deploy.md`.

### 2.4 Fase 2.b — Extractores reales calibrados
- **Captura real de HTML** automatizada con `scripts/capture-portal-html.ts` (respeta robots, reusa `DirectBrowserFetcher`, guarda en `data/captures/<portal>/<timestamp>/`, excluida del repo).
- **Análisis documentado** en `docs/portal-html-analysis.md`:
  - Fotocasa: pág. 1 sirve 25 cards tras `scrollToBottom`; págs. 2+ y detalle devuelven 403 (anti-bot ligero). Sin JSON-LD útil.
  - Pisos.com: pág. 1-3 + detalles sin bloqueo; **JSON-LD `SingleFamilyResidence` por anuncio** (oro), complementado con DOM `<div class="ad-preview">`.
  - Milanuncios: bloqueado por PerimeterX/HUMAN incluso con `playwright-extra` + stealth headed. **Fuera de MVP**.
- **Extractor Fotocasa** (`workers/market-worker/src/portals/fotocasa/`):
  - `parser.ts` DOM-based con la regex documentada y extracción de precio/área/habs por bloque cercano.
  - `content-hash.ts`, `pagination.ts`, `extractor.ts`.
  - Tests unitarios contra fixture sanitizado (`__tests__/fixtures/listing-cordoba.html`).
- **Extractor Pisos.com** (`workers/market-worker/src/portals/pisoscom/`):
  - `parser.ts` híbrido JSON-LD + DOM.
  - `content-hash.ts`, `pagination.ts`, `extractor.ts`.
  - Tests unitarios contra fixture sanitizado.
- **Validación E2E real**:
  - Smoke contra Neon: Fotocasa **25 ítems** capturados, Pisos.com **33 ítems** capturados; segunda corrida 0 inserts nuevos (idempotencia OK).
  - Vitest verde (`npm test`) y `tsc --noEmit` limpio.

---

## 3. Lo que falta para cerrar el MVP

> **Estado: MVP funcional cerrado.** Fases 3-6 implementadas; queda
> únicamente la tarea operativa de configurar los 6 schedules en Upstash
> QStash (no es código). Detalle por bloque a continuación.

### 3.1 Fase 3 — Pipeline de normalización + identidad — **COMPLETA**
**Objetivo:** convertir `MarketRawListing` en `MarketListing` canónico y resolver `MarketProperty` cross-portal.

- [x] Handler `MARKET_NORMALIZE_BATCH` (`lib/market/jobs/normalize-handler.ts`):
  - Lee `MarketRawListing` con `status = CAPTURED`, llama a `normalizeRawListing` + `applyQuality`, hace upsert en `MarketListing`, marca raw como `NORMALIZED` o `REJECTED`.
  - Encola `MARKET_RESOLVE_IDENTITY` como follow-up por listing nuevo/actualizado.
  - Tests sobre fixtures Fotocasa + Pisos.com en `__tests__/normalize-handler.test.ts`.
- [x] Handler `MARKET_RESOLVE_IDENTITY` (`lib/market/jobs/resolve-identity-handler.ts`):
  - `computePropertyFingerprint`, búsqueda de candidatos en ventana espacial (`geohash`), `computePropertySimilarity`.
  - Camino elegido: opción A — manual review se materializa como `MarketEvent type=MARKET_PROPERTY_REVIEW_REQUIRED`. **No** se creó tabla dedicada (decisión MVP en §3.1 del plan); permite construir UI de revisión a futuro filtrando por evento.
  - Auto-merge en `score ≥ 0.90`, manual-review en `[0.70, 0.90)`, no-merge < 0.70 (crea `MarketProperty` nuevo).
  - Encola `MARKET_DIFF_AND_VERSION` como follow-up.
- [x] Migración Prisma `20260506163809_add_market_property_review_required` (aplicada a Neon prod).
- [x] Handlers registrados en `lib/workers/consumer/job-handlers.ts` y tipos en `ALL_CONSUMER_JOB_TYPES`. Reusa el `runConsumerLoop` existente; no se requiere cron `/api/cron/market/consumer` dedicado.

### 3.2 Fase 4 — Versionado, snapshot y eventos — **COMPLETA**
**Objetivo:** detectar cambios entre capturas, materializar snapshot por ciudad y emitir eventos `MARKET_*`.

- [x] Módulo puro `lib/market/diff.ts` con `diffListing` y mapping a `MarketEventType` (`MARKET_LISTING_CREATED`, `MARKET_LISTING_PRICE_CHANGED`, `MARKET_LISTING_REMOVED`, `MARKET_LISTING_REACTIVATED`, `MARKET_LISTING_UPDATED`).
- [x] Módulo puro `lib/market/snapshot.ts` con `computeSnapshotIndex` (totales, rangos de precio, mediana de €/m², frescura).
- [x] Handler `MARKET_DIFF_AND_VERSION` (`lib/market/jobs/diff-handler.ts`):
  - Compara con la última `MarketListingVersion`, inserta versión nueva si hay cambios y emite `MarketEvent` con fingerprint idempotente.
- [x] Handler `MARKET_REFRESH_SNAPSHOT` (`lib/market/jobs/snapshot-handler.ts`):
  - Upsert en `MarketSnapshotIndex` por `(city, housingType, operation)`.
  - Emite `MARKET_SNAPSHOT_REFRESHED` con fingerprint diario para evitar duplicados.
- [x] Tests unitarios para `diff.ts`, `snapshot.ts` y ambos handlers.

### 3.3 Fase 5 — Crons en QStash + orquestación end-to-end — **COMPLETA (queda configuración operativa)**
**Objetivo:** que el pipeline corra solo, con despacho de seeds y tick de procesamiento.

- [x] `POST /api/cron/market/discover-seeds` (cada 15 min) — selecciona seeds vencidos, crea `MarketCrawlRun`, encola `MARKET_CRAWL_SEED`. Filtra por `ACTIVE_SOURCES_V1`.
- [x] `POST /api/cron/market/crawl-tick` (cada 5 min) — drena cola con `MarketWorkerClient`, gestiona `accepted/blocked/failed` y circuit breaker.
- [x] `POST /api/cron/market/refresh-snapshot` (cada 30 min) — encola `MARKET_REFRESH_SNAPSHOT` por ciudad activa.
- [x] `POST /api/cron/market/run-rules` (cada 10 min) — esqueleto no-op, devuelve `{ skipped: true }`. Estructura preparada para V2.
- [x] `POST /api/cron/market/health-check` (cada 5 min) — loguea métricas de `collectHealthSnapshot()`.
- [x] `POST /api/cron/market/purge` (24 h) — retención `MarketRawListing` (default 30d) y `MarketListingVersion` (default 365d).
- [x] Patrón consolidado: `withObservedRoute` + `isQstashAuthorized` + `200 { skipped: true }` para errores transitorios.
- [x] `scripts/seed-market-cordoba.ts` aplicado a Neon: 4 seeds activos (Fotocasa+Pisos × venta+alquiler) y 2 `MarketCircuitBreaker` en `CLOSED`.
- [ ] **Tarea operativa pendiente**: configurar los 6 schedules en Upstash QStash apuntando al dominio de Vercel. Procedimiento documentado en `docs/market-worker-deploy.md` §11.2.

### 3.4 Fase 6 — API interna + UI mínima — **COMPLETA**
**Objetivo:** disponer de QA interna sin tocar la base de datos directamente.

- [x] `GET /api/market/health` (admin/CEO) — `HealthSnapshot` consolidado.
- [x] `GET /api/market/listings/search` con paginación cursor (filtros: city, housingType, operation, precio, metros, rooms, zone).
- [x] `GET /api/market/listings/:id`, `/timeline`, `/properties/:id`.
- [x] `GET /api/market/snapshot?city=` — último `MarketSnapshotIndex` por housingType+operation.
- [x] `GET /api/market/seeds`, `POST /api/market/seeds`, `POST /api/market/crawls/trigger` (admin).
- [x] Panel `/platform/market/health` — worker, frescura por portal, breakers, seeds activos con botón "Disparar crawl", últimos 15 eventos.
- [x] Buscador `/platform/market/search` — herramienta de QA interna (no enlazada en sidebar; banner ámbar visible). Decisión `core-mvp-status.md` §1: no es producto end-user.
- [ ] Vista `/platform/market/identity/review` — **diferida a V2**. La revisión manual se materializa como `MarketEvent MARKET_PROPERTY_REVIEW_REQUIRED` y aparece en el panel de health (últimos eventos). Cuando el volumen lo justifique, construir vista dedicada.

### 3.5 Hardening operativo (transversal) — **COMPLETO**
- [x] Cron de purga: `MarketRawListing` > 30d, `MarketListingVersion` > 365d (configurable via env).
- [x] Logs estructurados en handlers + crons (consumibles desde Railway/Vercel).
- [x] `docs/market-worker-deploy.md` §11 — sección "Operación cotidiana" con URLs internas, schedules QStash, gestión de seeds, lectura del panel, intervención de breakers, retención y checklist semanal.
- [x] `.env.example` raíz y `workers/market-worker/.env.example` actualizados con variables `MARKET_*`, `BRIGHTDATA_*` (esto último para Fase 2.c) y referencias al runbook.
- [ ] **Tareas operativas (no de código)**:
  - Configurar 6 schedules QStash (§3.3).
  - Definir alertas externas (Slack/email) si: frescura > 4h, breaker `OPEN` > 1h, caída de cobertura > 10% día a día.
  - Resolver el `EPERM` local de Prisma `query_engine-windows.dll.node` cuando reaparezca (workaround en `prisma/README.md`).

---

## 4. Roadmap post-MVP (fuera del alcance actual)

Para preservar continuidad sin contaminar el MVP:

- **Idealista (`source_d`) — Fase 2.c**:

  Estado: **CÓDIGO COMPLETO + SMOKE REAL VALIDADO** (06/05/2026). Activación en producción es operativa (poner `MARKET_IDEALISTA_ENABLED=true` en Vercel + Railway con la zone `web_unlocker_market` creada). Ver `docs/market-worker-deploy.md` §11.9 para el procedimiento de activación.

  **Validación operativa 06/05/2026:**

  | Smoke | Resultado | Coste |
  | ----- | --------- | ----- |
  | `--limit 1` (1 página) | 30 items, 100% cobertura precio/m²/hab/title/zona/imagen | ~$0.005 |
  | `--limit 5` (5 páginas) | 149 items únicos, paginación OK, dedupe perfecto | ~$0.025 |

  **Lo que queda pendiente para activar:**

  1. Crear zone `web_unlocker_market` en Bright Data dashboard (Premium Domains ON, Custom Headers OFF). Smoke validado con zone existente `web_unlocker1`; la zone dedicada da higiene de billing.
  2. Configurar variables `BRIGHTDATA_*` y `MARKET_IDEALISTA_ENABLED=true` en Vercel + Railway.
  3. Configurar 1 cron QStash adicional: `POST /api/cron/market/brightdata-success-rate` (`0 6 * * *`).
  4. Smoke contra Worker en Railway con `--portal idealista --limit 1`.
  5. Monitoreo intensivo 48h via `/platform/market/health` (tarjeta dedicada Idealista con coste/fallback rate/success rate).

  **Chain anti-bot definitiva:**

  ```
  webUnlocker (Bright Data REST, premium domain, country=es)   ← primary
    └─ on block (HTTP 401/403/429 o body con "uso indebido"/"datadome")
       residentialProxy (Playwright + warm-session-cookies)    ← fallback
         └─ on block
            circuit breaker (3 fallos consecutivos → OPEN 10 min)
  ```

  > **Bright Data Browser API por CDP devuelve 403 contra Idealista** (DataDome bloquea el handshake antes del unblocking). El path CDP **solo** se usa para calentar cookies en home antes del fallback `residentialProxy`, nunca como path primario.

  **Piezas reusables ya construidas (no hay que reescribir):**

  | Pieza                                  | Ubicación                                          | Estado |
  | -------------------------------------- | -------------------------------------------------- | ------ |
  | Cliente Web Unlocker REST              | `lib/scraping/web-unlocker/client.ts`              | Listo, probado en Statefox. |
  | Fetcher `webUnlocker` del Worker       | `workers/market-worker/src/fetchers/web-unlocker.ts` | Listo. |
  | Fetcher `residentialProxy`             | `workers/market-worker/src/fetchers/residential-proxy.ts` | Listo. |
  | Chain componible con `isBlocked`       | `workers/market-worker/src/fetchers/chain.ts`      | Listo. |
  | Warm session DataDome + tabla          | `lib/scraping/warm-session/*` + `PortalWarmSession` | Listo (atado a `StatefoxPortalSource`; mapping mínimo a `MarketSource.source_d` propuesto en §11.4 de decisiones). |
  | Navegación humana home → listado       | `lib/scraping/warmup-navigation/idealista.ts`      | Listo. |
  | Ghost-cursor + scroll humano           | `lib/scraping/human-cursor.ts`                     | Listo. |
  | Resolución CAPTCHA por CDP             | `lib/scraping/brightdata-captcha.ts`               | Listo. |
  | Telemetría sesión Bright Data          | `lib/scraping/brightdata-session.ts`               | Listo. |
  | Detección "uso indebido" / 403         | `lib/idealista/browser.ts`                         | Listo. |
  | Selectores DOM listado (referencia)    | `lib/idealista/listings.ts`                        | Listo (calibrar contra captura real con Web Unlocker antes de portar). |

  **Pasos completados (06/05/2026):**

  - [x] Captura HTML real con `scripts/capture-portal-html.ts --portal idealista --via-web-unlocker` (3 seeds + 1 paginación + 1 bloqueo DataDome real). Análisis en `docs/portal-html-analysis.md` sección "Idealista".
  - [x] Heurística de bloqueo `lib/scraping/web-unlocker/client.ts` distingue `blocked` vs `failed` con razón (`http_403/uso_indebido/datadome/captcha`).
  - [x] Refactor `lib/scraping/warm-session/{repo,acquire}.ts` para aceptar `PrismaClient` inyectado (factory `createWarmSessionAcquire(prisma)`) sin romper Statefox. Tests verdes.
  - [x] Variables de entorno en `.env.example` raíz y `workers/market-worker/.env.example`: `MARKET_IDEALISTA_ENABLED`, `BRIGHTDATA_*`, `STATEFOX_WARM_SESSION_*`.
  - [x] `getActiveSourcesV1()` lee `MARKET_IDEALISTA_ENABLED` para decidir si encola `source_d`. Crons del MVP base lo respetan automáticamente.
  - [x] Portal Idealista en `workers/market-worker/src/portals/idealista/{parser,extractor,pagination,content-hash}.ts` calibrado contra HTML real (5 fixtures commitados). 47 tests verdes.
  - [x] Fetcher chain `webUnlocker → idealista-residential (+warm-cookies)` en `workers/market-worker/src/fetchers/idealista-{residential,chain}.ts`. 9 tests verdes.
  - [x] Registro condicional de `source_d` en `workers/market-worker/src/server.ts` (solo si `MARKET_IDEALISTA_ENABLED=true` Y todas las `BRIGHTDATA_*` configuradas).
  - [x] `scripts/seed-market-idealista-cordoba.ts` aplicado a Neon: 3 seeds + breaker `source_d` CLOSED.
  - [x] Cron diario `POST /api/cron/market/brightdata-success-rate` consulta `https://api.brightdata.com/unblocker/success_rate/idealista.com` y persiste como `MarketEvent`.
  - [x] Métricas `monthRequests`, `monthCostUsd`, `fallbackRate24h`, `brightDataSuccessRate` en `collectIdealistaMetrics()`. Tarjeta dedicada en `/platform/market/health` con alertas COSTE/FALLBACK.
  - [x] Smoke real (`scripts/smoke-idealista-direct.ts`) contra Bright Data: `--limit 1` → 30 items 100% cobertura, `--limit 5` → 149 items únicos paginación OK. Coste real ~$0.025 para 5 páginas.

  **Pendientes operativos para activar en producción** (no es código):

  1. Crear zone `web_unlocker_market` en Bright Data dashboard (Premium Domains ON, Custom Headers OFF).
  2. Subir vars en Vercel + Railway (procedimiento exacto en `docs/market-worker-deploy.md` §11.9).
  3. Configurar 1 cron QStash adicional (`brightdata-success-rate`, `0 6 * * *`).
  4. Smoke contra Worker en Railway (`--portal idealista --limit 1`).
  5. Monitoreo intensivo 48h.

  **Coste estimado:** ~43 USD/mes solo para listado (3 seeds × 5 páginas × 12 ejecuciones/día × ~$8/CPM premium domain). Encaja en el tope de 50 USD/mes pero deja poco margen para Milanuncios; ver desglose en `docs/core-sistema-mercado-decisiones.md` §6.1.

  **Cache lazy de imágenes en Cloudinary** (decisión §5.2 de decisiones) se activa cuando un consumidor concreto lo pida; no es parte del cierre de Fase 2.c.
- **Milanuncios (`source_c`)**:
  - Activar chain `webUnlocker → residentialProxy` con Bright Data.
  - Capturar HTML real, completar `docs/portal-html-analysis.md` (URL real, JSON-LD si existe, selectores, marcadores de bloqueo).
  - Crear extractor `workers/market-worker/src/portals/milanuncios/` con tests sobre fixture sanitizado.
- **Fotocasa pág. 2+ y detalles**:
  - Encadenar `directBrowser → webUnlocker` para superar el 403 al paginar; aprovechar fetcher ya implementado.
- **V2 multi-ciudad y operación `rent`** (decisiones §1.1 y §1.2).
- **Cache masivo de medios** sólo si crece el coste justificadamente (decisión §6.2).

---

## 5. Estado de los tests al cierre

- `npm test` (vitest, repo principal): verde.
- `npm test` (vitest, `workers/market-worker`): verde.
- `npx tsc --noEmit` (repo principal y worker): limpio.
- Smoke E2E (`scripts/test-market-worker-local.ts`):
  - Fotocasa: 25 ítems persistidos en `MarketRawListing`; segunda corrida 0 inserts (idempotencia OK).
  - Pisos.com: 33 ítems persistidos; segunda corrida 0 inserts.
  - Milanuncios: no se ejecuta (no hay extractor registrado; el script muestra error claro).

---

## 6. Resumen ejecutivo

| Fase | Alcance MVP | Estado |
| ---- | ----------- | ------ |
| 0 — Decisiones bloqueantes | Completo | ✅ Cerrada |
| 1 — DB + contratos | Completo | ✅ Cerrada |
| 2.a — Worker externo (esqueleto) | Completo | ✅ Cerrada |
| 2.b — Extractores reales (Fotocasa, Pisos.com) | Completo | ✅ Cerrada |
| 3 — Normalización + identidad | Completo | ✅ Cerrada (manual-review vía `MarketEvent`, no tabla dedicada) |
| 4 — Versionado + snapshot + eventos | Completo | ✅ Cerrada |
| 5 — Crons + orquestación end-to-end | Completo (código) | ✅ Código + seeds. ⏳ Falta configurar 6 schedules QStash (operativo). |
| 6 — API interna + UI mínima | Completo | ✅ `/health` enlazable, `/search` interno (no en sidebar). |
| Hardening operativo (transversal) | Completo | ✅ Runbook §11 + `.env.example` actualizados. ⏳ Alertas externas pendientes. |
| **Idealista (`source_d`) — post-MVP** | Fuera de MVP base | ⏸ Fase 2.c. Diseño cerrado: chain `webUnlocker` (premium) → `residentialProxy + warm-session-cookies`. ~70 % de la infra ya construida en `lib/scraping/`. Coste estimado ~43 USD/mes solo-listado. Plan detallado §4. |
| **Milanuncios (`source_c`) — post-MVP** | Fuera de MVP | ⏸ Diferido (Bright Data Web Unlocker) |

**Trabajo restante para cerrar el MVP en producción** (no es código):

1. Configurar los 6 schedules en Upstash QStash (`docs/market-worker-deploy.md` §11.2). Estimado: 30 min.
2. Validar 7 días de operación estable contra Neon real (revisión diaria del panel `/platform/market/health`).
3. Definir umbrales y canal de alertas externas (frescura > 4h, breaker `OPEN` > 1h, caída cobertura > 10% día a día).
