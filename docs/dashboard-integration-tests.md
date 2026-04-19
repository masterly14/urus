# Tests de integración — dashboards (M10 / M11 / M13)

## Objetivo

Verificar que los datos **fluyen desde el Event Store y hechos comerciales** hasta las **APIs** que consumen las vistas conectadas (comercial, CEO, colaboradores), y que los **componentes de presentación** renderizan valores coherentes con las mismas queries que usa el servidor.

No sustituye al pipeline completo de ingesta Inmovilla (`lib/__tests__/pipeline-integration.test.ts`); lo **complementa** en el dominio de métricas y dashboards.

## Suite Vitest

| Archivo | Qué cubre |
|--------|-----------|
| `lib/dashboard/__tests__/integration-harness.ts` | IDs de corrida, drenaje de `PROCESS_EVENT`, limpieza de eventos/hechos/entidades de escenario. |
| `lib/dashboard/__tests__/dashboards-api-integration.test.ts` | Crea comercial + snapshot de propiedad + operación + colaborador asignado; emite `OPERACION_CERRADA`, procesa consumer y valida respuestas HTTP de rutas API. |
| `app/platform/bi/__tests__/dashboards-ui-integration.test.tsx` | `getCeoOverview()` → render de `KpiCard` y `Semaforo` (misma fuente que `GET /api/ceo/overview`). Entorno **jsdom** (`@vitest-environment jsdom`). |

### Comando

```bash
npm run test:dashboards
```

Requisitos: `DATABASE_URL` (Neon) accesible, mismas variables que para `npm test` en integración.

El `beforeAll` del test de API puede tardar >10s (consumer + jobs). En `vitest.config.ts` el **`hookTimeout` global** está elevado para soportar estos escenarios.

## Script live / casi producción

```bash
npm run dashboards:live-check
```

Ejecuta:

1. Conectividad a Neon y las **queries** de `getComercialesDashboard`, `getDashboardColaboradores`, `getCeoOverview` (sin pasar por HTTP).
2. Si está definido `INMOVILLA_API_TOKEN`: **GET** listado REST de propiedades (misma API que producción para lectura).
3. Si está definido `STATEFOX_BEARER_TOKEN`: **GET** `/snapshot` con `items=10`.

Código: `scripts/test-dashboards-live-integration.ts`.

- Código de salida **1** si algún check ejecutado falla.
- Si faltan tokens externos, esos checks se marcan como **OMITIDO** (no fallan la corrida).

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Obligatoria para tests de integración y para el bloque interno del script live. |
| `INMOVILLA_API_TOKEN` | Opcional en script live; habilita verificación REST real (rate limits: ver `docs/documentacion-api-rest-inmovilla.md`). |
| `STATEFOX_BEARER_TOKEN` | Opcional en script live; habilita snapshot Statefox. |

## Relación con la UI

Las páginas BI que aún usan mock (`?mock=1`) no forman parte de esta suite; aquí solo se validan flujos **ya conectados** a datos reales y las piezas compartidas (`KpiCard`, `Semaforo`).
