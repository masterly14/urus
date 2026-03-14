# Workers (Capa 2)

- **Ingestion Worker (M1)** — Lectura de propiedades y demandas desde Inmovilla. Detalle: [workers/ingestion.md](workers/ingestion.md).
  - Propiedades: API REST (`GET /propiedades/?listado` + `GET /propiedades/?cod_ofer`) si `INMOVILLA_API_TOKEN`; si no, legacy (login + paginación).
  - Demandas: polling legacy (no hay endpoint REST para demandas).
- **Egestion Worker (M2)** — Escritura en Inmovilla (API REST para clientes/propiedades/propietarios; RPA legacy para demandas). Ver `lib/inmovilla/write/`.

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
    { "id": "ingestion:properties", "lastSuccessAt": "2026-03-14T11:55:00.000Z", "status": "ok" },
    { "id": "ingestion:demands",    "lastSuccessAt": "2026-03-14T11:50:00.000Z", "status": "ok" },
    { "id": "egestion",             "lastSuccessAt": "2026-03-14T11:45:00.000Z", "status": "ok" }
  ],
  "jobQueue": {
    "pending": 2,
    "inProgress": 0,
    "completed": 150,
    "failed": 0,
    "deadLetter": 0
  },
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
- `ingestion:properties` → `MAX(updatedAt)` de la tabla `property_snapshots`
- `ingestion:demands` → `MAX(updatedAt)` de la tabla `demand_snapshots`
- `egestion` → `completedAt` del último job `WRITE_TO_INMOVILLA` con `status = COMPLETED` en `job_queue`
- `jobQueue` → `GROUP BY status` sobre `job_queue`
- `recentErrors` → últimos 5 jobs con `status IN (FAILED, DEAD_LETTER)`, ordenados por `failedAt DESC`
