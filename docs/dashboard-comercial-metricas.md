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

## Archivos clave

- Modelo/migración:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260331180000_m10_dashboard_comercial_metrics/migration.sql`
- Ingesta de facts (side-effects):
  - `lib/dashboard/comercial/facts.ts`
  - `lib/workers/consumer/lead-scoring-handler.ts` (LEAD_INGESTADO)
  - `lib/workers/consumer/lead-contacted-handler.ts` (LEAD_CONTACTADO)
  - `lib/workers/consumer/visita-agendada-handler.ts` (VISITA_AGENDADA)
  - `lib/workers/consumer/visita-evaluada-handler.ts` (VISITA_EVALUADA)
  - `lib/post-sale/post-sale-handler.ts` (OPERACION_CERRADA)
- API:
  - `app/api/dashboard/comerciales/route.ts`
  - `app/api/dashboard/comercial/[id]/route.ts`

