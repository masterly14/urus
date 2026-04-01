# Dashboard Comercial (M10) — Métricas, modelos y queries

Este documento describe la **implementación técnica** del sistema de métricas del Dashboard Comercial: qué KPIs se calculan, de qué datos salen, qué tablas existen en Neon y qué endpoints exponen los resultados.

---

## Objetivo

Convertir el flujo operativo (leads → visitas → cierres) en KPIs comparables por comercial y por período, sin depender de parsear eventos JSON “en caliente”.

La analítica se implementa con un read-model tipo **facts** (CQRS): tablas de agregación optimizadas para queries.

---

## KPIs implementados (v1)

- **Conversión lead → visita**: \(visits / leadsAssigned\)
- **Conversión visita → cierre**: \(closings / visits\)
- **Tiempo medio de cierre**: promedio de `daysToClose` en cierres del período
- **Facturación (estimada)**:
  - **Facturación total del período** (por comercial): suma de `grossAmountEur * commissionRate`
  - **Facturación por operación**: \(estimatedRevenue / closings\)
- **Ingresos por lead asignado**: \(estimatedRevenue / leadsAssigned\)
- **% leads perdidos por falta de seguimiento**: \(leadsLostNoFollowUp / leadsAssigned\)

### Definición de “lead perdido por falta de seguimiento”

Un lead se marca como “perdido” en el dashboard si:

- Está **asignado** (`assignedComercialId` no nulo), y
- **No** tiene `contactedAt`, y
- Su `createdAt` es anterior a `range.to - DASHBOARD_LEAD_NO_FOLLOW_UP_HOURS`

---

## Fuente de datos (eventos y proyecciones)

### Eventos (Event Store)

Los hechos analíticos se alimentan desde eventos del Event Store:

- **Leads**
  - `LEAD_INGESTADO` → crea/actualiza `CommercialLeadFact`
  - `LEAD_CONTACTADO` → marca `contactedAt` en `CommercialLeadFact`
- **Visitas**
  - `VISITA_AGENDADA` → crea/actualiza `CommercialVisitFact`
  - `VISITA_EVALUADA` → crea/actualiza `CommercialVisitEvaluationFact`
- **Cierres**
  - `OPERACION_CERRADA` → crea/actualiza `CommercialOperationFact`

### Proyecciones (estado actual)

Se usan como “dimensiones” para completar datos cuando el evento no trae todo:

- `DemandCurrent.agente` puede ayudar a resolver el comercial asociado a una demanda.
- `PropertySnapshot.agente/ciudad/zona/precio/firstSeenAt` se usa para completar cierres (comercial y timing).

---

## Modelo analítico (facts)

Definidos en `prisma/schema.prisma` y migrados con:

- `prisma/migrations/20260331180000_m10_dashboard_comercial_metrics/migration.sql`

Tablas principales:

- `commercial_lead_facts`
  - clave: `leadId` (aggregateId del lead)
  - asignación: `assignedComercialId`, `assignedComercialNombre`
  - contacto: `contactedAt`, `contactedByComercialId`, `contactChannel`
- `commercial_visit_facts`
  - clave: `sourceEventId` (id del evento `VISITA_AGENDADA`)
  - relación: `demandId`
  - fecha: `scheduledAt` (si se puede derivar de `fecha` + `horaInicio`)
- `commercial_visit_evaluation_facts`
  - clave: `sourceEventId` (id del evento `VISITA_EVALUADA`)
  - relación: `demandId`
  - interés: `interes` (alto/medio/bajo)
- `commercial_operation_facts`
  - clave: `sourceEventId` (id del evento `OPERACION_CERRADA`)
  - relación: `propertyCode`
  - timing: `closedAt`, `firstSeenAt`, `daysToClose`
  - importes: `grossAmountEur` (por defecto se usa `PropertySnapshot.precio`)

---

## “Best-effort” al procesar eventos

Los upserts de facts se ejecutan como **side-effects no bloqueantes**:

- Si falla la escritura en facts (migración pendiente, error DB, mapping incompleto), se captura el error y se loguea.
- El handler del evento **no** falla por eso; el flujo de negocio (cadencias, jobs, etc.) sigue.

Esto evita que una avería en analítica bloquee automatizaciones críticas.

---

## Cálculo de “facturación”

En v1 se calcula una **facturación estimada** como:

- `estimatedRevenueEur = grossAmountEur * commissionRate`

Donde:

- `grossAmountEur` viene de `PropertySnapshot.precio` asociado a `propertyCode`.
- `commissionRate` se configura con `DASHBOARD_COMMISSION_RATE` (default 0.03).

> Nota: esto es una aproximación; si más adelante se dispone de comisión real/honorarios en Inmovilla, se debería persistir en `CommercialOperationFact` y sustituir el cálculo.

---

## Queries y endpoints

### Queries

Implementadas en `lib/dashboard/comercial/queries.ts` usando SQL analítico (`prisma.$queryRaw`).

### Endpoints

- `GET /api/dashboard/comerciales`
  - query params:
    - `from` (ISO date) opcional
    - `to` (ISO date) opcional
    - `includeInactive` (1/true) opcional
- `GET /api/dashboard/comercial/:id`
  - query params:
    - `from` (ISO date) opcional
    - `to` (ISO date) opcional

Si `from/to` no se envían, el rango por defecto es **inicio de mes → ahora**.

---

## Variables de entorno

Ver `.env.example`:

- `DASHBOARD_COMMISSION_RATE` (default 0.03)
- `DASHBOARD_LEAD_NO_FOLLOW_UP_HOURS` (default 24)

---

## Clasificacion automatica de comerciales

### Objetivo

Segmentar a cada comercial en uno de cuatro perfiles de rendimiento, calculados matematicamente a partir de sus KPIs relativos al equipo. Esto permite acciones diferenciadas (formacion, reasignacion de leads, intervencion directa) en lugar de gestion por intuicion.

### Perfiles

| Perfil | Clave | Descripcion |
|--------|-------|-------------|
| Top Performer | `top_performer` | Metricas por encima del equipo en conversion, facturacion y seguimiento |
| Productivo Ineficiente | `productivo_ineficiente` | Alta actividad (muchos leads/visitas) pero baja conversion |
| Dependiente del Lead Caliente | `dependiente_lead_caliente` | Solo contacta/cierra leads de score alto; ignora el resto |
| Bajo Rendimiento Estructural | `bajo_rendimiento_estructural` | Baja conversion, alto % perdida, baja facturacion |
| Sin Datos Suficientes | `sin_datos_suficientes` | Menos de `CLASSIFY_MIN_LEADS` leads asignados en el periodo |

### Algoritmo

1. Se computan **promedios del equipo** (`TeamAverages`) solo con comerciales que tengan >= `CLASSIFY_MIN_LEADS` leads asignados.
2. Para cada comercial con suficientes datos, se calcula un **score por perfil** basado en ratios vs la media del equipo:
   - **Top performer**: ratios de conversion, revenue/lead e inversa de tasa de perdida; todas deben superar umbrales absolutos minimos.
   - **Productivo ineficiente**: ratio de actividad (leads + visitas) alto con ratio de conversion invertido.
   - **Dependiente del lead caliente**: sesgo de contacto hacia leads de score alto (percentil 75) + revenue/operacion alto + conversion general baja.
   - **Bajo rendimiento**: inversa de conversion + ratio de perdida + inversa de revenue/lead.
3. Los scores se **normalizan** a [0, 1] y se asigna el perfil con mayor score.
4. **Confianza** = diferencia entre el score del perfil asignado y el segundo mas alto.

### Deteccion de "lead caliente" (hot-lead bias)

Se consulta `commercial_lead_facts` para calcular por comercial:
- Proporcion de leads con score >= P75 entre los asignados.
- Proporcion de leads contactados con score >= P75.
- `hotLeadContactBias = (contactedHighScore / contactedTotal) / (highScoreLeads / totalLeads)`.

Un bias >= `CLASSIFY_HOT_LEAD_BIAS_THRESHOLD` indica que el comercial contacta preferentemente leads de alto score.

### Persistencia

Cada vez que se computa la clasificacion (al servir `GET /api/dashboard/comerciales`), se persiste en `commercial_classifications` como side-effect no bloqueante. Cada registro almacena:
- `comercialId`, `rangeFrom`, `rangeTo`
- `profile`, `confidence`
- `profileScores` (JSON con score para cada perfil)
- `metricsSnapshot` (JSON con las metricas del comercial en ese momento)

Esto permite analisis historico y deteccion de cambios de perfil.

### Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `CLASSIFY_MIN_LEADS` | 3 | Minimo de leads asignados para clasificar |
| `CLASSIFY_TOP_MIN_CONV_LV` | 0.10 | Conversion lead-visita minima absoluta para Top Performer |
| `CLASSIFY_TOP_MIN_CONV_VC` | 0.15 | Conversion visita-cierre minima absoluta para Top Performer |
| `CLASSIFY_HOT_LEAD_BIAS_THRESHOLD` | 1.5 | Sesgo minimo de contacto high-score para Dep. Lead Caliente |

### Archivos de clasificacion

- Motor: `lib/dashboard/comercial/classify.ts`
- Query lead-score: `getLeadScoreStatsByComercial()` en `lib/dashboard/comercial/queries.ts`
- Tests: `lib/dashboard/comercial/__tests__/classify.test.ts`
- Modelo Prisma: `CommercialClassification` en `prisma/schema.prisma`
- Migracion: `prisma/migrations/20260401120000_m10_commercial_classifications/migration.sql`

### Respuesta de API

Ambos endpoints incluyen la clasificacion:

- `GET /api/dashboard/comerciales` — cada fila de `rows[]` incluye `classification: { profile, confidence }`.
- `GET /api/dashboard/comercial/:id` — campo `classification: { profile, confidence }` a nivel de respuesta.

### UI

- **Tabla de ranking** (`/rendimiento/comerciales`): columna "Perfil" con badge de color y tooltip con nombre completo + confianza.
- **Detalle** (`/rendimiento/comerciales/:id`): card destacada con nombre del perfil, confianza y recomendacion estatica.

---

## Archivos clave

- Modelo/migración:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260331180000_m10_dashboard_comercial_metrics/migration.sql`
  - `prisma/migrations/20260401120000_m10_commercial_classifications/migration.sql`
- Ingesta de facts (side-effects):
  - `lib/dashboard/comercial/facts.ts`
  - `lib/workers/consumer/lead-scoring-handler.ts` (LEAD_INGESTADO)
  - `lib/workers/consumer/lead-contacted-handler.ts` (LEAD_CONTACTADO)
  - `lib/workers/consumer/visita-agendada-handler.ts` (VISITA_AGENDADA)
  - `lib/workers/consumer/visita-evaluada-handler.ts` (VISITA_EVALUADA)
  - `lib/post-sale/post-sale-handler.ts` (OPERACION_CERRADA)
- Clasificacion:
  - `lib/dashboard/comercial/classify.ts`
  - `lib/dashboard/comercial/__tests__/classify.test.ts`
- API:
  - `app/api/dashboard/comerciales/route.ts`
  - `app/api/dashboard/comercial/[id]/route.ts`
- UI:
  - `app/rendimiento/comerciales/page.tsx`
  - `app/rendimiento/comerciales/[id]/page.tsx`
- Hook:
  - `lib/hooks/use-dashboard-comercial.ts`

