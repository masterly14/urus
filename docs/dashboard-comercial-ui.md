# Dashboard Comercial (M10) — Infraestructura de UI

Documentación de la **capa de presentación** del Dashboard Comercial: rutas Next.js, consumo de API, hooks y patrones visuales. Las definiciones de KPIs, tablas fact y queries SQL están en [dashboard-comercial-metricas.md](./dashboard-comercial-metricas.md).

## Rutas de aplicación

| Ruta | Archivo | Descripción |
|------|---------|-------------|
| `/rendimiento/comerciales` | `app/rendimiento/comerciales/page.tsx` | Vista de equipo: KPIs agregados, gráficos de conversión y facturación por comercial, tabla de ranking. |
| `/rendimiento/comerciales/[id]` | `app/rendimiento/comerciales/[id]/page.tsx` | Detalle de un comercial: KPIs del periodo, gráfico de área semanal (hasta ~12 semanas), paneles Pipeline y Eficiencia. |

Ambas páginas son **Client Components** (`"use client"`) porque consumen datos vía `fetch` en el cliente y usan Recharts en el navegador.

## API consumida

| Endpoint | Uso en UI |
|----------|-----------|
| `GET /api/dashboard/comerciales` | Listado y agregados del equipo. Query params: `from`, `to` (ISO), `includeInactive` (`1` / `true`). |
| `GET /api/dashboard/comercial/:id` | Resumen + serie `weekly` del comercial. Mismos query params de rango. |

Implementación server-side: `app/api/dashboard/comerciales/route.ts` y `app/api/dashboard/comercial/[id]/route.ts`, delegando en `lib/dashboard/comercial/queries.ts`.

## Hook de datos

**Archivo:** `lib/hooks/use-dashboard-comercial.ts`

- `useDashboardComerciales(filters)` — estado `data` / `loading` / `error`, más `refetch`.
- `useDashboardComercialDetail(comercialId, filters)` — mismo patrón para el detalle.

**Filtros:** `DashboardComercialesFilters` con `from?`, `to?`, `includeInactive?`.

## Navegación

- **Layout Rendimiento** (`app/rendimiento/layout.tsx`): pestaña **Comerciales** con icono `TrendingUp`.
- **Sidebar** (`components/layout/sidebar.tsx`): entrada **Comerciales** bajo el grupo **Rendimiento**.

## Componentes reutilizados

| Origen | Uso |
|--------|-----|
| `components/dashboard/kpi-card.tsx` | Tarjetas KPI (moneda, porcentaje, número) con tendencia visual placeholder (`change: 0`, `trend: stable`) hasta disponer de periodo anterior. |
| `components/bi/charts.tsx` | `SimpleBarChart` (barras verticales por comercial) y `SimpleAreaChart` (serie semanal en detalle). |
| `components/ui/*` | `Card`, `Table`, `Switch`, `Skeleton`, `Badge`, `Button`, etc. |

El estilo sigue el patrón de `/rendimiento/equipo` y BI (`space-y-6`, grillas responsive, tablas shadcn).

## Agregados en la vista de equipo

Calculados en cliente a partir de `rows`:

- Facturación total: suma de `estimatedRevenueEur`.
- Conversión global lead → visita: media de `conversionLeadToVisit` solo entre filas con `leadsAssigned > 0`.
- Total cierres: suma de `closings`.
- Tasa media de pérdida: media de `lostLeadRate` con la misma condición de leads.

## Fuera de alcance actual (deuda conocida)

- **Sparklines por fila** en la tabla de equipo: la API de listado no expone series semanales por comercial; evitar N+1 hasta endpoint batch o ampliación del read-model.
- **Clasificación automática** (arquetipos) y **alertas por cron**: ítems de producto distintos; la UI actual no los implementa.
- **Comparativa periodo anterior** en KPI cards: requiere segundo rango o endpoint histórico.

## Variables de entorno (backend)

Ver `docs/dashboard-comercial-metricas.md` para `DASHBOARD_COMMISSION_RATE` y `DASHBOARD_LEAD_NO_FOLLOW_UP_HOURS`; afectan a los valores numéricos que muestra la UI sin cambiar el front.

## Pruebas manuales sugeridas

1. Abrir `/rendimiento/comerciales` con base de datos con facts poblados; comprobar tabla y gráficos.
2. Pulsar una fila → navegación a `/rendimiento/comerciales/{id}` y gráfico semanal.
3. Cambiar fechas e interruptor “Incluir inactivos” y verificar recarga.
