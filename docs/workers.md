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

Autorización: header `Authorization: Bearer {CRON_SECRET}` (configurado en variable `CRON_SECRET`).
