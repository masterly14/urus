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

Para el volumen actual (3 comerciales, ~37 propiedades), una sola instancia es más que suficiente.

### Transaccionalidad evento + job

Los puntos de entrada que crean un evento y encolan su `PROCESS_EVENT` usan `appendEventAndEnqueueJob()` (`lib/event-store/event-store.ts`), que ejecuta ambas operaciones en una transacción Prisma. Esto garantiza que nunca quede un evento huérfano sin job ni un job apuntando a un evento inexistente.

## Cron-jobs (QStash)

| Ruta | Script / Worker |
|------|-----------------|
| `POST /api/cron/ingestion/properties` | `runPropertiesIngestionCycle()` |
| `POST /api/cron/ingestion/demands` | `runDemandsIngestionCycle()` |

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
