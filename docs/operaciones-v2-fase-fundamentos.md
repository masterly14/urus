# Operaciones v2 — Fase de Fundamentos (implementada)

> **Fecha:** 21 de abril de 2026
> **Estado:** Implementada y testeada
> **Documento de diseño:** `docs/sistema-operaciones-v2.md`
> **Migración:** `20260421100000_add_oferta_firme_and_operacion_events`

---

## Qué se hizo

Se implementó la capa de datos y lógica de dominio para el Sistema de Operaciones v2. Esta fase cubre todo lo que está debajo de la UI: schema, funciones de dominio, utilidades de estado, lógica de avance/cierre y sincronización entre estados. No incluye API routes ni UI.

---

## 1. Migración de base de datos

**Archivo:** `prisma/migrations/20260421100000_add_oferta_firme_and_operacion_events/migration.sql`

Se extendieron tres enums de Postgres:

| Enum | Valor agregado | Propósito |
|------|----------------|-----------|
| `OperacionEstado` | `OFERTA_FIRME` | Nueva etapa entre EN_CURSO y RESERVA |
| `EventType` | `OPERACION_CREADA` | Trazabilidad de creación manual de operaciones |
| `EventType` | `OPERACION_AVANZADA` | Trazabilidad de avance manual de etapas |
| `JobType` | `UPDATE_PROPERTY_STATUS_INMOVILLA` | Job REST para cambiar `estadoficha` en Inmovilla |

### Pipeline de etapas resultante

```
EN_CURSO → OFERTA_FIRME → RESERVA → ARRAS → PENDIENTE_FIRMA → CERRADA_* | CANCELADA
```

Cada etapa con documento asociado:

| Etapa | Plantilla (`documentKind`) | Documento |
|-------|---------------------------|-----------|
| `OFERTA_FIRME` | `oferta_firme` | Oferta en Firme |
| `RESERVA` | `senal_compra` | Señal de Compra |
| `ARRAS` | `arras` | Contrato de Arras |
| `PENDIENTE_FIRMA` | — | Escritura pública (notaría, externo) |
| `CERRADA_*` | — | Ninguno |

---

## 2. Archivos creados

### 2.1 `lib/operacion/stages.ts` — Orden canónico y helpers

Fuente de verdad del pipeline. Exporta:

| Exportación | Tipo | Descripción |
|-------------|------|-------------|
| `OPERACION_STAGE_ORDER` | `readonly OperacionEstado[]` | `[EN_CURSO, OFERTA_FIRME, RESERVA, ARRAS, PENDIENTE_FIRMA]` |
| `CLOSED_ESTADOS` | `readonly OperacionEstado[]` | `[CERRADA_VENTA, CERRADA_ALQUILER, CERRADA_TRASPASO]` |
| `stageIndex(estado)` | `number` | Posición en el pipeline (-1 si terminal) |
| `isAdvance(from, to)` | `boolean` | Valida que la transición es hacia adelante |
| `skippedStages(from, to)` | `OperacionEstado[]` | Etapas intermedias saltadas (para validar datos en "force") |
| `isClosedEstado(estado)` | `boolean` | `true` para CERRADA_* |
| `isCancelado(estado)` | `boolean` | `true` solo para CANCELADA |
| `isTerminal(estado)` | `boolean` | `true` para cualquier estado cerrado o cancelado |
| `STAGE_DOCUMENT_KIND` | `Record<OperacionEstado, string>` | Mapeo etapa → plantilla de contrato |
| `documentKindForStage(estado)` | `string \| null` | Wrapper funcional del mapeo |

### 2.2 `lib/operacion/sync-lead-status.ts` — Sincronización automática

Cuando `Operacion.estado` cambia, sincroniza `DemandCurrent.leadStatus` automáticamente:

| OperacionEstado | LeadStatus resultante |
|---|---|
| `OFERTA_FIRME`, `RESERVA`, `ARRAS` | `EN_NEGOCIACION` |
| `PENDIENTE_FIRMA` | `EN_FIRMA` |
| `CERRADA_VENTA`, `CERRADA_ALQUILER`, `CERRADA_TRASPASO` | `CERRADO` |
| `EN_CURSO` | Sin cambio |
| `CANCELADA` | Sin cambio (comercial decide) |

No-op si la operación no tiene `demandId` vinculada. Reutiliza `updateDemandLeadStatus` existente, que maneja la sync opcional a Inmovilla vía `keysitu`.

### 2.3 `lib/operacion/stage-requirements.ts` — Validación de datos por etapa

Define los campos requeridos para cada etapa que genera documento. Cada campo indica:
- `field`: ruta lógica (ej: `buyer.nationalId`, `buyers[].fiscalAddress`)
- `label`: etiqueta para la UI (ej: "DNI del comprador")
- `source`: de dónde se obtiene (`inmovilla_client`, `inmovilla_property`, `manual`)

Funciones:
- `validateStageRequirements(targetStage, data)` → retorna campos faltantes
- `requirementsForSkippedAndTarget(skipped, target)` → requisitos acumulados cuando se saltan etapas

Soporta dot-notation (`buyer.nationalId`) y array paths (`buyers[].fullName`).

### 2.4 `lib/operacion/advance.ts` — Lógica de avance

`advanceOperacion(params)` orquesta el avance de etapa:

1. Carga la operación, valida que no es terminal
2. Valida que es un avance válido (no retroceso, no mismo estado, no a terminal)
3. Si la etapa destino tiene documento: valida datos requeridos
4. Si faltan datos: retorna `{ ok: false, missingFields }` para que la UI muestre formulario
5. Si datos completos: actualiza estado, emite `OPERACION_AVANZADA`, sincroniza LeadStatus

Interfaz de retorno:

```typescript
interface AdvanceResult {
  ok: boolean;
  missingFields?: MissingFieldResult[];  // campos que faltan
  operacion?: Operacion;                  // operación actualizada
  documentKind?: string | null;           // plantilla que corresponde
  error?: string;
}
```

### 2.5 `lib/operacion/close.ts` — Lógica de cierre y cancelación

**`closeOperacion(params)`** — cierre exitoso:

1. Valida que la operación no es terminal
2. Asocia comprador si se proporciona (`demandId`, `buyerClientId`)
3. Actualiza `estado` + `closedAt`
4. Emite evento `OPERACION_CERRADA`
5. Sincroniza LeadStatus → CERRADO
6. Encola `UPDATE_PROPERTY_STATUS_INMOVILLA` (estadoficha: 3=Vendida, 2=Alquilada, 6=Traspaso)
7. Encola `START_POSTVENTA_CADENCE`

**`cancelOperacion(operacionId, comercialId)`** — cancelación:

1. Actualiza `estado` → CANCELADA
2. Emite `OPERACION_CERRADA` con `source: "manual_cancel"`
3. No sincroniza LeadStatus (el comercial decide qué hacer con la demanda)

### 2.6 `lib/operacion/inmovilla-property-status-handler.ts` — Job REST

Handler para `UPDATE_PROPERTY_STATUS_INMOVILLA`. Reemplaza el flujo RPA roto que usaba `WRITE_TO_INMOVILLA` con `operation: "UPDATE_PROPERTY_STATUS"` (no existía en el registry).

Usa `safeUpdateProperty` de la REST API de Inmovilla:
- Recibe `propertyCode` (ref) y `estadoficha` (numérico)
- Crea un `InmovillaRestClient` con el token de entorno
- Aplica el patch `{ estadoficha }` sobre la propiedad
- Maneja 406 con retry adaptativo (heredado de `safeUpdateProperty`)

---

## 3. Archivos modificados

### 3.1 `lib/operacion/estado.ts`

- Agregado mapeo `"ofertad"` → `OFERTA_FIRME` (cubre estadoficha 18 "Ofertada" y 41 "Ofertada MLS")
- El mapeo se coloca antes de `"reserv"` para que no capture "Reservado" incorrectamente
- `isEstadoCerrado` marcado como `@deprecated`, ahora delega a `isTerminal` de `stages.ts`

### 3.2 `lib/workers/consumer/firma-completada-handler.ts`

Corregido el job roto. Antes:

```typescript
type: "WRITE_TO_INMOVILLA",
payload: { operation: "UPDATE_PROPERTY_STATUS", args: { ... } }
```

Ahora:

```typescript
type: "UPDATE_PROPERTY_STATUS_INMOVILLA",
payload: { propertyCode, estadoficha: 3, operacionId }
```

El job `WRITE_TO_INMOVILLA` con `UPDATE_PROPERTY_STATUS` fallaba silenciosamente porque esa operación no existía en el `writeOperationRegistry` (RPA). El nuevo job usa REST directamente.

### 3.3 `lib/postventa/pipeline-filter-options.ts`

Agregado `OFERTA_FIRME` a:
- `PIPELINE_OPERACION_ESTADO_VALUES` (array de valores)
- `operacionEstadoFilterLabels` (label: "Oferta en firme")

### 3.4 `lib/workers/consumer/handlers.ts`

Registrados como audit-only:
- `OPERACION_CREADA`
- `OPERACION_AVANZADA`

### 3.5 `lib/workers/consumer/job-handlers.ts`

Registrado `UPDATE_PROPERTY_STATUS_INMOVILLA` → `handleUpdatePropertyStatusInmovilla`.

### 3.6 `lib/workers/consumer/types.ts`

Agregado `UPDATE_PROPERTY_STATUS_INMOVILLA` a `ALL_CONSUMER_JOB_TYPES`.

---

## 4. Tests

**68 tests en 4 suites**, todos pasando:

| Suite | Tests | Qué cubre |
|-------|-------|-----------|
| `stages.test.ts` | 22 | Orden, `stageIndex`, `isAdvance`, `skippedStages`, `isTerminal`, `documentKindForStage` |
| `estado.test.ts` | 18 | Mapeo de todos los `estadoficha` de Inmovilla incluyendo `Ofertada` → `OFERTA_FIRME`, case insensitive, `isEstadoCerrado` deprecated |
| `sync-lead-status.test.ts` | 13 | Mapeo OperacionEstado → LeadStatus, no-op sin demandId, no-op para CANCELADA |
| `stage-requirements.test.ts` | 15 | Requisitos por etapa, validación con dot-notation y array paths, `requirementsForSkippedAndTarget` sin duplicados |

---

## 5. Diagrama de dependencias

```
prisma/schema.prisma (OperacionEstado + EventType + JobType)
  │
  ├── lib/operacion/stages.ts (orden, mapeo, helpers)
  │     ├── lib/operacion/sync-lead-status.ts
  │     ├── lib/operacion/stage-requirements.ts
  │     ├── lib/operacion/advance.ts
  │     │     ├── (usa) sync-lead-status.ts
  │     │     └── (usa) stage-requirements.ts
  │     └── lib/operacion/close.ts
  │           ├── (usa) sync-lead-status.ts
  │           └── (encola) UPDATE_PROPERTY_STATUS_INMOVILLA
  │
  ├── lib/operacion/estado.ts (mapEstadoFicha actualizado, isEstadoCerrado deprecated)
  │
  ├── lib/operacion/inmovilla-property-status-handler.ts
  │     └── (usa) lib/inmovilla/rest/safe-update.ts
  │
  ├── lib/workers/consumer/handlers.ts (OPERACION_CREADA, OPERACION_AVANZADA)
  ├── lib/workers/consumer/job-handlers.ts (UPDATE_PROPERTY_STATUS_INMOVILLA)
  ├── lib/workers/consumer/types.ts (ALL_CONSUMER_JOB_TYPES)
  ├── lib/workers/consumer/firma-completada-handler.ts (job corregido)
  └── lib/postventa/pipeline-filter-options.ts (OFERTA_FIRME en filtros)
```

---

## 6. Qué queda pendiente (fases siguientes)

Esta fase dejó listas las **bases**. Las fases siguientes, documentadas en `docs/sistema-operaciones-v2.md`, son:

1. ~~**API de Operaciones** — endpoints REST para crear, avanzar, cerrar y cancelar operaciones~~ → **Implementada** (`docs/operaciones-v2-fase-api-contratos.md`)
2. ~~**Generación automática de contratos** — integrar `advanceOperacion` con `contract-draft-handler`~~ → **Implementada** (`docs/operaciones-v2-fase-api-contratos.md`)
3. **Escritura en Inmovilla al cerrar** — definir asociación demanda-propiedad y baja de demanda
4. **Resolución de comprador** — buscador local + Inmovilla REST para asociar comprador al cerrar
5. **UI de Operaciones** — página `/platform/operaciones` con pipeline, avance manual y post-venta integrada
6. **Integración y hardening** — tests E2E, manejo de doble operación, documentación actualizada

---

## 7. Cómo usar las funciones implementadas

### Avanzar una operación

```typescript
import { advanceOperacion } from "@/lib/operacion/advance";

const result = await advanceOperacion({
  operacionId: "clxyz...",
  targetEstado: "ARRAS",
  manualData: {
    buyers: [{ fullName: "Juan", nationalId: "12345678A", fiscalAddress: "..." }],
    sellers: [{ fullName: "María", nationalId: "87654321B" }],
    totalPurchasePrice: 300000,
    arrasAmount: 30000,
    arrasPaymentAccount: { iban: "ES12..." },
    timelines: { maxDeedDateIso: "2026-12-31" },
  },
  comercialId: "com-001",
});

if (!result.ok && result.missingFields) {
  // Mostrar formulario con result.missingFields
}
```

### Cerrar una operación

```typescript
import { closeOperacion } from "@/lib/operacion/close";

const result = await closeOperacion({
  operacionId: "clxyz...",
  tipoCierre: "CERRADA_VENTA",
  demandId: "DEM-001",
  buyerClientId: "12345",
  comercialId: "com-001",
});
// Automáticamente: LeadStatus → CERRADO, Inmovilla → estadoficha=3, post-venta encolada
```

### Cancelar una operación

```typescript
import { cancelOperacion } from "@/lib/operacion/close";

const result = await cancelOperacion("clxyz...", "com-001");
// LeadStatus NO se modifica — el comercial decide
```
