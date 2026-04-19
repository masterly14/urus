# Panel de health

Se implementó un micro-frontend operativo en `configuracion` para visualizar la salud del sistema en tiempo real a partir de la telemetría persistente y del estado de la job queue.

La idea es ofrecer una lectura rápida y accionable del backend sin depender de inspeccionar la base de datos ni los logs manualmente.

## Qué muestra

- Estado global del sistema
- Estado de la base de datos
- Estado de cada worker:
  - `ingestion:properties`
  - `ingestion:demands`
  - `egestion`
  - `consumer`
- Último poll o ejecución exitosa
- Fuente del último éxito (`ingestion_cycle_metrics`, `execution_metrics`, `job_queue` o snapshot)
- Cola de jobs pendiente y en progreso
- Desglose de jobs pendientes por `type`
- Errores recientes de la cola y dead-letter

## Rutas y archivos principales

- Página UI: `app/platform/configuracion/page.tsx`
- Hook cliente: `lib/hooks/use-health-panel.ts`
- API interna del panel: `app/api/configuracion/health/route.ts`
- Backend agregado de estado: `lib/workers/status.ts`
- Endpoint operativo original: `app/api/workers/status/route.ts`

## API del panel

### `GET /api/configuracion/health`

- Uso: alimentar el micro-frontend interno del panel
- Auth: `CEO` vía `getSession(request)`
- Respuesta:
  - `status`, `db`, `timestamp`
  - `workers[]`
  - `jobQueue`
  - `pendingJobs[]`
  - `pendingByType[]`
  - `recentErrors[]`

## Diferencia respecto a `/api/workers/status`

`/api/workers/status` sigue siendo el endpoint operativo para probes y monitoreo técnico con auth tipo cron.  
`/api/configuracion/health` existe para el panel interno y usa la sesión simulada del frontend.

## Cómo probarlo

### Test focalizado

```bash
npx vitest run app/api/configuracion/health/route.test.ts
```

### Verificación manual

1. Abrir `/platform/configuracion`
2. Confirmar que aparecen cards globales, tabla de workers, cola y errores
3. Forzar jobs pendientes o fallidos y verificar:
   - aumento en `jobQueue.pending` / `failed`
   - aparición en `pendingByType`
   - aparición en `recentErrors`

## Notas de implementación

- Para ingesta, el panel prioriza `ingestion_cycle_metrics` como fuente del último éxito y hace fallback a snapshots si no existen métricas todavía.
- Para el consumer, el panel usa `execution_metrics`.
- Para egestión, la señal sigue viniendo de `job_queue` completada.
