# Observabilidad persistente en workers y API Routes

Esta entrega añade una capa transversal de observabilidad persistente sobre Neon/PostgreSQL para los dos planos críticos del sistema: `workers` y `app/api`. El objetivo es que cada ejecución deje trazabilidad consultable con logs estructurados y métricas de ejecución sin depender solo del stdout de la plataforma.

La implementación mantiene el principio `best-effort`: si guardar observabilidad falla, el flujo principal no se rompe. Esto aplica tanto a los workers como a las API Routes.

## Qué se construyó

- Logger estructurado compartido en `lib/observability/`.
- Contexto por ejecución con `AsyncLocalStorage` para correlacionar `requestId`, `correlationId`, `jobId`, `eventId`, `workerId`, `route` y `operation`.
- Persistencia en Neon de:
  - logs JSON en `observability_logs`
  - métricas/runs en `execution_metrics`
- Wrapper de API Routes con `withObservedRoute(...)`.
- Instrumentación del consumer e ingestion workers con métricas persistentes por ejecución.
- Extensión de `workers/status` para incluir última ejecución exitosa del consumer.

## Rutas y archivos principales

- `lib/observability/api.ts` — wrapper reusable para `GET/POST/PUT/PATCH/DELETE`.
- `lib/observability/logger.ts` — logger estructurado compartido y captura contextual de `console.*`.
- `lib/observability/context.ts` — contexto por request/job con `AsyncLocalStorage`.
- `lib/observability/persistence.ts` — escrituras `best-effort` en `observability_logs` y `execution_metrics`.
- `lib/observability/worker.ts` — helpers de contexto y métricas para workers.
- `lib/workers/consumer/consumer.ts` — métricas persistentes por loop y por job procesado.
- `lib/workers/ingestion/properties-worker.ts` — contexto y métrica persistente por ciclo.
- `lib/workers/ingestion/demands/demands-worker.ts` — contexto y métrica persistente por ciclo.
- `lib/workers/status.ts` — health extendido con señal del consumer.
- `app/api/**/route.ts` — todas las rutas HTTP quedaron envueltas con `withObservedRoute`.
- `prisma/schema.prisma` — modelos `ObservabilityLog` y `ExecutionMetric`.
- `prisma/migrations/20260408123000_observability_persistent/migration.sql` — migración SQL.

## Modelo de datos

### `observability_logs`

Una fila por log persistido relevante.

Campos principales:

- `scope` — `api` o `worker`
- `source` — origen lógico (`api`, `worker`)
- `operation` — operación semántica (`GET /api/events`, `consumer:PROCESS_EVENT`, etc.)
- `level` — `debug | info | warn | error`
- `message`
- claves de correlación: `requestId`, `correlationId`, `workerId`, `workerName`, `jobId`, `jobType`, `eventId`, `eventType`
- `route`, `method`
- `statusCode`, `durationMs`
- `errorMessage`, `errorStack`
- `context` — JSON adicional

### `execution_metrics`

Una fila por ejecución relevante de API o worker.

Campos principales:

- `scope`, `source`, `name`, `operation`
- `startedAt`, `finishedAt`, `durationMs`
- `success`
- `throughputCount`
- `statusCode`
- `errorMessage`, `errorCode`
- mismas claves de correlación que los logs
- `context` — JSON adicional

## Endpoints HTTP

No se añaden endpoints nuevos en esta entrega. El cambio es transversal:

- Todas las rutas de `app/api/**/route.ts` ahora:
  - generan/preservan `x-request-id`
  - preservan `x-correlation-id` si llega en cabecera
  - persisten métrica de duración/estado
  - registran logs estructurados de inicio, fin y error

## Workers y jobs cubiertos

- `consumer`:
  - loop principal (`consumer:loop`)
  - jobs directos y jobs `PROCESS_EVENT`
  - correlación con `jobId`, `jobType`, `eventId`, `eventType`
- `ingestion:properties`
- `ingestion:demands`

La instrumentación del consumer permite observar latencia, errores y throughput por job sin alterar la semántica existente de retries, DLQ ni `JobQueue`.

## Variables de entorno relevantes

No se introducen variables nuevas obligatorias. Siguen siendo relevantes:

- `LOG_LEVEL` — nivel mínimo de log
- `LOG_FORMAT` — `json` o `pretty`
- `LOG_STACK` — incluir stack traces en errores

## Cómo probarlo

### Tests focalizados

```bash
npx vitest run lib/observability/__tests__/api.test.ts lib/workers/consumer/__tests__/consumer.test.ts
```

### Verificación manual

1. Ejecutar un cron o una API Route.
2. Confirmar que la respuesta incluye `x-request-id`.
3. Revisar en Neon/Postgres:
   - nuevas filas en `execution_metrics`
   - nuevas filas en `observability_logs`
4. Para workers, comprobar además `GET /api/workers/status` y verificar que aparece `consumer` con `lastSuccessAt`.

## Notas operativas

- La persistencia se hace con SQL parametrizado sobre el Prisma Client actual para no bloquear la entrega por regeneración del client en Windows cuando el binario queda bloqueado.
- La capa está diseñada para ampliar dashboards y paneles de health sin volver a instrumentar rutas o workers uno a uno.
