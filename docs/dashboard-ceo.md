# Dashboard CEO — Gobierno Estratégico (M13)

## Qué es

Panel exclusivo del CEO que integra datos de todos los módulos del sistema para ofrecer una visión ejecutiva en tiempo real. El CEO ve el estado de la empresa en 2 minutos sin necesidad de interpretar datos crudos: semáforos, KPIs y tendencias.

Organizado en 6 capas (pestañas en `/bi/`):

1. **Visión Ejecutiva** — KPIs financieros + semáforos globales (implementada)
2. **Rendimiento** — Rendimiento comercial por ciudad y persona (implementada)
3. **Capital Humano** — Estado psicológico y sostenibilidad del equipo (mock)
4. **Diagnóstico IA** — Recomendaciones automáticas con LangGraph (implementada)
5. **Expansión** — Motor de expansión geográfica (implementada)
6. **Finanzas** — Control financiero, costes y reinversión (implementada)

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

## Endpoint API — Capa 2: Rendimiento por Ciudad

### `GET /api/ceo/cities`

Acceso restringido al rol `ceo` (403 para otros roles).

**Query params:**
- `from` (ISO date, opcional) — inicio del rango
- `to` (ISO date, opcional) — fin del rango
- Si no se envían, rango por defecto: inicio del mes actual → ahora

**Respuesta:**

```json
{
  "ok": true,
  "cities": [
    {
      "ciudad": "Córdoba",
      "comercialesActivos": 5,
      "cargaMedia": 14.2,
      "propiedadesActivas": 120,
      "operacionesMes": 8,
      "facturacionMes": 72000,
      "rentabilidadPorComercial": 14400,
      "costeOportunidadLeadsPerdidos": 18000,
      "costeOportunidadCapacidadOciosa": 9600,
      "costeOportunidadTotal": 27600,
      "leadsAsignados": 45,
      "leadsPerdidos": 4,
      "ticketMedio": 4500,
      "capacidadOciosa": 30,
      "revenuePerLead": 320
    }
  ],
  "range": { "from": "2026-04-01T00:00:00.000Z", "to": "2026-04-01T21:00:00.000Z" },
  "commissionRate": 0.03
}
```

### Métricas por ciudad

| Métrica | Fuente | Fórmula |
|---|---|---|
| N.º comerciales activos | `comerciales` | `COUNT WHERE ciudad=X AND activo=true` |
| Carga media | `comerciales` | `AVG(cargaActual)` de activos por ciudad |
| Propiedades activas | `properties_current` | `COUNT WHERE nodisponible=false AND estado NOT IN cerrados` |
| Operaciones/mes | `commercial_operation_facts` | `COUNT WHERE closedAt IN rango AND ciudad=X` |
| Facturación/mes | `commercial_operation_facts` | `SUM(grossAmountEur * commissionRate)` |
| Rentabilidad/comercial | Derivada | `facturacionMes / comercialesActivos` |
| Coste oportunidad (leads) | `commercial_lead_facts` | `leadsPerdidos * ticketMedio` |
| Coste oportunidad (capacidad) | `comerciales` + facts | `capacidadOciosa * revenuePerLead` |

Ciudades operativas definidas en `lib/dashboard/ceo/types.ts`: `CIUDADES_OPERATIVAS = ["Córdoba", "Málaga", "Sevilla"]`.

## Endpoint API — Capa 4: Diagnóstico y Recomendaciones IA

### `GET /api/ceo/diagnostic`

Acceso restringido al rol `ceo` (403 para otros roles). Devuelve el último diagnóstico generado del Event Store sin invocar el LLM.

**Respuesta:**

```json
{
  "ok": true,
  "recommendation": {
    "diagnostico_general": "Urus Capital Group muestra una facturación mensual de 28.500 €...",
    "recomendaciones": [
      {
        "tipo": "contratar",
        "ciudad": "Málaga",
        "mensaje": "La carga media en Málaga alcanza el 91%...",
        "datos_soporte": ["Carga media Málaga: 91%", "Propiedades/comercial: 47"],
        "accion_sugerida": "Incorporar 1 comercial junior...",
        "impacto_esperado": "+4.100 €/mes...",
        "prioridad": "alta"
      }
    ],
    "resumen_ejecutivo": "Málaga necesita contratación urgente...",
    "semaforo_global": "amarillo",
    "confidence": 0.85,
    "reasoning": "Datos suficientes de 3 ciudades..."
  },
  "generatedAt": "2026-04-01T07:00:00.000Z"
}
```

### `POST /api/ceo/diagnostic`

Regenera el diagnóstico invocando el grafo LangGraph. CEO-only. Recopila datos de Capas 1+2, Dashboard Comercial, Alertas y Colaboradores.

### `POST /api/cron/ceo-diagnostic`

Cron autenticado con `CRON_SECRET`. Invoca el generador completo. Pensado para ejecución diaria (07:00) vía QStash.

### Tipos de recomendación

| Tipo | Disparador |
|---|---|
| `contratar` | Carga media > 85% en una ciudad |
| `expandir` | Facturación estable + margen >= 15% + cash >= 50K |
| `intervenir_proceso` | Conversión baja + alto volumen de leads |
| `redistribuir_leads` | Desbalance de carga > 2x entre comerciales |
| `formacion` | Comerciales bajo_rendimiento_estructural |
| `ajustar_incentivos` | Productivo_ineficiente con alto volumen pero bajo margen |
| `reducir_costes` | Coste operativo / revenue > 80% |
| `investigar` | Datos insuficientes o anomalías |

### Fuentes de datos del diagnóstico

El grafo LangGraph recibe datos consolidados de:

1. **Capa 1** (`getCeoOverview`): KPIs financieros, semáforos, equipo, operaciones
2. **Capa 2** (`getCeoCityPerformance`): métricas por Córdoba/Málaga/Sevilla
3. **Dashboard Comercial** (`getComercialesDashboard` + `classifyTeam`): métricas y clasificación de comerciales
4. **Alertas** (`DashboardAlert`): alertas abiertas con tipo y severidad
5. **Colaboradores** (último evento `COLABORADOR_RECOMENDACION_GENERADA`): resumen del ecosistema de colaboradores

### Evento persistido

Tipo: `CEO_DIAGNOSTICO_GENERADO`, aggregateType: `CEO`, aggregateId: `ceo-diagnostic`.

## Endpoint API — Capa 5: Motor de Expansión Geográfica

### `GET /api/ceo/expansion`

Acceso restringido al rol `ceo` (403 para otros roles). Devuelve la última evaluación de expansión del Event Store sin invocar el LLM.

**Respuesta:**

```json
{
  "ok": true,
  "recommendation": {
    "readiness_global": "parcial",
    "criterios_evaluados": [
      {
        "nombre": "Facturación estable",
        "estado": "cumplido",
        "valor_actual": "28.500 €/mes",
        "umbral": "Tendencia no descendente 3+ meses",
        "comentario": "Facturación estable con ligero crecimiento."
      }
    ],
    "ciudades_recomendadas": [
      {
        "ciudad": "Granada",
        "puntuacion": 8,
        "justificacion": "Proximidad a Córdoba y Málaga...",
        "inversion_estimada_eur": 45000,
        "break_even_meses": 8,
        "comerciales_iniciales": 2,
        "riesgos": ["Competencia local", "Estacionalidad"]
      }
    ],
    "plan_expansion": "Preparar expansión a Granada en 90 días...",
    "resumen_ejecutivo": "La empresa cumple 3 de 5 criterios...",
    "confidence": 0.72,
    "reasoning": "3 criterios financieros cumplidos..."
  },
  "generatedAt": "2026-04-01T07:00:00.000Z"
}
```

### `POST /api/ceo/expansion`

Regenera la evaluación invocando el grafo LangGraph. CEO-only. Recopila datos de Capas 1+2 y comerciales clasificados.

### `POST /api/cron/ceo-expansion`

Cron autenticado con `CRON_SECRET`. Invoca el generador completo. Pensado para ejecución semanal vía QStash.

### 5 criterios de readiness evaluados

| Criterio | Fuente | Umbral |
|---|---|---|
| Facturación estable | Histórico 6 meses (`getCeoOverview`) | Tendencia no descendente 3+ meses |
| Margen operativo | `margenPorOperacion` del overview | >= 15% |
| Cash disponible | `cashDisponible` del overview | >= 50.000 € |
| Procesos estables | Alertas/equipo + carga media | Alertas < 25%, carga < 80% |
| Capacidad de liderazgo | `classifyTeam` (top_performers) | Cualitativo (LLM razona sobre el equipo) |

### Readiness global

| Nivel | Criterios cumplidos | Acción |
|---|---|---|
| `apto` | >= 4 de 5 | Recomendar 2-4 ciudades candidatas |
| `parcial` | 3 de 5 | Recomendar 1-2 ciudades + plan de mejora |
| `no_apto` | < 3 de 5 | Plan de estabilización, sin ciudades |

### Evento persistido

Tipo: `CEO_EXPANSION_EVALUADA`, aggregateType: `CEO`, aggregateId: `ceo-expansion`.

## Endpoint API — Capa 6: Control Financiero

### `GET /api/ceo/financiero`

Acceso restringido al rol `ceo` (403 para otros roles). Devuelve el último análisis financiero del Event Store sin invocar el LLM.

**Respuesta:**

```json
{
  "ok": true,
  "recommendation": {
    "costes_fijos_eur": 62000,
    "costes_variables_eur": 28000,
    "coste_por_operacion_eur": 12857,
    "ratio_fijo_variable": 0.69,
    "automatizaciones": [
      {
        "nombre": "Cadencia automática postventa",
        "coste_mensual_eur": 50,
        "ahorro_mensual_eur": 500,
        "roi_percent": 900
      }
    ],
    "roi_automatizaciones_total": 693,
    "capacidad_reinversion_eur": 35000,
    "recomendaciones": [
      {
        "categoria": "tecnologia",
        "importe_eur": 12000,
        "justificacion": "Invertir en CRM avanzado...",
        "prioridad": "alta",
        "horizonte_meses": 3
      }
    ],
    "semaforo_financiero": "verde",
    "resumen_ejecutivo": "La estructura de costes es saludable...",
    "confidence": 0.82,
    "reasoning": "Datos financieros completos de 6 meses..."
  },
  "generatedAt": "2026-04-02T07:00:00.000Z"
}
```

### `POST /api/ceo/financiero`

Regenera el análisis invocando el grafo LangGraph. CEO-only. Recopila datos de Capas 1+2 y constantes de automatizaciones.

### `POST /api/cron/ceo-financiero`

Cron autenticado con `CRON_SECRET`. Invoca el generador completo. Pensado para ejecución semanal vía QStash.

### Automatizaciones evaluadas

| Automatización | Coste/mes | Ahorro/mes | ROI |
|---|---|---|---|
| Cadencia automática postventa | 50 € | 500 € | 900% |
| Sistema alertas comerciales | 30 € | 250 € | 733% |
| Firma digital in-house (vs. SaaS externo) | 15 € | 385 € | 2567% |
| Scoring automático de leads | 40 € | 375 € | 838% |

### Categorías de reinversión

| Categoría | Descripción |
|---|---|
| `tecnologia` | CRM, IA, herramientas de automatización |
| `talento` | Contratación, headhunting |
| `marketing` | Campañas de captación digital |
| `formacion` | Programas de capacitación |
| `infraestructura` | Oficinas, equipamiento |
| `expansion` | Apertura de nuevas plazas |

### Evento persistido

Tipo: `CEO_FINANZAS_GENERADA`, aggregateType: `CEO`, aggregateId: `ceo-financiero`.

## Archivos principales

| Ruta | Descripción |
|---|---|
| `prisma/schema.prisma` | Modelos `CeoMonthlySnapshot`, `CeoTarget` |
| `lib/dashboard/ceo/types.ts` | Tipos TypeScript: `CeoOverviewPayload`, `CeoCityRow`, `CIUDADES_OPERATIVAS` |
| `lib/dashboard/ceo/thresholds.ts` | Funciones de evaluación de semáforos |
| `lib/dashboard/ceo/queries.ts` | Queries Capa 1 y `getCeoOverview()` |
| `lib/dashboard/ceo/city-queries.ts` | Query Capa 2: `getCeoCityPerformance()` con CTEs por ciudad |
| `app/api/ceo/overview/route.ts` | API Route GET Capa 1 (CEO-only) |
| `app/api/ceo/cities/route.ts` | API Route GET Capa 2 (CEO-only) |
| `lib/hooks/use-ceo-overview.ts` | Hook cliente Capa 1 |
| `lib/hooks/use-ceo-cities.ts` | Hook cliente Capa 2: `useCeoCityPerformance()` |
| `app/bi/layout.tsx` | Layout con tabs de las 6 capas + guard CEO |
| `app/bi/vision-ejecutiva/page.tsx` | UI de la Capa 1 |
| `app/bi/operativo/page.tsx` | UI de la Capa 2 (rendimiento por ciudad + ranking agentes) |
| `lib/dashboard/ceo/diagnostic-types.ts` | Schema Zod `CeoDiagnosticSchema` + tipos TS Capa 4 |
| `lib/agents/ceo-diagnostic-graph.ts` | Grafo LangGraph 1 nodo: datos → diagnóstico estructurado |
| `lib/dashboard/ceo/diagnostic-generator.ts` | Orquestador: recopila datos, invoca grafo, persiste evento |
| `app/api/ceo/diagnostic/route.ts` | API Route GET+POST Capa 4 (CEO-only) |
| `app/api/cron/ceo-diagnostic/route.ts` | Cron POST autenticado para regenerar diagnóstico |
| `lib/hooks/use-ceo-diagnostic.ts` | Hooks cliente: `useCeoDiagnostic()` + `useRegenerateDiagnostic()` |
| `app/bi/prescriptivo/page.tsx` | UI de la Capa 4 (diagnóstico IA con recomendaciones) |
| `lib/dashboard/ceo/expansion-types.ts` | Schema Zod `CeoExpansionSchema` + tipos TS Capa 5 |
| `lib/agents/ceo-expansion-graph.ts` | Grafo LangGraph 1 nodo: datos → evaluación de expansión |
| `lib/dashboard/ceo/expansion-generator.ts` | Orquestador: recopila datos, invoca grafo, persiste evento |
| `app/api/ceo/expansion/route.ts` | API Route GET+POST Capa 5 (CEO-only) |
| `app/api/cron/ceo-expansion/route.ts` | Cron POST autenticado para reevaluar expansión |
| `lib/hooks/use-ceo-expansion.ts` | Hooks cliente: `useCeoExpansion()` + `useRegenerateExpansion()` |
| `app/bi/expansion/page.tsx` | UI de la Capa 5 (motor de expansión geográfica) |
| `lib/dashboard/ceo/financial-types.ts` | Schema Zod `CeoFinancialSchema` + tipos TS Capa 6 |
| `lib/agents/ceo-financial-graph.ts` | Grafo LangGraph 1 nodo: datos → análisis financiero |
| `lib/dashboard/ceo/financial-generator.ts` | Orquestador: recopila datos, invoca grafo, persiste evento |
| `app/api/ceo/financiero/route.ts` | API Route GET+POST Capa 6 (CEO-only) |
| `app/api/cron/ceo-financiero/route.ts` | Cron POST autenticado para regenerar análisis financiero |
| `lib/hooks/use-ceo-financiero.ts` | Hooks cliente: `useCeoFinanciero()` + `useRegenerateFinanciero()` |
| `app/bi/reinversion/page.tsx` | UI de la Capa 6 (control financiero y reinversión) |
| `scripts/seed-ceo-financials.ts` | Seed de datos demo |

## Cómo probarlo

### Capa 1 — Visión Ejecutiva
1. Sincronizar schema: `npx prisma db push`
2. Insertar datos de demo: `npx tsx scripts/seed-ceo-financials.ts`
3. Iniciar dev server: `npm run dev`
4. Navegar a `/bi/vision-ejecutiva` (sesión por defecto es CEO)
5. Para ver con datos mock sin BD: `/bi/vision-ejecutiva?mock=1`

### Capa 2 — Rendimiento por Ciudad
1. Iniciar dev server: `npm run dev`
2. Navegar a `/bi/operativo` (sesión por defecto es CEO)
3. La vista "Desglose por Ciudad" muestra las 8 métricas por Córdoba/Málaga/Sevilla
4. La vista "Rendimiento Agentes" muestra ranking de comerciales con datos reales
5. Para ver con datos mock sin BD: `/bi/operativo?mock=1`

### Capa 4 — Diagnóstico IA
1. Iniciar dev server: `npm run dev`
2. Navegar a `/bi/prescriptivo` (sesión por defecto es CEO)
3. Si no hay diagnóstico previo, se muestra un botón "Generar diagnóstico"
4. Pulsar "Regenerar diagnóstico" invoca el LLM con datos reales (requiere OPENAI_API_KEY)
5. Para ver con datos mock sin BD: `/bi/prescriptivo?mock=1`
6. Cron periódico: `POST /api/cron/ceo-diagnostic` con header `Authorization: Bearer $CRON_SECRET`

### Capa 5 — Motor de Expansión
1. Iniciar dev server: `npm run dev`
2. Navegar a `/bi/expansion` (sesión por defecto es CEO)
3. Si no hay evaluación previa, se muestra un botón "Evaluar expansión"
4. Pulsar "Reevaluar expansión" invoca el LLM con datos reales (requiere OPENAI_API_KEY)
5. Muestra: readiness global, checklist de criterios, ciudades candidatas con inversión/break-even/riesgos
6. Para ver con datos mock sin BD: `/bi/expansion?mock=1`
7. Cron periódico: `POST /api/cron/ceo-expansion` con header `Authorization: Bearer $CRON_SECRET`

### Capa 6 — Control Financiero
1. Iniciar dev server: `npm run dev`
2. Navegar a `/bi/reinversion` (sesión por defecto es CEO)
3. Si no hay análisis previo, se muestra un botón "Analizar finanzas"
4. Pulsar "Reevaluar finanzas" invoca el LLM con datos reales (requiere OPENAI_API_KEY)
5. Muestra: KPIs de costes, ratio fijo/variable, tabla ROI automatizaciones, recomendaciones de reinversión
6. Para ver con datos mock sin BD: `/bi/reinversion?mock=1`
7. Cron periódico: `POST /api/cron/ceo-financiero` con header `Authorization: Bearer $CRON_SECRET`

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
