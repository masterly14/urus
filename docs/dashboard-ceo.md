# Dashboard CEO — Gobierno Estratégico (M13)

## Qué es

Panel exclusivo del CEO que integra datos de todos los módulos del sistema para ofrecer una visión ejecutiva en tiempo real. El CEO ve el estado de la empresa en 2 minutos sin necesidad de interpretar datos crudos: semáforos, KPIs y tendencias.

Organizado en 6 capas (pestañas en `/bi/`):

1. **Visión Ejecutiva** — KPIs financieros + semáforos globales (implementada)
2. **Rendimiento** — Rendimiento comercial por ciudad y persona (mock)
3. **Capital Humano** — Estado psicológico y sostenibilidad del equipo (mock)
4. **Diagnóstico IA** — Recomendaciones automáticas con LangGraph (mock)
5. **Expansión** — Motor de expansión geográfica (mock)
6. **Finanzas** — Control financiero, costes y reinversión (mock)

## Modelos Prisma

### CeoMonthlySnapshot (`ceo_monthly_snapshots`)

Foto mensual financiera. Algunos campos se pueden derivar de `CommercialOperationFact`, otros requieren entrada manual.

| Campo | Tipo | Descripción |
|---|---|---|
| `period` | String (unique) | Formato "2026-04" |
| `revenueEur` | Float | Revenue estimado de agencia |
| `grossVolumeEur` | Float | Volumen bruto de cierres |
| `operationsClosed` / `operationsActive` | Int | Conteo de operaciones |
| `ebitdaEur` | Float | EBITDA (entrada manual) |
| `operatingCostEur` | Float | Coste operativo total (entrada manual) |
| `cashAvailableEur` | Float | Cash disponible (entrada manual) |
| `fixedCostsEur` / `variableCostsEur` | Float | Desglose de costes |
| `avgMarginPerOp` | Float | Margen medio por operación |
| `reinvestmentCapacity` | Float | Capacidad de reinversión |

### CeoTarget (`ceo_targets`)

Objetivos por periodo. `month=0` indica objetivo anual.

| Campo | Tipo | Descripción |
|---|---|---|
| `year` | Int | Año |
| `month` | Int? | Mes (1-12) o null/0 para anual |
| `targetRevenueEur` | Float | Objetivo de facturación |
| `targetEbitdaEur` | Float | Objetivo EBITDA |
| `maxOperatingCostEur` | Float | Techo de coste operativo |

## Endpoint API

### `GET /api/ceo/overview`

Acceso restringido al rol `ceo` (403 para otros roles).

**Respuesta:**

```json
{
  "ok": true,
  "kpis": {
    "facturacionMensual": { "value": 128000, "previousValue": 135000, "changePercent": -5.2 },
    "facturacionTrimestral": { "value": 383000, "previousValue": null, "changePercent": null },
    "ebitda": { "value": 38000, "previousValue": 42000, "changePercent": -9.5 },
    "costeOperativo": { "value": 90000, "previousValue": 93000, "changePercent": -3.2 },
    "margenPorOperacion": { "value": 18290, "previousValue": 15000, "changePercent": 21.9 },
    "cashDisponible": { "value": 110000, "previousValue": 105000, "changePercent": 4.8 },
    "capacidadReinversion": { "value": 35000, "previousValue": 38000, "changePercent": -7.9 }
  },
  "semaforos": {
    "facturacion": "verde",
    "equipo": "amarillo",
    "expansion": "amarillo",
    "costes": "verde"
  },
  "operaciones": { "activas": 20, "cerradasMes": 7 },
  "equipo": { "comercialesActivos": 12, "alertasAbiertas": 3, "cargaMedia": 14 },
  "historico": [
    { "period": "2025-10", "revenueEur": 120000, "targetRevenueEur": 130000, "..." : "..." }
  ]
}
```

## Semáforos y umbrales

Los umbrales están definidos como constantes en `lib/dashboard/ceo/thresholds.ts`.

| Semáforo | Verde | Amarillo | Rojo |
|---|---|---|---|
| **Facturación** | >= 80% del objetivo | >= 60% | < 60% |
| **Equipo** | Alertas < 25% del equipo y carga < 75% | Alertas < 50% o carga < 90% | Alertas >= 50% o carga >= 90% |
| **Expansión** | 3 criterios OK (cash >= 50K, margen >= 15%, revenue >= 80% objetivo) | 2 criterios OK | < 2 criterios |
| **Costes** | Ratio coste/revenue < 60% | < 80% | >= 80% |

## Archivos principales

| Ruta | Descripción |
|---|---|
| `prisma/schema.prisma` | Modelos `CeoMonthlySnapshot`, `CeoTarget` |
| `lib/dashboard/ceo/types.ts` | Tipos TypeScript del payload |
| `lib/dashboard/ceo/thresholds.ts` | Funciones de evaluación de semáforos |
| `lib/dashboard/ceo/queries.ts` | Queries cross-módulo y `getCeoOverview()` |
| `app/api/ceo/overview/route.ts` | API Route GET (CEO-only) |
| `lib/hooks/use-ceo-overview.ts` | Hook cliente para fetch con sesión |
| `app/bi/layout.tsx` | Layout con tabs de las 6 capas + guard CEO |
| `app/bi/vision-ejecutiva/page.tsx` | UI de la Capa 1 |
| `scripts/seed-ceo-financials.ts` | Seed de datos demo |

## Cómo probarlo

1. Sincronizar schema: `npx prisma db push`
2. Insertar datos de demo: `npx tsx scripts/seed-ceo-financials.ts`
3. Iniciar dev server: `npm run dev`
4. Navegar a `/bi/vision-ejecutiva` (sesión por defecto es CEO)
5. Para ver con datos mock sin BD: `/bi/vision-ejecutiva?mock=1`

## Datos derivados vs manuales

**Derivados automáticamente** (de tablas existentes):
- Facturación mensual/trimestral — `CommercialOperationFact.grossAmountEur * DASHBOARD_COMMISSION_RATE`
- Operaciones activas/cerradas — `Operacion`
- Equipo (comerciales activos, carga media) — `Comercial`
- Alertas abiertas — `DashboardAlert`

**Entrada manual** (via `CeoMonthlySnapshot`):
- EBITDA, coste operativo, cash disponible, costes fijos/variables, capacidad de reinversión.

**Objetivos** (via `CeoTarget`):
- Target revenue, EBITDA y coste operativo máximo por mes o año.
