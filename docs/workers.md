# Workers (Capa 2)

- **Ingestion Worker (M1)** — Lectura de propiedades y demandas desde Inmovilla. Detalle: [workers/ingestion.md](workers/ingestion.md).
  - Propiedades: API REST (`GET /propiedades/?listado` + `GET /propiedades/?cod_ofer`) si `INMOVILLA_API_TOKEN`; si no, legacy (login + paginación).
  - Demandas: polling legacy (no hay endpoint REST para demandas).
- **Egestion Worker (M2)** — Escritura en Inmovilla (API REST para clientes/propiedades/propietarios; RPA legacy para demandas). Ver `lib/inmovilla/write/`.
- **Consumer (Event Handlers)** — Procesa eventos del Event Store y ejecuta side effects (WhatsApp, jobs, proyecciones, alertas). Referencia completa: [workers/consumer-handlers.md](workers/consumer-handlers.md). Flujo de lead scoring: [workers/lead-scoring-flow.md](workers/lead-scoring-flow.md).

## Cron-jobs (QStash)

| Ruta | Script / Worker |
|------|-----------------|
| `POST /api/cron/ingestion/properties` | `runPropertiesIngestionCycle()` |
| `POST /api/cron/ingestion/demands` | `runDemandsIngestionCycle()` |

Autorización: header `Authorization: Bearer <token>` (valor en variable de entorno `CRON_SECRET`).

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
