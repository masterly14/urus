# Workers (Capa 2)

- **Ingestion Worker (M1)** — Lectura de propiedades y demandas desde Inmovilla. Detalle: [workers/ingestion.md](workers/ingestion.md).
  - Propiedades: API REST (`GET /propiedades/?listado` + `GET /propiedades/?cod_ofer`) si `INMOVILLA_API_TOKEN`; si no, legacy (login + paginación).
  - Demandas: polling legacy (no hay endpoint REST para demandas).
- **Egestion Worker (M2)** — Escritura en Inmovilla vía jobs `WRITE_TO_INMOVILLA`. Ver sección [Egestion Worker](#egestion-worker-m2) más abajo.
- **Consumer (Event Handlers)** — Procesa eventos del Event Store y ejecuta side effects (WhatsApp, jobs, proyecciones, alertas). Referencia completa: [workers/consumer-handlers.md](workers/consumer-handlers.md). Flujo de lead scoring: [workers/lead-scoring-flow.md](workers/lead-scoring-flow.md).

### Lista canónica de tipos consumibles

Todos los tipos de job que el consumer sabe procesar están definidos en la constante `ALL_CONSUMER_JOB_TYPES` (`lib/workers/consumer/types.ts`). Tanto el cron (`/api/cron/consumer`) como `scripts/run-consumer.ts` importan esa constante para evitar desalineaciones. Al registrar un nuevo `registerJobHandler(...)`, **añadir el tipo a esa constante**.

### Escalabilidad del consumer

El consumer procesa un job por ciclo (secuencial). La cola usa `FOR UPDATE SKIP LOCKED`, lo que permite lanzar **múltiples instancias del consumer en paralelo** de forma segura — cada instancia reclama jobs distintos sin colisiones. Para escalar horizontalmente:

- **Cron**: invocar el endpoint `/api/cron/consumer` con mayor frecuencia o desde múltiples schedulers.
- **CLI**: lanzar varias instancias de `npm run consumer` simultáneamente; cada una genera un `workerId` único.
- **Vercel**: las funciones serverless ya ejecutan invocaciones concurrentes de forma natural.
- **Railway 24/7 (recomendado para latencia hot)**:
  - `npm run consumer:railway` (general): procesa `RAILWAY_CONSUMER_JOB_TYPES` (excluye image-worker y pipeline Market post-crawl).
  - `npm run consumer:market` (dedicado): procesa `MARKET_CONSUMER_JOB_TYPES` para aislar throughput de Market.
  Ambos conviven con el cron QStash sin colisiones (`FOR UPDATE SKIP LOCKED`). Despliegue y rollout: [`docs/consumer-railway.md`](consumer-railway.md).

Para el volumen actual (3 comerciales, ~37 propiedades), una sola instancia es más que suficiente.

### Transaccionalidad evento + job

Los puntos de entrada que crean un evento y encolan su `PROCESS_EVENT` usan `appendEventAndEnqueueJob()` (`lib/event-store/event-store.ts`), que ejecuta ambas operaciones en una transacción Prisma. Esto garantiza que nunca quede un evento huérfano sin job ni un job apuntando a un evento inexistente.

## Statefox Image Cache (M6/M7)

El job `IMPORT_STATEFOX_PORTAL_IMAGES` recupera imágenes frescas desde el `pLink`
del anuncio y las persiste en Cloudinary. Lo usan pricing y microsites cuando las
URLs `pImages` de Statefox llegan caducadas.

| Pieza | Archivo |
|-------|---------|
| Modelo cache | `prisma/schema.prisma` (`StatefoxComparableImage`, `statefox_comparable_images`) |
| Detección portal + idempotencia | `lib/statefox/image-cache/portal.ts` |
| Encolado idempotente | `lib/statefox/image-cache/enqueue.ts` |
| Discovery Playwright (DOM + scripts + network) | `lib/statefox/image-cache/extract.ts` |
| Descarga con headers de portal y subida Cloudinary | `lib/statefox/image-cache/upload.ts` |
| Orquestador del job (importStatefoxPortalImages) | `lib/statefox/image-cache/importer.ts` |
| Warm import en caliente (1 imagen por comparable) | `lib/statefox/image-cache/warm.ts` |
| Hidratación pricing + cache miss → enqueue | `lib/statefox/image-cache/select.ts` |
| Orquestador híbrido Vercel↔Railway | `lib/statefox/image-cache/orchestrator.ts` |
| Contrato HTTP del worker (cliente + tipos) | `lib/workers/contracts/image-worker*.ts` |
| Runtime del worker (auth + concurrencia + deadline) | `lib/workers/image-worker/runtime.ts` |
| Entrypoint Railway | `scripts/run-image-worker.ts` (`npm run image-worker`) |
| Endpoint de status para polling UI | `app/api/statefox/image-cache/status/route.ts` |
| Handler del consumer | `lib/workers/consumer/statefox-image-import-handler.ts` |
| Script live dry-run / upload | `scripts/test-statefox-image-import.ts` (`npm run statefox:images:test`) |

### Modos del image worker (`STATEFOX_IMAGE_WORKER_MODE`)

| Modo | Comportamiento |
|------|----------------|
| `local` | Vercel ejecuta el warm import en proceso. No se contacta Railway. |
| `railway` | Vercel siempre delega al worker. Si el worker no está alcanzable, cae a local con warning (degradación segura). |
| `hybrid` (default cuando hay `STATEFOX_IMAGE_WORKER_URL`) | Vercel intenta el worker primero con ventana síncrona corta (`STATEFOX_IMAGE_WORKER_SYNC_DEADLINE_MS`, default 3 s). Si responde `completed`, las imágenes se devuelven en el mismo informe. Si el worker hace timeout / falla / responde `accepted`, se encola un job idempotente para que el consumer termine de poblar la galería y el frontend hace polling al endpoint de status. |

### Endpoint de status para polling

`GET /api/statefox/image-cache/status?ids=a,b,c` o `POST { ids: [...] }`. Devuelve por cada id:

| Campo | Descripción |
|-------|-------------|
| `status` | `IMPORTED \| PENDING \| FAILED \| BLOCKED \| CAPTCHA \| LISTING_REMOVED \| NO_IMAGES_FOUND \| UNKNOWN` |
| `cachedUrls` | URLs Cloudinary listas para servir (vacío hasta que `IMPORTED`) |
| `importedCount` | Imágenes ya en cache |
| `attempts` | Intentos del worker |
| `errorReason` | Motivo del último error (si aplica) |
| `updatedAt` | ISO del último cambio |

Auth: sesión Better Auth (cualquier rol con sesión válida). Pensado para que el frontend de Pricing refresque sin recargar el informe completo.

### Health del worker

`GET /internal/health` en el servicio Railway (no expuesto al público). El bloque `image-worker` también aparece en `GET /api/workers/status` (con auth) usando como prueba de vida el último `IMPORT_STATEFOX_PORTAL_IMAGES` completado en la cola.

### Estados terminales

`IMPORTED`, `BLOCKED`, `CAPTCHA`, `LISTING_REMOVED`, `NO_IMAGES_FOUND`. Estos no
se reintentan automáticamente: requieren acción manual (re-encolar el job tras
limpiar la fila, o usar `npm run statefox:images:test --upload`). Solo `FAILED`
es retriable mediante backoff de la cola.

### Mitigación antibots

- Backend Bright Data:
  - `BRIGHTDATA_SCRAPING_BROWSER_URL` conecta Playwright a Scraping Browser por CDP
    y habilita `Captcha.waitForSolve`.
  - Para Idealista, el worker primero intenta una `PortalWarmSession`: una cookie
    `datadome`/sesión calentada por CDP que se guarda en Neon y se reutiliza con
    proxy residencial hasta agotar TTL o número de usos.
  - `BRIGHTDATA_RESIDENTIAL_PROXY_URL`,
    `BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME` y
    `BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD` usan el proxy residencial HTTP de
    Bright Data en Chromium local cuando no hay URL CDP.
    `BRIGHTDATA_RESIDENTIAL_PROXY_SESSION` añade sesión sticky para mantener la
    misma IP durante una navegación.
- Sesión persistente vía `IDEALISTA_STORAGE_STATE` (mismo formato que el scraper de
  Idealista). El navegador acepta el banner de cookies y respeta el jitter de
  `IDEALISTA_IMAGE_IMPORT_DELAY_MS`.
- Detección explícita de `403`, CAPTCHA, "uso indebido" y "anuncio no disponible"
  en `lib/statefox/image-cache/extract.ts`; mapea a `BLOCKED`/`CAPTCHA`/`LISTING_REMOVED`.
  En Idealista, esos estados invalidan la warm session activa para forzar re-warm.
- `STATEFOX_WARM_SESSION_REQUIRE_CDP=true` corta el job como `BLOCKED` si no hay
  CDP ni cookie cálida, evitando consumir residencial contra el muro de DataDome.
- `STATEFOX_HUMAN_BEHAVIOR_ENABLED` y `STATEFOX_WARMUP_NAVIGATION_ENABLED`
  activan trayectorias `ghost-cursor` y navegación home → anuncio.
- Circuit breaker por portal: `statefox-image-import:idealista`,
  `statefox-image-import:fotocasa`, etc. Tras 3 fallos consecutivos cierra el
  flujo del portal durante 5 min.
- Proxy opcional configurable con `IDEALISTA_PROXY_SERVER` (+ user/pass).
- Las URLs `pImages` aún válidas siguen siendo fallback en la UI hasta que el job
  termine de poblar Cloudinary.

## Cron-jobs (QStash)

| Ruta | Script / Worker |
|------|-----------------|
| `POST /api/cron/ingestion/properties` | `runPropertiesIngestionCycle()` |
| `POST /api/cron/ingestion/demands` | `runDemandsIngestionCycle()` |

### Dispatcher always-on de Crawl Market

Para latencia baja en `MARKET_CRAWL_SEED`, ejecutar adicionalmente:

```bash
npm run market:crawl-dispatcher
```

Este proceso drena `MARKET_CRAWL_SEED` en bucle corto (1-2s) y deja
`/api/cron/market/crawl-tick` como fallback de seguridad.

Autorización: header `Authorization: Bearer <token>` (valor en variable de entorno `CRON_SECRET`).

## Egestion Worker (M2)

El worker de egestión escribe datos de vuelta a Inmovilla. No tiene un ciclo cron propio; las escrituras se ejecutan como jobs `WRITE_TO_INMOVILLA` procesados por el consumer.

### Flujo de escritura

```
Evento dominio → Handler del consumer → enqueueJob(WRITE_TO_INMOVILLA)
  → Consumer dequeue → Circuit Breaker check → writeToInmovilla()
  → Sesión Inmovilla (login si hace falta) → POST al CRM
  → Verificación post-escritura (si la operación lo soporta)
  → recordSuccess() / recordFailure() del circuit breaker
```

### Operaciones soportadas

Las operaciones están registradas en `lib/inmovilla/write/operation-registry.ts`:

| Operación | Qué hace |
|-----------|----------|
| `createDemand` | Crea una demanda en Inmovilla |
| `updateDemandEmail` | Actualiza el email de una demanda |
| `updateDemandPriority` | Actualiza la prioridad de una demanda |
| `updateDemandCriteria` | Actualiza criterios de búsqueda (tipos, zonas, presupuesto) |

### Archivos principales

| Archivo | Rol |
|---------|-----|
| `lib/inmovilla/write/write-to-inmovilla.ts` | Orquestador: resuelve sesión, ejecuta pasos, detecta sesión expirada, reintenta 1x |
| `lib/inmovilla/write/operation-registry.ts` | Registro de operaciones: paths, payloads, verificación post-escritura |
| `lib/inmovilla/write/parsers.ts` | Parsing de respuestas HTML/JSON legacy |
| `lib/inmovilla/write/verify.ts` | Verificación post-escritura |
| `lib/workers/consumer/job-handlers.ts` | Handler `WRITE_TO_INMOVILLA` con circuit breaker |

### Manejo de errores

| Tipo de error | Comportamiento |
|---------------|----------------|
| `VALIDATION_ERROR` | Permanente → DLQ directa (no retriable) |
| `SESSION_EXPIRED` | 1 reintento con re-login automático; si falla, retriable por cola |
| `NETWORK_ERROR` | Retriable por cola (backoff exponencial) |
| `VERIFY_MISMATCH` | Error de verificación post-escritura → retriable |

### Circuit Breaker

El egestion worker está protegido por un circuit breaker persistido en BD (tabla `circuit_breaker`). Previene cascadas de fallos cuando Inmovilla no responde.

**Configuración:**

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| Umbral de fallos | 3 | Fallos consecutivos para abrir el circuito |
| Cooldown | 5 min | Tiempo en estado OPEN antes de pasar a HALF_OPEN |
| Circuit ID | `egestion-inmovilla` | Identificador del circuito en BD |

**Estados:**

| Estado | Permite escritura | Transición |
|--------|-------------------|------------|
| `CLOSED` | Sí | → `OPEN` si 3 fallos consecutivos |
| `OPEN` | No | → `HALF_OPEN` tras 5 min de cooldown |
| `HALF_OPEN` | Sí (1 intento) | → `CLOSED` si éxito; → `OPEN` si fallo |

**Cuando el circuito está OPEN:**
- Los jobs `WRITE_TO_INMOVILLA` retornan error retriable (no permanente)
- La cola los reintentará con backoff; para cuando vuelvan, el circuito puede estar en HALF_OPEN
- Se emite alerta WhatsApp (`alertGeneric`) al abrir el circuito

**Módulo:** `lib/circuit-breaker/` — funciones `canExecute()`, `recordSuccess()`, `recordFailure()`

**Visibilidad:** el endpoint `/api/workers/status` (con auth) incluye `circuitBreakers[]` con el estado actual.

## Hardening

### Ingestion Worker — Propiedades (REST)

**Rate limits Inmovilla REST:** 10 req/min, 50 req/10min. El worker usa 13s entre peticiones.

**Manejo de errores por propiedad:**

| Error | Estrategia |
|-------|-----------|
| Rate limit (408) | Hasta 3 esperas de 120s; si persiste, corta el batch + alerta WhatsApp |
| Red/timeout | Hasta 3 reintentos con 5s de espera; si falla, omite la propiedad |
| Auth (401/403) | No retriable, omite la propiedad |
| Parse error | No retriable, omite la propiedad |

Clasificación: `lib/workers/ingestion/errors.ts` (`classifyError()`, `isRateLimitError()`, `isRetryableError()`).

### Ingestion Worker — Demandas (Legacy)

**Validación de respuesta:** esquemas zod en `lib/inmovilla/api/demand-schemas.ts` validan la estructura JSON de cada página y cada registro. Registros inválidos se omiten con log (degradación parcial).

**Reintentos:**

| Paso | Estrategia |
|------|-----------|
| Login Inmovilla | 1 reintento con 10s de espera; si falla 2x, alerta WhatsApp |
| Fetch demandas | 1 reintento si error retriable (red/timeout) con 5s de espera |

### Dead-Letter Queue (DLQ)

Jobs que fallan `maxAttempts` veces (default 5) o con error permanente se mueven a estado `DEAD_LETTER` en la tabla `job_queue`. Al entrar en DLQ se emite `alertDeadLetter` (log + WhatsApp).

**Operaciones DLQ:** `lib/job-queue/dead-letter.ts`

| Operación | Descripción |
|-----------|-------------|
| `listDeadLetterJobs` | Lista jobs en DLQ con filtro y paginación |
| `getDeadLetterStats` | Total, conteo por tipo, oldest/newest |
| `replayDeadLetterJob` | Reencola 1 job (reset attempts) |
| `replayAllDeadLetterByType` | Reencola todos los de un tipo |
| `purgeDeadLetterJobs` | Elimina jobs anteriores a un corte |

**API HTTP:** `POST /api/workers/dead-letter` con acciones `replay`, `replay_all`.

### Idempotencia

Todas las llamadas `enqueueJob` en el codebase incluyen `idempotencyKey`. La cola maneja colisiones P2002 devolviendo el job existente.

**Convenciones de claves:**

| Patrón | Ejemplo |
|--------|---------|
| Eventos de ingesta | `process-event:${event.id}` |
| Proyecciones | `update_property_projection:${eventId}` |
| Escritura Inmovilla | `write_to_inmovilla:updateDemandCriteria:${event.id}` |
| Microsite | `generate_microsite:${demandId}:${event.id}` |
| Pricing | `run-pricing:${event.id}` |
| Postventa | `postventa:${key}:${step.label}` |
| Firma | `send_signature_request:${legalDoc.id}` |

### Alertas

Sistema de alertas en `lib/alerts/alert-service.ts`. Canales: log estructurado + notificación interna (`private-notifications-management`).

| Función | Cuándo se emite |
|---------|-----------------|
| `alertDeadLetter` | Job entra en DLQ |
| `alertGeneric` | Circuit breaker abre, login demandas falla 2x, batch propiedades cortado |
| `alertThreshold` | Métricas superan umbral configurable |

## Health check y monitoreo

### GET /api/workers/status

Endpoint de monitoreo. Devuelve el estado operativo de los workers y la base de datos.

**Sin autenticación** — health check mínimo (útil para load balancers y probes de plataforma):

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-03-14T12:00:00.000Z"
}
```

**Con autenticación** (header Authorization Bearer o query param de autorización, valor en `CRON_SECRET`) — respuesta completa:

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-03-14T12:00:00.000Z",
  "workers": [
    { "id": "ingestion:properties", "label": "Ingesta propiedades", "lastSuccessAt": "2026-03-14T11:55:00.000Z", "status": "ok", "lastSuccessSource": "ingestion_cycle_metrics", "ageMinutes": 5 },
    { "id": "ingestion:demands",    "label": "Ingesta demandas",    "lastSuccessAt": "2026-03-14T11:50:00.000Z", "status": "ok", "lastSuccessSource": "ingestion_cycle_metrics", "ageMinutes": 10 },
    { "id": "egestion",             "label": "Egestión",            "lastSuccessAt": "2026-03-14T11:45:00.000Z", "status": "ok", "lastSuccessSource": "job_queue", "ageMinutes": 15 },
    { "id": "consumer",             "label": "Consumer",            "lastSuccessAt": "2026-03-14T11:58:00.000Z", "status": "ok", "lastSuccessSource": "execution_metrics", "ageMinutes": 2 }
  ],
  "jobQueue": {
    "pending": 2,
    "inProgress": 0,
    "completed": 150,
    "failed": 0,
    "deadLetter": 0
  },
  "pendingJobs": [
    {
      "id": "cm...",
      "type": "PROCESS_EVENT",
      "status": "PENDING",
      "attempts": 0,
      "maxAttempts": 5,
      "availableAt": "2026-03-14T11:59:00.000Z",
      "createdAt": "2026-03-14T11:58:30.000Z",
      "sourceEventId": "evt_123",
      "lastError": null,
      "ageMinutes": 1.5
    }
  ],
  "pendingByType": [
    { "type": "PROCESS_EVENT", "count": 2 }
  ],
  "recentErrors": []
}
```

**Campos `status` por worker:**

| Valor | Significado |
|-------|-------------|
| `ok` | Último poll hace menos de 30 minutos |
| `degraded` | Último poll hace más de 30 minutos |
| `never_run` | Sin datos en snapshot (primer arranque o worker nunca ejecutado) |

**`status` global:**

| Valor | Significado |
|-------|-------------|
| `ok` | DB responde y todos los workers `ok` |
| `degraded` | DB responde pero algún worker `degraded` o `never_run` |
| `error` | DB no responde |

**Códigos HTTP:** 200 si `status` es `ok` o `degraded`; 503 si `status` es `error`.

**Fuentes de datos (con auth):**
- `ingestion:properties` → último `finishedAt` exitoso en `ingestion_cycle_metrics` (fallback a `MAX(updatedAt)` de `property_snapshots`)
- `ingestion:demands` → último `finishedAt` exitoso en `ingestion_cycle_metrics` (fallback a `MAX(updatedAt)` de `demand_snapshots`)
- `egestion` → `completedAt` del último job `WRITE_TO_INMOVILLA` con `status = COMPLETED` en `job_queue`
- `consumer` → último `finishedAt` exitoso en `execution_metrics` con `operation = consumer:loop`
- `jobQueue` → `GROUP BY status` sobre `job_queue`
- `pendingJobs` → primeros jobs con `status IN (PENDING, IN_PROGRESS)` ordenados por disponibilidad/antigüedad
- `pendingByType` → `GROUP BY type` sobre jobs `PENDING`
- `recentErrors` → últimos 5 jobs con `status IN (FAILED, DEAD_LETTER)`, ordenados por `failedAt DESC`

## Panel interno de health

- UI interna: `/platform/configuracion`
- API del panel: `GET /api/configuracion/health`
- Auth: sesión `CEO`
- Documentación ampliada: `docs/panel-health.md`
