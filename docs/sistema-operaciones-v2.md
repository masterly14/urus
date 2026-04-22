# Sistema de Operaciones v2 — Diseño e Hitos de Implementación

> **Fecha:** 21 de abril de 2026
> **Estado:** Diseño aprobado — pendiente de implementación
> **Módulos afectados:** M8 (Firma Digital), M9 (Post-Venta), M11 (Operaciones), M1 (Ingestion)

---

## 1. Contexto y Problema

### Situación actual

- En Inmovilla una propiedad solo tiene dos estados operativos reales: **Abierta** (publicada) y **Vendida** (cerrada). Los estados intermedios (Señalizada, Contrato Arras, Reservado, Pendiente de Firma) existen en el catálogo pero la agencia no los usa dentro de Inmovilla.
- El sistema Urus detecta cierres reactivamente vía polling de `estadoficha`, lo que significa que el comercial tiene que ir a Inmovilla a cambiar el estado manualmente para que Urus se entere.
- No existe UI para que el comercial gestione operaciones, avance etapas ni cierre deals desde Urus.
- `LeadStatus` y `OperacionEstado` coexisten sin sincronización formal ni roles claros.
- El handler `FIRMA_COMPLETADA` intenta escribir en Inmovilla con `UPDATE_PROPERTY_STATUS`, una operación que no existe en el registry — falla silenciosamente.

### Objetivo

Convertir Urus en el sistema donde el comercial gestiona el ciclo completo de una operación (desde la oferta hasta el cierre), con escritura automática en Inmovilla al cerrar. El comercial no necesita tocar Inmovilla para nada relacionado con el pipeline de venta.

---

## 2. Modelo de Datos

### 2.1 Enum `OperacionEstado` (modificado)

```
EN_CURSO → OFERTA_FIRME → RESERVA → ARRAS → PENDIENTE_FIRMA → CERRADA_VENTA / CERRADA_ALQUILER / CERRADA_TRASPASO / CANCELADA
```

**Cambio:** se agrega `OFERTA_FIRME` entre `EN_CURSO` y `RESERVA`.

| Valor | Significado | Documento asociado |
|---|---|---|
| `EN_CURSO` | Operación creada, sin avance contractual | Ninguno |
| `OFERTA_FIRME` | Comprador presenta oferta formal al vendedor | `oferta_firme` |
| `RESERVA` | Vendedor acepta; comprador entrega señal de compra | `senal_compra` |
| `ARRAS` | Contrato de arras firmado (vinculante, con penalizaciones) | `arras` |
| `PENDIENTE_FIRMA` | Pendiente de escritura pública en notaría | Ninguno (externo) |
| `CERRADA_VENTA` | Escritura firmada, propiedad transferida | Ninguno |
| `CERRADA_ALQUILER` | Contrato de alquiler formalizado | Ninguno |
| `CERRADA_TRASPASO` | Traspaso completado | Ninguno |
| `CANCELADA` | Operación cancelada en cualquier etapa | Ninguno |

### 2.2 Relación con `LeadStatus`

Ambos enums se mantienen. Cada uno cubre un ciclo de vida distinto:

| | `LeadStatus` (en `DemandCurrent`) | `OperacionEstado` (en `Operacion`) |
|---|---|---|
| **Entidad** | Demanda / comprador | Transacción sobre una propiedad |
| **Fase que cubre** | Pre-operación (búsqueda → visita) | Contractual y cierre |
| **Fuente** | Eventos internos de Urus | UI manual + ingesta de Inmovilla |
| **Puede existir sin el otro** | Sí (comprador sin deal) | Sí (operación sin demanda) |

### 2.3 Sincronización automática OperacionEstado → LeadStatus

Cuando `OperacionEstado` cambia y la operación tiene `demandId` asociada, `LeadStatus` se actualiza automáticamente:

| OperacionEstado pasa a... | LeadStatus se pone en... |
|---|---|
| `OFERTA_FIRME` | `EN_NEGOCIACION` |
| `RESERVA` | `EN_NEGOCIACION` |
| `ARRAS` | `EN_NEGOCIACION` |
| `PENDIENTE_FIRMA` | `EN_FIRMA` |
| `CERRADA_VENTA / ALQUILER / TRASPASO` | `CERRADO` |
| `CANCELADA` | Sin cambio automático (comercial decide) |

Si la operación no tiene `demandId`, no se toca `LeadStatus`.

---

## 3. Flujos de Negocio

### 3.1 Creación de operación

**Quién:** cualquier comercial, sobre propiedades que gestiona.
**Desde dónde:** página `/platform/operaciones`.
**Requisitos mínimos:** `propertyCode` (obligatorio).
**Opcionales al crear:** `demandId`, `buyerClientId`, `sellerClientId`.

La operación se crea en estado `EN_CURSO`. Si se asocia una demanda, `LeadStatus` no cambia hasta que la operación avance.

### 3.2 Avance de etapas (manual, con force)

El comercial puede avanzar una operación a **cualquier etapa posterior**, saltando intermedias. Las etapas saltadas quedan implícitamente cubiertas.

**Flujo al avanzar a una etapa con documento:**

```
Comercial selecciona nueva etapa (ej: ARRAS)
  │
  ▼
¿Existen datos completos para generar el documento?
  │
  ├── SÍ → Generar documento automáticamente (DRAFT)
  │         Actualizar OperacionEstado
  │         Sincronizar LeadStatus (si hay demandId)
  │         Emitir evento OPERACION_AVANZADA
  │
  └── NO → Mostrar formulario con datos faltantes
            Comercial completa los datos
            Generar documento + actualizar estado
```

**Datos que valida cada etapa:**

| Etapa | Datos requeridos del documento |
|---|---|
| `OFERTA_FIRME` | Datos agencia, comprador (nombre, DNI), propiedad (dirección, catastral), precio ofrecido, depósito, plazos |
| `RESERVA` | Datos agencia, comprador (nombre, DNI), propiedad, importe señal, precio ofrecido, plazos para arras y escritura |
| `ARRAS` | Compradores y vendedores (nombre, DNI, domicilio fiscal), propiedad (dirección, catastral, registro, finca, CRU), precio total, importe arras, IBAN, tipo arras, plazos escritura y llaves |

Si se salta de `EN_CURSO` a `ARRAS`, el sistema pide los datos que arras necesita. Los documentos de oferta firme y señal no se generan (las etapas se consideran cubiertas pero sin documento formal).

### 3.3 Cierre de operación

**Trigger:** el comercial marca la operación como `CERRADA_VENTA` (o ALQUILER/TRASPASO) desde la UI.

**Flujo completo:**

```
Comercial pulsa "Cerrar operación"
  │
  ▼
¿La operación tiene demandId (comprador asociado)?
  │
  ├── NO → Mostrar buscador de comprador:
  │         1. Buscar en demandas locales (activas)
  │         2. Si no hay → buscar contactos en Inmovilla REST
  │         3. Si encuentra → importar contacto, asociar demandId
  │         4. Permitir cerrar sin comprador (no ideal)
  │
  └── SÍ → Continuar
  │
  ▼
Confirmar datos de cierre (formulario mínimo si faltan)
  │
  ▼
En paralelo, el sistema ejecuta:
  │
  ├── 1. Actualizar Operacion.estado → CERRADA_VENTA + closedAt
  ├── 2. Sincronizar LeadStatus → CERRADO (si hay demandId)
  ├── 3. Emitir evento OPERACION_CERRADA
  ├── 4. Escribir en Inmovilla (REST):
  │      ├── safeUpdateProperty: estadoficha=3 (Vendida)
  │      ├── Asociar demanda con propiedad (vía ID contacto)
  │      └── Dar de baja la demanda en Inmovilla
  └── 5. Enqueue START_POSTVENTA_CADENCE
```

### 3.4 Generación automática de contratos

Cuando la operación avanza a una etapa que tiene documento asociado (`OFERTA_FIRME`, `RESERVA`, `ARRAS`), el sistema:

1. Verifica si ya existe un `LegalDocument` para esa operación y ese `documentKind`.
2. Si existe y está en estado `DRAFT` o superior → no regenera.
3. Si no existe → extrae datos de Neon + Inmovilla, valida contra el schema del template, genera DOCX, sube a Cloudinary, crea `LegalDocument` en estado `DRAFT`.
4. Si la extracción detecta datos faltantes → emite `DATOS_INCOMPLETOS`, muestra formulario al comercial.

### 3.5 Escritura en Inmovilla al cerrar

Se usa exclusivamente la **REST API** (`safeUpdateProperty`), no RPA.

| Acción | Endpoint / Método | Valor |
|---|---|---|
| Cambiar estado propiedad | `POST /propiedades/` con `ref` existente | `estadoficha=3` (Vendida) |
| Asociar demanda con venta | Por definir: vía ID contacto del comprador | Campo en propiedad o demanda |
| Dar de baja la demanda | Por definir: `keysitu` de la demanda | Valor a confirmar en Inmovilla |

### 3.6 Post-venta (integrada en Operaciones)

No tiene página propia. Se visualiza como una sección dentro de la ficha de operación en `/platform/operaciones`.

- Se envía al **comprador** (no al vendedor).
- Datos mínimos: teléfono del comprador + datos de la venta para personalizar mensajes.
- Cadencias definidas en `lib/postventa/start-cadence-handler.ts` (D0 agradecimiento, D10 reseña, etc.).

---

## 4. UI — Página de Operaciones

### Ruta: `/platform/operaciones`

**Vista principal:** pipeline tipo Kanban o lista filtrable con las operaciones del comercial.

**Columnas / filtros por estado:**

```
EN_CURSO | OFERTA_FIRME | RESERVA | ARRAS | PENDIENTE_FIRMA | CERRADAS | CANCELADA
```

**Tarjeta de operación muestra:**
- Código de operación (ej: `OP-2026-0042`)
- Dirección de la propiedad
- Nombre del comprador (si hay demanda asociada)
- Estado actual
- Días en estado actual
- Documentos generados (badges: borrador, aprobado, firmado)

**Acciones desde la tarjeta:**
- Avanzar etapa (con selector de etapa destino)
- Ver/editar datos de la operación
- Ver documentos generados
- Cerrar operación
- Cancelar operación

**Detalle de operación (panel lateral o página):**
- Datos del deal (propiedad, comprador, vendedor, comercial)
- Timeline de eventos/cambios de estado
- Documentos asociados (con acciones: ver, aprobar, enviar a firma)
- Post-venta (si está cerrada): estado de cada cadencia
- Notas internas, checklist, adjuntos (modelos existentes)

---

## 5. Hitos de Implementación

### Hito 0 — Schema y migración (fundamento)

**Alcance:**
- [ ] Agregar `OFERTA_FIRME` al enum `OperacionEstado` en Prisma
- [ ] Crear migración de Prisma
- [ ] Actualizar `mapEstadoFichaToOperacionEstado` en `lib/operacion/estado.ts` para mapear "ofertad" → `OFERTA_FIRME` (valor 18 de Inmovilla: "Ofertada")
- [ ] Actualizar `isEstadoCerrado` si es necesario
- [ ] Actualizar constantes en `pipeline-filter-options.ts` y `pipeline-read-model.ts`

**Criterio de done:** migración aplicada, build sin errores, tests existentes pasan.

---

### Hito 1 — API de Operaciones (CRUD + avance)

**Alcance:**
- [ ] `POST /api/operaciones` — crear operación manualmente
- [ ] `GET /api/operaciones` — listar (ya existe, extender filtros)
- [ ] `GET /api/operaciones/[id]` — detalle de una operación
- [ ] `PATCH /api/operaciones/[id]/avanzar` — avanzar etapa (con validación de datos)
- [ ] `PATCH /api/operaciones/[id]/cerrar` — cerrar operación (flujo completo)
- [ ] `PATCH /api/operaciones/[id]/cancelar` — cancelar operación
- [ ] Lógica de sincronización `OperacionEstado → LeadStatus`
- [ ] Emitir eventos: `OPERACION_CREADA`, `OPERACION_AVANZADA`, `OPERACION_CERRADA`
- [ ] Validación de datos faltantes por etapa (retornar lista de campos pendientes)

**Criterio de done:** APIs funcionales, eventos emitidos correctamente, LeadStatus sincronizado en tests.

---

### Hito 2 — Generación automática de contratos al avanzar

**Alcance:**
- [ ] Al avanzar a `OFERTA_FIRME` / `RESERVA` / `ARRAS`: verificar si existe LegalDocument para ese `documentKind`
- [ ] Si no existe: ejecutar extracción de datos + generación de borrador (reusar `contract-draft-handler` adaptado)
- [ ] Si faltan datos: retornar lista de datos faltantes (reusar `ContractIncompleteCategory`)
- [ ] Endpoint para ingresar datos faltantes y reintentar generación
- [ ] Mapeo etapa → `documentKind`: `OFERTA_FIRME` → `oferta_firme`, `RESERVA` → `senal_compra`, `ARRAS` → `arras`

**Criterio de done:** al avanzar etapa, si se necesita documento y hay datos, se genera automáticamente. Si faltan datos, se retorna error con campos faltantes.

---

### Hito 3 — Escritura en Inmovilla al cerrar

**Alcance:**
- [ ] Implementar job handler para actualizar `estadoficha=3` vía `safeUpdateProperty` (REST)
- [ ] Implementar asociación de demanda con propiedad vendida en Inmovilla (vía ID contacto)
- [ ] Implementar baja de la demanda en Inmovilla (definir valor `keysitu`)
- [ ] Registrar como `WriteOperation` o como job dedicado (decidir)
- [ ] Corregir `firma-completada-handler.ts` que hoy enqueue `UPDATE_PROPERTY_STATUS` inexistente
- [ ] Idempotencia: verificar que no se escriba dos veces

**Criterio de done:** al cerrar operación en Urus, Inmovilla refleja: propiedad vendida, demanda asociada, demanda dada de baja. Sin intervención del comercial en Inmovilla.

---

### Hito 4 — Resolución de comprador al cerrar

**Alcance:**
- [ ] API de búsqueda de demandas activas locales (filtro por comercial, texto libre)
- [ ] API de búsqueda de contactos en Inmovilla REST (cuando no hay match local)
- [ ] Flujo de importación de contacto: traer datos de Inmovilla → crear/vincular en Urus
- [ ] UI de selección de comprador integrada en el flujo de cierre
- [ ] Permitir cerrar sin comprador (con advertencia)

**Criterio de done:** al cerrar, el comercial puede buscar localmente o en Inmovilla y asociar comprador. Si cierra sin comprador, la operación se guarda pero con advertencia visible.

---

### Hito 5 — UI de Operaciones

**Alcance:**
- [ ] Página `/platform/operaciones` con vista de pipeline (lista/kanban)
- [ ] Tarjetas de operación con estado, propiedad, comprador, documentos
- [ ] Acciones: crear operación, avanzar etapa, cerrar, cancelar
- [ ] Formulario de datos faltantes (inline o modal)
- [ ] Buscador de comprador (local + Inmovilla)
- [ ] Panel de detalle: timeline, documentos, post-venta, notas
- [ ] Integrar sección de post-venta (cadencias, estado de envíos)

**Criterio de done:** comercial puede gestionar todo el ciclo de una operación desde la UI sin tocar Inmovilla.

---

### Hito 6 — Integración y hardening

**Alcance:**
- [ ] Conectar `smart-closing-handler` con el nuevo flujo (cuando Inmovilla cambia, sincronizar con operación existente)
- [ ] Test E2E: crear operación → avanzar → generar contrato → cerrar → verificar Inmovilla
- [ ] Manejar caso de doble operación sobre misma propiedad (Gap 9 de `gaps-produccion-v1.md`)
- [ ] Validar que post-venta arranca correctamente desde cierre manual
- [ ] Revisar y actualizar `operacion-cerrada.md`, `lead-status-pipeline.md`

**Criterio de done:** flujo completo funcional, sin gaps conocidos, documentación actualizada.

---

## 6. Orden de Ejecución Recomendado

```
Hito 0 (schema)
  │
  ▼
Hito 1 (API operaciones)
  │
  ├──────────────────┐
  ▼                  ▼
Hito 2 (contratos) Hito 3 (Inmovilla)
  │                  │
  ├──────────────────┘
  ▼
Hito 4 (resolución comprador)
  │
  ▼
Hito 5 (UI)
  │
  ▼
Hito 6 (integración)
```

Hitos 2 y 3 pueden ejecutarse en paralelo tras completar Hito 1. Hito 4 depende de Hito 3 (la búsqueda en Inmovilla es parte del flujo de cierre). Hito 5 depende de todos los anteriores para tener las APIs listas. Hito 6 es integración final.

---

## 7. Archivos Clave (referencia rápida)

| Archivo | Rol actual | Cambio esperado |
|---|---|---|
| `prisma/schema.prisma` | Enum `OperacionEstado` sin `OFERTA_FIRME` | Agregar `OFERTA_FIRME` |
| `lib/operacion/estado.ts` | Mapeo `estadoficha` → `OperacionEstado` | Agregar mapeo para "ofertad" |
| `lib/projections/update-lead-status.ts` | Actualiza `LeadStatus` | Agregar hook de sincronización desde `OperacionEstado` |
| `lib/workers/consumer/smart-closing-handler.ts` | Sincroniza estado desde Inmovilla | Integrar con nuevo flujo de avance manual |
| `lib/workers/consumer/firma-completada-handler.ts` | Enqueue `UPDATE_PROPERTY_STATUS` (roto) | Corregir para usar `safeUpdateProperty` REST |
| `lib/inmovilla/rest/safe-update.ts` | Update de propiedades vía REST | Usar para `estadoficha=3` al cerrar |
| `lib/workers/consumer/contract-draft-handler.ts` | Genera borrador de contrato | Adaptar para generación al avanzar etapa |
| `lib/contracts/extraction/arras-payload.ts` | Extrae datos para arras | Extender para señal y oferta firme |
| `app/api/operaciones/route.ts` | Solo GET | Agregar POST, PATCH |
| `app/platform/operaciones/` | No existe | Crear página completa |
| `lib/postventa/pipeline-read-model.ts` | Lee operaciones cerradas | Actualizar filtros con `OFERTA_FIRME` |

---

## 8. Decisiones Explícitas (registro)

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D1 | Mantener `LeadStatus` + `OperacionEstado` como enums separados | Unificar en uno solo | Cubren ciclos de vida distintos (comprador vs deal); unificar forzaría estados irrelevantes en una u otra entidad |
| D2 | Sincronización automática `OperacionEstado → LeadStatus` | Sincronización manual por el comercial | Reduce doble trabajo; el comercial solo gestiona `OperacionEstado` en la UI |
| D3 | Agregar `OFERTA_FIRME` al enum | Usar `EN_CURSO` para la fase de oferta | El documento de oferta en firme es un paso formal con datos propios; merece estado explícito |
| D4 | REST para escritura en Inmovilla (no RPA) | RPA vía Legacy/guardar.php | REST es más fiable, más rápido y no requiere 2FA/Playwright |
| D5 | Operación sin demanda permitida | Exigir siempre un comprador | Hay casos reales donde el comprador llega por fuera del sistema |
| D6 | Buscar comprador en Inmovilla si no está local | Solo permitir compradores locales | El comprador puede existir en Inmovilla sin haber generado demanda en Urus |
| D7 | Post-venta integrada en Operaciones | Página dedicada de Post-venta | Post-venta es una fase del ciclo de la operación, no un módulo independiente |
| D8 | Force de etapas con validación de datos | Exigir paso secuencial obligatorio | La realidad del negocio a veces salta etapas; el sistema se adapta pidiendo los datos que necesita |
