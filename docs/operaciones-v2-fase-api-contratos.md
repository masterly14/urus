# Operaciones v2 — Fase API + Contratos Automáticos (implementada)

> **Fecha:** 21 de abril de 2026
> **Estado:** Implementada y testeada
> **Fase anterior:** `docs/operaciones-v2-fase-fundamentos.md`
> **Documento de diseño:** `docs/sistema-operaciones-v2.md` (Hitos 1 y 2)

---

## Qué se hizo

Se implementaron los endpoints REST que exponen la lógica de dominio de la Fase de Fundamentos, y el sistema de generación automática de contratos al avanzar una operación de etapa. Esta fase conecta las funciones `advanceOperacion`, `closeOperacion` y `cancelOperacion` con API routes consumibles por la futura UI, y extiende el motor de contratos M8 para soportar los 3 tipos de documento (`oferta_firme`, `senal_compra`, `arras`).

---

## 1. API de Operaciones (Hito 1)

### 1.1 Endpoints implementados

| Método | Ruta | Archivo | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/operaciones` | `app/api/operaciones/route.ts` | Listar operaciones con filtros avanzados |
| `POST` | `/api/operaciones` | `app/api/operaciones/route.ts` | Crear operación manualmente |
| `GET` | `/api/operaciones/:id` | `app/api/operaciones/[id]/route.ts` | Detalle con documentos, eventos, contadores |
| `PATCH` | `/api/operaciones/:id/avanzar` | `app/api/operaciones/[id]/avanzar/route.ts` | Avanzar etapa + generación automática de contrato |
| `PATCH` | `/api/operaciones/:id/cerrar` | `app/api/operaciones/[id]/cerrar/route.ts` | Cerrar operación (venta/alquiler/traspaso) |
| `PATCH` | `/api/operaciones/:id/cancelar` | `app/api/operaciones/[id]/cancelar/route.ts` | Cancelar operación |
| `POST` | `/api/operaciones/:id/completar-datos` | `app/api/operaciones/[id]/completar-datos/route.ts` | Reintentar generación de contrato con datos faltantes |

### 1.2 POST /api/operaciones — Crear operación

**Body (Zod):**

```typescript
{
  propertyCode: string;         // obligatorio
  demandId?: string;
  buyerClientId?: string;
  sellerClientId?: string;
  comercialId?: string;         // default: session.comercialId
  ciudad?: string;
}
```

**Comportamiento:**
- Genera código auto-incremental atómico (`OP-2026-0001`) vía `generarCodigoOperacion()` (upsert sobre tabla `operacion_sequences`)
- Verifica que no exista otra operación activa con el mismo `propertyCode` (409 si existe)
- Crea la operación en estado `EN_CURSO`
- Emite evento `OPERACION_CREADA`
- Retorna 201 con la operación creada

### 1.3 GET /api/operaciones — Listar (extendido)

**Query params:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `estado` | `OperacionEstado` | Filtrar por estado exacto |
| `search` | `string` | Buscar en `codigo` o `propertyCode` (case insensitive) |
| `comercialId` | `string` | Filtrar por comercial |
| `ciudad` | `string` | Buscar en ciudad (case insensitive, contains) |
| `closedAfter` | `ISO date` | Operaciones cerradas después de esta fecha |
| `closedBefore` | `ISO date` | Operaciones cerradas antes de esta fecha |
| `limit` | `number` | Máximo de resultados (default 50, max 200) |
| `offset` | `number` | Desplazamiento para paginación |
| `orderBy` | `string` | Campo de orden: `createdAt`, `updatedAt`, `closedAt`, `codigo`, `estado` |
| `orderDir` | `asc \| desc` | Dirección de orden (default `desc`) |

**Response:** `{ operaciones: [...], total: number }`

Cada operación incluye: `id`, `codigo`, `propertyCode`, `estado`, `ciudad`, `comercialId`, `demandId`, `buyerClientId`, `closedAt`, `createdAt`, `updatedAt`, `_count.asignaciones`.

### 1.4 GET /api/operaciones/:id — Detalle

Retorna la operación con:
- `asignaciones` (id, colaboradorId, estado, notas, createdAt)
- `_count` (notas, checklistItems, adjuntos)
- `documentos`: todos los `LegalDocument` vinculados por `operationId = operacion.codigo`
- `eventos`: últimos 50 eventos del Event Store para la propiedad (`aggregateType: "OPERACION"`)

### 1.5 PATCH /api/operaciones/:id/avanzar

**Body:**

```typescript
{
  targetEstado: "EN_CURSO" | "OFERTA_FIRME" | "RESERVA" | "ARRAS" | "PENDIENTE_FIRMA";
  manualData?: Record<string, unknown>;
}
```

**Flujo:**

```
Request → Zod validation → advanceOperacion()
  │
  ├── Si faltan datos → 422 { missingFields, documentKind }
  │
  ├── Si error de validación → 400 { error }
  │
  └── Si OK:
        ├── ¿La etapa tiene documentKind? (OFERTA_FIRME, RESERVA, ARRAS)
        │     ├── ¿Ya existe LegalDocument? → No regenerar
        │     └── ¿No existe? → enqueueJob(GENERATE_CONTRACT_DRAFT)
        │
        └── 200 { operacion, documentKind }
```

El `GENERATE_CONTRACT_DRAFT` se encola con idempotency key `contract_draft:{operacionId}:{documentKind}` para evitar duplicados.

### 1.6 PATCH /api/operaciones/:id/cerrar

**Body:**

```typescript
{
  tipoCierre: "CERRADA_VENTA" | "CERRADA_ALQUILER" | "CERRADA_TRASPASO";
  demandId?: string;
  buyerClientId?: string;
}
```

Delega a `closeOperacion()`, que internamente: actualiza estado + closedAt, emite `OPERACION_CERRADA`, sincroniza LeadStatus, encola `UPDATE_PROPERTY_STATUS_INMOVILLA` y `START_POSTVENTA_CADENCE`.

### 1.7 PATCH /api/operaciones/:id/cancelar

Sin body. Delega a `cancelOperacion()`. No sincroniza LeadStatus (el comercial decide).

### 1.8 POST /api/operaciones/:id/completar-datos

**Body:**

```typescript
{
  documentKind: "oferta_firme" | "senal_compra" | "arras";
  data: Record<string, unknown>;
}
```

Para cuando la generación automática falló por datos incompletos. Valida que el `documentKind` corresponde al estado actual de la operación. Re-encola `GENERATE_CONTRACT_DRAFT` con los datos actualizados y una idempotency key que incluye timestamp para permitir reintentos.

### 1.9 Seguridad (aplicada a todos los endpoints)

- `getSessionFromRequest(request)` + `unauthorized()` si no hay sesión
- `withObservedRoute(...)` wrapper en todos los handlers
- Validación Zod del body con error 400 + `fieldErrors`
- Verificación de existencia y estado no-terminal antes de mutar

---

## 2. Generación automática de contratos (Hito 2)

### 2.1 Problema resuelto

El `contract-draft-handler.ts` original estaba acoplado a arras: hardcodeaba `documentKind: "arras"`, pasaba `totalPurchasePriceAmount: 0`, y solo usaba `buildArrasContractTemplateInputFromNeonAndInmovilla`. No soportaba los otros 2 tipos de documento ni datos manuales del comercial.

### 2.2 Arquitectura de extracción refactorizada

```
lib/contracts/extraction/
  ├── shared.ts                    ← Helpers compartidos (NUEVO)
  ├── arras-payload.ts             ← Extractor arras (existente, sin cambios)
  ├── oferta-firme-payload.ts      ← Extractor oferta firme (NUEVO)
  ├── senal-compra-payload.ts      ← Extractor señal de compra (NUEVO)
  ├── build-contract-input.ts      ← Dispatcher por documentKind (NUEVO)
  ├── emit-incomplete.ts           ← Emisión DATOS_INCOMPLETOS (ajustado)
  └── index.ts                     ← Barrel actualizado
```

### 2.3 `lib/contracts/extraction/shared.ts` — Helpers compartidos

Funciones extraídas de `arras-payload.ts` para reutilización:

| Función | Descripción |
|---------|-------------|
| `cleanString(value)` | Trim seguro para cualquier tipo |
| `cleanNumber(value)` | Parse numérico con normalización de coma decimal |
| `pickFirstString(record, keys)` | Primer valor no vacío en un record |
| `pickClientCode(record, keys)` | Extraer código de cliente (numérico) de un record |
| `toMoney(amount, literal?)` | Construir `MoneyEUR` con literal auto-generado |
| `buildStreetLine(input)` | Componer dirección desde componentes |
| `mapClientToPerson(client, fallbackName, fallbackCity)` | `Cliente` Inmovilla → `NaturalPerson` |
| `resolvePropertyData(inmovilla, neon, overrides?)` | Construir `PropertyRegistryData` desde múltiples fuentes |
| `appendIssue(issues, kind, path, message)` | Agregar issue tipado |
| `buildIncompleteValidationSignal(kind, ...)` | Construir señal completa de datos incompletos |
| `createDefaultExtractionDeps(token?)` | Factory de deps con Prisma + Inmovilla REST |
| `toMissingCategory(fieldPath)` | Clasificar campo faltante en categoría (dni/domicilio/precio/plazos) |

Tipos compartidos: `ExtractionDeps`, `ExtractionSources`, `ContractIncompleteValidationSignal`, `NeonDemandSource`, `NeonPropertySource`.

Constantes compartidas: `BUYER_CLIENT_ID_KEYS`, `SELLER_CLIENT_ID_KEYS`, `CADASTRAL_KEYS`.

### 2.4 `lib/contracts/extraction/oferta-firme-payload.ts`

Extractor para `OfertaFirmeContractPayload`. Extrae:
- **Comprador** (offerer): desde Inmovilla vía `mapClientToPerson`
- **Propiedad**: desde Inmovilla + Neon vía `resolvePropertyData`
- **Precios** (listingPrice, offeredPrice, offerDeposit, arrasAmountAfterAcceptance): desde `manualData`
- **Agency**: desde `manualData.agency` (datos de la agencia intermediaria)
- **Timelines**: desde `manualData` con defaults (3 días validez oferta, 15 días para arras, 90 días escritura)
- **Fees**: desde `manualData.fees` (fixed_net o percent_of_final_price)

### 2.5 `lib/contracts/extraction/senal-compra-payload.ts`

Extractor para `SenalCompraContractPayload`. Similar a oferta firme pero con:
- **purchaser** (singular, no array)
- **property** reducida (solo `addressLine`, `municipality`, `cadastralReference`)
- **senalAmount** y **offeredPrice** desde `manualData`
- **Timelines**: businessDaysToArrasContract (default 10), maxDaysEscritura (default 90), convocatoriaNotary (default 7)

### 2.6 `lib/contracts/extraction/build-contract-input.ts` — Dispatcher

```typescript
async function buildContractTemplateInput(params): Promise<BuildContractInputResult>
```

Recibe `documentKind` y delega al extractor correspondiente:

| `documentKind` | Extractor |
|-----------------|-----------|
| `oferta_firme` | `buildOfertaFirmeFromNeonAndInmovilla` |
| `senal_compra` | `buildSenalCompraFromNeonAndInmovilla` |
| `arras` | `buildArrasContractTemplateInputFromNeonAndInmovilla` (legacy, adapta `manualData` → `ArrasOperationData`) |
| otro | Error con issue explicativo |

Para arras, el dispatcher adapta `manualData` al formato `ArrasOperationData` que espera el extractor legacy:
- `manualData.totalPurchasePrice` → `operation.totalPurchasePriceAmount`
- `manualData.arrasAmount` → `operation.arrasAmountAmount`
- `manualData.arrasPaymentAccount` → `operation.arrasPaymentAccount`
- etc.

### 2.7 `lib/workers/consumer/contract-draft-handler.ts` — Actualizado

Cambios respecto a la versión anterior:

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| `documentKind` | Hardcodeado `"arras"` | Leído del payload, default `"arras"` |
| Extractor | Solo `buildArrasContractTemplateInputFromNeonAndInmovilla` | `buildContractTemplateInput` (dispatcher) |
| `manualData` | No soportado | Leído del payload, pasado al extractor |
| `totalPurchasePriceAmount` | Hardcodeado `0` | Desde `manualData` |
| Upsert `LegalDocument` | `documentKind: "arras"` fijo | `documentKind` dinámico |
| Tags Cloudinary | `["draft", "v1", "arras"]` | `["draft", "v1", documentKind]` |
| Logs | Prefijo `[smart-closing]` | Prefijo `[contract-draft]` |

Backward compatible: jobs legacy encolados sin `documentKind` siguen funcionando (default a `"arras"`).

### 2.8 `lib/contracts/extraction/emit-incomplete.ts` — Ajustado

Import de `ContractIncompleteValidationSignal` cambiado de `arras-payload.ts` a `shared.ts` para aceptar cualquier `documentKind` (no solo `"arras"`).

---

## 3. Archivos creados

| Archivo | Líneas | Propósito |
|---------|--------|-----------|
| `app/api/operaciones/[id]/route.ts` | 82 | GET detalle de operación |
| `app/api/operaciones/[id]/avanzar/route.ts` | 96 | PATCH avanzar etapa |
| `app/api/operaciones/[id]/cerrar/route.ts` | 52 | PATCH cerrar operación |
| `app/api/operaciones/[id]/cancelar/route.ts` | 28 | PATCH cancelar operación |
| `app/api/operaciones/[id]/completar-datos/route.ts` | 84 | POST reintentar generación contrato |
| `lib/contracts/extraction/shared.ts` | ~300 | Helpers compartidos de extracción |
| `lib/contracts/extraction/oferta-firme-payload.ts` | ~170 | Extractor oferta en firme |
| `lib/contracts/extraction/senal-compra-payload.ts` | ~170 | Extractor señal de compra |
| `lib/contracts/extraction/build-contract-input.ts` | ~160 | Dispatcher de extracción |

## 4. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/api/operaciones/route.ts` | Agregado POST + filtros avanzados en GET (comercialId, ciudad, fechas, paginación, orderBy) |
| `lib/workers/consumer/contract-draft-handler.ts` | Soporta 3 documentKind + manualData vía dispatcher |
| `lib/contracts/extraction/index.ts` | Barrel extendido con nuevos exports |
| `lib/contracts/extraction/emit-incomplete.ts` | Import de `ContractIncompleteValidationSignal` desde `shared.ts` |
| `lib/contracts/extraction/__tests__/emit-incomplete.test.ts` | Import ajustado |

---

## 5. Tests

**125 tests en 9 suites**, todos pasando:

| Suite | Tests | Qué cubre |
|-------|-------|-----------|
| `shared.test.ts` | 30 | Utilidades compartidas: cleanString, cleanNumber, pickFirstString, pickClientCode, toMoney, buildStreetLine, mapClientToPerson, asRecord, toMissingCategory, buildIncompleteValidationSignal |
| `build-contract-input.test.ts` | 15 | Dispatcher por documentKind, extracción oferta_firme, extracción senal_compra, manejo de errores, tracking de sources |
| `stages.test.ts` | 22 | (pre-existente) Orden, stageIndex, isAdvance, skippedStages, isTerminal, documentKindForStage |
| `estado.test.ts` | 18 | (pre-existente) Mapeo estadoficha, OFERTA_FIRME, isEstadoCerrado deprecated |
| `sync-lead-status.test.ts` | 13 | (pre-existente) Sincronización OperacionEstado → LeadStatus |
| `stage-requirements.test.ts` | 15 | (pre-existente) Requisitos por etapa, validación, deduplicación |
| `resolve-demand.test.ts` | 6 | (pre-existente) Resolución heurística de demanda |
| `emit-incomplete.test.ts` | 2 | (pre-existente, import ajustado) Emisión de DATOS_INCOMPLETOS |
| `arras-payload.test.ts` | 4 | (pre-existente) Extracción arras desde Neon + Inmovilla |

---

## 6. Diagrama de dependencias

```
app/api/operaciones/
  ├── route.ts (GET + POST)
  │     ├── (usa) lib/operacion/codigo.ts
  │     ├── (usa) lib/operacion/stages.ts
  │     └── (usa) lib/event-store (appendEvent)
  │
  ├── [id]/route.ts (GET detalle)
  │     └── (carga) prisma.legalDocument, prisma.event
  │
  ├── [id]/avanzar/route.ts (PATCH)
  │     ├── (usa) lib/operacion/advance.ts
  │     ├── (carga) prisma.legalDocument (verificar existencia)
  │     └── (encola) GENERATE_CONTRACT_DRAFT
  │
  ├── [id]/cerrar/route.ts (PATCH)
  │     └── (usa) lib/operacion/close.ts
  │
  ├── [id]/cancelar/route.ts (PATCH)
  │     └── (usa) lib/operacion/close.ts
  │
  └── [id]/completar-datos/route.ts (POST)
        ├── (usa) lib/operacion/stages.ts (documentKindForStage)
        └── (encola) GENERATE_CONTRACT_DRAFT

lib/workers/consumer/contract-draft-handler.ts
  └── (usa) lib/contracts/extraction/build-contract-input.ts
        ├── oferta-firme-payload.ts → shared.ts
        ├── senal-compra-payload.ts → shared.ts
        └── arras-payload.ts (legacy, sin cambios)
```

---

## 7. Uso desde la UI (referencia para la fase de UI)

### Crear operación

```typescript
const res = await fetch("/api/operaciones", {
  method: "POST",
  body: JSON.stringify({ propertyCode: "REF-1001", ciudad: "Madrid" }),
});
const { operacion } = await res.json(); // operacion.codigo = "OP-2026-0042"
```

### Avanzar a OFERTA_FIRME con datos del formulario

```typescript
const res = await fetch(`/api/operaciones/${id}/avanzar`, {
  method: "PATCH",
  body: JSON.stringify({
    targetEstado: "OFERTA_FIRME",
    manualData: {
      offeredPrice: 250000,
      listingPrice: 280000,
      offerDeposit: 5000,
    },
  }),
});

if (res.status === 422) {
  const { missingFields, documentKind } = await res.json();
  // missingFields: [{ field, label, source }] → mostrar formulario
}

if (res.ok) {
  const { operacion, documentKind } = await res.json();
  // documentKind = "oferta_firme" → contrato encolado para generación
}
```

### Completar datos faltantes (retry)

```typescript
await fetch(`/api/operaciones/${id}/completar-datos`, {
  method: "POST",
  body: JSON.stringify({
    documentKind: "oferta_firme",
    data: { offeredPrice: 250000, offerDeposit: 5000 },
  }),
});
```

### Cerrar operación

```typescript
await fetch(`/api/operaciones/${id}/cerrar`, {
  method: "PATCH",
  body: JSON.stringify({
    tipoCierre: "CERRADA_VENTA",
    demandId: "DEM-001",
    buyerClientId: "12345",
  }),
});
```

### Cancelar operación

```typescript
await fetch(`/api/operaciones/${id}/cancelar`, { method: "PATCH" });
```

---

## 8. Qué queda pendiente (fases siguientes)

Los Hitos 1 y 2 del diseño están completos. Las fases siguientes, documentadas en `docs/sistema-operaciones-v2.md`, son:

1. **Escritura en Inmovilla al cerrar** (Hito 3) — asociación demanda-propiedad y baja de demanda vía REST
2. **Resolución de comprador** (Hito 4) — buscador local + Inmovilla REST para asociar comprador al cerrar
3. **UI de Operaciones** (Hito 5) — página `/platform/operaciones` con pipeline, avance manual y post-venta integrada
4. **Integración y hardening** (Hito 6) — tests E2E, manejo de doble operación, documentación actualizada
