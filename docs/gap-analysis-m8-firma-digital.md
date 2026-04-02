# Gap Analysis — M8 Smart Closing & Firma Digital

> **2026-04:** La firma electrónica es **in-house** (`docs/firma-digital.md`). Las filas que citan cliente/webhook de un SaaS de firma externo quedan como histórico de auditoría; el flujo actual cierra en `POST /api/firma/{token}/sign` y eventos Neon.

> Fecha: 2026-03-25 (actualizado 2026-03-27)  
> Alcance: Items identificados con brecha entre el plan (`docs/plan.md` días 13–15) y el código real del repositorio.  
> Referencia: branch `feat/M8-revision-por-voz-stt-versionado`  
> Actualización 2026-03-27: Tras análisis exhaustivo de la API REST de Inmovilla, se confirma que **no existe endpoint de gestión documental** (adjuntar PDFs/DOCXs). Se adopta almacenamiento local con tablas `LegalDocument` + `LegalDocumentParty` en Neon + Cloudinary/S3. Esta decisión resuelve simultáneamente los gaps #1, #3, #4, #5 y #9. Ver [ADR: Almacenamiento local de contratos](../analisis-contrato-local-schema.md).

---

## Índice

1. [Post-firma: FIRMA_COMPLETADA → descarga + almacenamiento + estado](#1-post-firma-firma_completada--descarga--almacenamiento--estado)
2. [CONTRATO_BORRADOR_GENERADO → notificación al gestor](#2-contrato_borrador_generado--notificación-al-gestor)
3. [UI legal con datos reales vs mock/fixtures](#3-ui-legal-con-datos-reales-vs-mockfixtures)
4. [Persistencia de aprobación (CONTRATO_APROBADO)](#4-persistencia-de-aprobación-contrato_aprobado)
5. [Modelo multi-firmante en Neon](#5-modelo-multi-firmante-en-neon)
6. [WhatsApp inicial con URL de firma tras envío](#6-whatsapp-inicial-con-url-de-firma-tras-envío)
7. [Job types definidos pero sin uso (enqueue + handler)](#7-job-types-definidos-pero-sin-uso-enqueue--handler)
8. [Cron / QStash: configuración de schedule](#8-cron--qstash-configuración-de-schedule)
9. [Versionado y diff: lib funcional, UI desconectada](#9-versionado-y-diff-lib-funcional-ui-desconectada)

---

## 1. Post-firma: FIRMA_COMPLETADA → descarga + almacenamiento + estado

### Qué dice el plan

> **Día 15, 11:00–13:00**: "Flujo post-firma: guardar documento firmado en Cloudinary/S3 → persistir URLs y metadatos en Neon (tabla `legal_documents`) → actualizar estado de la propiedad en Inmovilla vía Egestion Worker (`PUT /propiedades/` con `estadoficha`)."  
> *(Texto actualizado 2026-03-27 — la versión original decía "adjuntar en Inmovilla", lo cual no es posible; ver nota abajo.)*

> [!IMPORTANT]
> **Limitación confirmada de la API REST de Inmovilla**: No existe endpoint para adjuntar documentos (PDFs/DOCXs) a propiedades, clientes ni propietarios. El campo `fotos` de `/propiedades/` es exclusivo para URLs de imágenes (JPG). Por tanto, la egestión post-firma se limita a actualizar el `estadoficha` de la propiedad vía `PUT /propiedades/`. Los documentos legales se almacenan en **Cloudinary/S3 con metadatos en Neon** (tabla `LegalDocument`), siguiendo el mismo patrón que colaboradores externos y microsites.

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| Handler `FIRMA_COMPLETADA` en consumer | `lib/workers/consumer/firma-completada-handler.ts` | Procesa evento: asume PDF firmado y audit trail ya en Cloudinary (generados en firma in-house) |
| Cierre de firma (HTTP) | `app/api/firma/[token]/sign/route.ts` | Verifica OTP, integridad SHA-256, genera PDF sellado + audit trail, sube a Cloudinary, emite `FIRMA_COMPLETADA` |
| Campos `signedDocumentUrl` / `auditTrailUrl` en DB | `prisma/schema.prisma` (`SignatureRequest` / `LegalDocument`) | Rellenados al completar la firma in-house cuando aplica el flujo actual |
| Tabla `LegalDocument` / `LegalDocumentParty` | `prisma/schema.prisma` | **Pendiente de migración** — diseño aprobado, ver sección "Solución adoptada" |
| Egestión a Inmovilla tras firma | — | **Parcial**: el job `WRITE_TO_INMOVILLA` existe como tipo; la egestión se limita a `PUT /propiedades/` con `estadoficha` actualizado (no adjuntos) |

### Solución adoptada: `LegalDocument` + Cloudinary

El handler para `FIRMA_COMPLETADA` debe asumir que los PDFs ya se generaron y subieron en el cierre in-house, o bien:

1. Obtener URLs de **Cloudinary** desde el payload / `SignatureRequest`.
2. Opcionalmente revalidar persistencia en **Cloudinary** (o S3) para almacenamiento auditable.
3. Actualizar la tabla `LegalDocument` en Neon:
   - `status` → `SIGNED`
   - `signedDocumentUrl` → URL de Cloudinary del PDF firmado
   - `auditTrailUrl` → URL de Cloudinary del audit trail
   - `completedAt` → timestamp de la firma
4. Actualizar cada `LegalDocumentParty` que haya firmado: `hasSigned = true`, `signedAt = now()`.
5. Si **todas** las parties han firmado → encolar job `WRITE_TO_INMOVILLA` con payload `{ action: "UPDATE_PROPERTY_STATUS", propertyCode, newStatus }` para actualizar `estadoficha` vía `PUT /propiedades/`.
6. Opcionalmente: enviar WhatsApp de confirmación al comercial/gestor.

> [!NOTE]
> La egestión a Inmovilla **no incluye adjuntar el PDF firmado** porque la API no lo soporta. Solo se actualiza el campo `estadoficha` de la propiedad. El documento legal queda en Cloudinary/Neon accesible desde el micro-frontend `/legal/contratos/{id}`.

### Dependencias externas

- Credenciales del canal **SMS** para OTP (p. ej. variables `VONAGE_*`).
- Credenciales Cloudinary / S3 para upload.
- Token Inmovilla para `PUT /propiedades/` (ya existente).

---

## 2. CONTRATO_BORRADOR_GENERADO → notificación al gestor

### Qué dice el plan

> **Día 13, 18:00–20:00**: "Test: cambiar estado en Inmovilla → Ingestion detecta → extraer datos → generar borrador v1 → guardar en Cloudinary."
> Implícitamente: el gestor recibe un enlace al documento para revisarlo.

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| Job handler `GENERATE_CONTRACT_DRAFT` | `lib/workers/consumer/contract-draft-handler.ts` | **Funcional**: extrae datos, genera DOCX, sube a Cloudinary, emite `CONTRATO_BORRADOR_GENERADO` con `cloudinary.secureUrl` |
| Event handler `CONTRATO_BORRADOR_GENERADO` en consumer | `lib/workers/consumer/handlers.ts:102` | **Placeholder** |
| Notificación WhatsApp al gestor con enlace | — | **No existe** |
| Job `NOTIFY_CONTRACT_DATA_INCOMPLETE` | `prisma/schema.prisma:68` | Definido; handler en consumer es placeholder |

### Qué falta para producción

1. **Handler real para `CONTRATO_BORRADOR_GENERADO`** que:
   - Lea `cloudinary.secureUrl` y `operationId` del payload del evento.
   - Construya un enlace a la UI legal: `{NEXT_PUBLIC_APP_URL}/legal/contratos/{contractListId}`.
   - Envíe WhatsApp al gestor/comercial asignado con enlace al documento + enlace a la UI.
   - Opcionalmente: crear notificación in-app.

2. **Resolución de `contractListId`**: el pipeline usa `propertyCode` / `operationId`, pero la UI legal usa `contratos[].id` (mock). Este mapeo es el gap #3.

---

## 3. UI legal con datos reales vs mock/fixtures

### Qué dice el plan

> **Día 14, 15:00–17:00**: "Implementar micro-frontend de revisión de contratos: interfaz donde el gestor ve el borrador."
> Implícito: trabaja sobre la operación/propiedad real.

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| Listado de contratos | `app/legal/contratos/page.tsx:25` | Importa `contratos` de `lib/mock-data/contratos.ts` — **datos hardcoded en memoria** |
| Detalle de contrato | `app/legal/contratos/[id]/page.tsx:38–42` | Usa `getContractTemplateFixtureByListId()` de `lib/mock-data/contract-template-fixtures.ts` — **fixtures** |
| Contexto de versionado | `app/legal/contratos/[id]/page.tsx:407–413` | Se deriva del mock `contratos[]` si existe la fila |
| `cloudinary.secureUrl` en eventos | `contract-draft-handler.ts:132`, `voice-apply/route.ts:182` | Persisten URL en payload de `CONTRATO_BORRADOR_GENERADO` y `CONTRATO_VERSIONADO` — **no se leen desde la UI** |
| Proyección de contratos en Neon | — | **Resuelto con `LegalDocument`** — nueva tabla que materializa el estado actual de cada contrato |

### Solución adoptada: tabla `LegalDocument`

La tabla `LegalDocument` actúa como **proyección materializada** del stream de eventos contractuales, eliminando la necesidad de queries complejas sobre la tabla `events`. Esto sigue el mismo patrón que `PropertyCurrent` y `DemandCurrent`.

1. **Fuente de datos real para el listado legal**: query `prisma.legalDocument.findMany()` con filtros por `status`, `propertyCode`, `operationId`. La tabla se actualiza con cada evento contractual.

2. **Detalle de contrato desde Neon**: `prisma.legalDocument.findUnique({ include: { parties: true } })` devuelve toda la info: URLs de Cloudinary, `templateVersion`, `contractInput` (snapshot JSON), estado de firma por party.

3. **Eliminar dependencia de mocks**: reemplazar importaciones de `lib/mock-data/` con server components que lean de `LegalDocument`.

4. **Enlace bidireccional**: `LegalDocument.operationId` + `LegalDocument.id` resuelven el mapeo. El `contractListId` de la UI se corresponde con `LegalDocument.id`.

### Impacto

Este gap se resuelve simultáneamente con #1, #4, #5 y #9 gracias al modelo `LegalDocument` + `LegalDocumentParty`.

---

## 4. Persistencia de aprobación (CONTRATO_APROBADO)

### Qué dice el plan

> **Día 14, 15:00–17:00**: "…aprueba" (el gestor aprueba el borrador en la UI).
> Implícito: la aprobación es una decisión explícita con trazabilidad.

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| `approveDraft()` | `use-smart-closing-session.ts:271–275` | **Solo estado React** (`setApproved(true)`) |
| `sendToSignature()` | `use-smart-closing-session.ts:283–340` | Tras aprobación, envía a firma vía `POST /api/contracts/sign` — **persiste FIRMA_ENVIADA** pero no persiste la aprobación como tal |
| `EventType.CONTRATO_APROBADO` | — | **No existe** en `prisma/schema.prisma` |
| Auditoría de quién aprobó y cuándo | — | **No existe** |

### Solución adoptada: campos en `LegalDocument`

La tabla `LegalDocument` incluye los campos:
- `approvedAt DateTime?` — cuándo se aprobó
- `approvedByUserId String?` — quién aprobó

El flujo será:

1. **Nuevo `EventType`**: `CONTRATO_APROBADO` en el enum de Prisma.
2. **Persistir aprobación**: al hacer `approveDraft()`, llamar a un endpoint que:
   - Emita `appendEvent("CONTRATO_APROBADO")` con payload: `operationId`, `propertyCode`, `documentKind`, `templateVersion`, `actorUserId`, `docxSha256`, timestamp.
   - Actualice `LegalDocument.approvedAt` y `LegalDocument.approvedByUserId`.
   - Cambie `LegalDocument.status` de `DRAFT` a `APPROVED`.
3. La UI lee `LegalDocument.approvedAt` para determinar si el borrador está aprobado, eliminando la dependencia del estado React volátil.

### Riesgo si no se implementa

- No hay forma de saber quién aprobó qué versión del documento.
- Si se recarga la página, el estado `approved` se pierde (es volátil en React).

---

## 5. Modelo multi-firmante en Neon

### Qué dice el plan

> El plan habla de "**todas** las firmas requeridas" (SLA) y de recordatorios por firmante.

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| Schema `SignatureRequest` | `prisma/schema.prisma:448–480` | Campos `signerName`, `signerEmail`, `signerPhone` — **un solo firmante** |
| API `POST /api/contracts/sign` | `sign/route.ts` | `signers: z.array(SignerSchema).min(1)` — acepta array; la persistencia actual usa principalmente el primer firmante |
| Persistencia | `sign/route.ts:188–190` | Solo persiste `signers[0]` |
| Reminder scanner | `lib/signaturit/reminder-scanner.ts` | Opera sobre `SignatureRequest` (1 firmante) |

### Solución adoptada: `LegalDocumentParty`

Se adopta la **Opción A (tabla relacional)** con el nombre `LegalDocumentParty`, vinculada a `LegalDocument` en vez de a `SignatureRequest`. Esto unifica el tracking de firmantes con el ciclo de vida del contrato:

```prisma
model LegalDocumentParty {
  id                  String   @id @default(cuid())
  legalDocumentId     String
  legalDocument       LegalDocument @relation(fields: [legalDocumentId], references: [id])
  role                String        // BUYER, SELLER, SPOUSE, WITNESS, GUARANTOR
  fullName            String        // Snapshot al momento de la firma
  nifNie              String?       // Snapshot inmutable
  email               String?
  phone               String?
  address             String?       // Snapshot inmutable
  inmovilla_cod_cli   String?       // Referencia a Inmovilla (sin FK)
  hasSigned           Boolean  @default(false)
  signedAt            DateTime?
  reminderDay         Int      @default(0)
}
```

**Ventajas sobre las opciones anteriores:**
- El reminder scanner opera por party: `prisma.legalDocumentParty.findMany({ where: { hasSigned: false } })`.
- El SLA se cumple cuando **todas** las parties de un `LegalDocument` tengan `hasSigned = true`.
- Los datos del firmante (nombre, NIF, dirección) se guardan como **snapshot inmutable** al momento de asociar la party, garantizando integridad legal incluso si el contacto se edita en Inmovilla después.
- `inmovilla_cod_cli` permite trazabilidad con el CRM sin acoplamiento rígido.

### Impacto actual (si no se migra)

- Para contratos de arras (comprador + vendedor): solo se trackea al primer firmante.
- Los recordatorios solo llegan a un destinatario.
- El SLA se evalúa sobre una sola firma.

---

## 6. WhatsApp inicial con URL de firma tras envío

### Qué dice el plan

> **Día 15, 8:30–11:00**: El diagrama de flujo implica que tras enviar el documento a firma, se notifica al firmante con la URL.

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| `FIRMA_ENVIADA` en `sign/route.ts` | `sign/route.ts:197–215` | Emite evento con `signingUrl` en payload — **no envía WhatsApp** |
| Handler `FIRMA_ENVIADA` en consumer | `handlers.ts:106` | **Placeholder** |
| `sendSignatureReminderToSigner()` | `lib/whatsapp/send.ts:384–427` | Diseñado para recordatorios D+1/3/5 — reutilizable para el envío inicial |
| Plantilla Meta para envío inicial | — | **No existe** plantilla dedicada; las existentes son de recordatorio |

### Qué falta para producción

1. **Handler real para `FIRMA_ENVIADA`** (o lógica inline en `sign/route.ts`) que:
   - Lea `signerPhone` y `signingUrl` del `SignatureRequest` recién creado.
   - Envíe WhatsApp con la URL de firma al firmante.
   - Opcionalmente envíe WhatsApp informativo al comercial.

2. **Plantilla Meta** nueva (o reutilización de recordatorio D+0) para el primer contacto:
   - `contrato_firma_enviada` (categoría UTILITY, `es_ES`): nombre, tipo de documento, referencia, URL de firma.
   
3. **Función en `lib/whatsapp/send.ts`**: `sendSignatureInitialNotification()` (o reusar `sendSignatureReminderToSigner` con `reminderDay: 0`).

### Riesgo si no se implementa

- El firmante recibe la URL solo si alguien se la copia manualmente del panel UI, o espera hasta D+1 cuando llega el primer recordatorio automático.

---

## 7. Job types definidos pero sin uso (enqueue + handler)

### Qué existe

| JobType | Definido en | `enqueueJob` | Handler registrado |
|---------|-------------|--------------|-------------------|
| `SEND_SIGNATURE_REQUEST` | `prisma/schema.prisma:70` | **Ninguno** | **Ninguno** |
| `PROCESS_SIGNATURE_WEBHOOK` | `prisma/schema.prisma:71` | **Ninguno** | **Ninguno** |
| `NOTIFY_SIGNATURE_REMINDER` | `prisma/schema.prisma:72` | **Ninguno** | **Ninguno** |

### Análisis

El flujo actual usa HTTP directo (no cola de jobs) para:
- **Envío a firma**: `POST /api/contracts/sign` crea `SignatureRequest` y URL `/firma/{token}` sin SaaS de firma externo.
- **Cierre**: `POST /api/firma/{token}/sign` completa la firma y dispara la cadena de eventos.
- **Recordatorios**: cron `POST /api/cron/signature-reminders` ejecuta `scanAndSendSignatureReminders()` inline.

### Decisión requerida

**Opción A — Eliminar enums no usados**: simplifica el schema; si se necesitan en el futuro, se vuelven a crear con migración.

**Opción B — Migrar a jobs asíncronos**: útil si el envío a firma, la generación de PDFs o los recordatorios necesitan retries, backoff, y dead-letter queue. Requiere:
- `registerJobHandler("SEND_SIGNATURE_REQUEST", handleSendSignatureRequest)` en `job-handlers.ts`.
- Mover la lógica de `sign/route.ts` (desde descarga hasta persistencia) al handler.
- El endpoint solo encola y devuelve `{ jobId, status: "QUEUED" }`.

### Recomendación

Para MVP, mantener HTTP directo con los `maxDuration = 60` de Vercel. Marcar los enums como "reservados" en un comentario del schema. Migrar a jobs cuando se necesiten retries o el timeout sea insuficiente.

---

## 8. Cron / QStash: configuración de schedule

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| Endpoint cron recordatorios | `app/api/cron/signature-reminders/route.ts` | **Funcional**: protegido con `CRON_SECRET`, ejecuta `scanAndSendSignatureReminders()` |
| `vercel.json` con crons | — | **No existe** |
| `next.config.ts` con `experimental.cron` | — | **No configurado** |
| Configuración QStash | — | **No existe** en el repo (es setup externo) |

### Qué falta

1. **Definir el scheduler**: elegir entre:
   - **Vercel Cron** (Pro plan): agregar `vercel.json` con:
     ```json
     {
       "crons": [{
         "path": "/api/cron/signature-reminders",
         "schedule": "0 9 * * *"
       }]
     }
     ```
   - **Upstash QStash**: crear schedule vía dashboard/API apuntando a `{APP_URL}/api/cron/signature-reminders`, con autenticación según README (cabecera o query con el secreto de cron).
   - **GitHub Actions**: workflow con `schedule` trigger.

2. **Documentar** en `docs/firma-digital.md` o README cuál scheduler se usa y cómo configurarlo.

### Riesgo

Sin scheduler configurado, los recordatorios nunca se envían automáticamente. El endpoint existe pero nadie lo invoca.

---

## 9. Versionado y diff: lib funcional, UI desconectada

### Qué existe

| Pieza | Archivo | Estado |
|-------|---------|--------|
| Diff de payloads entre versiones | `lib/contracts/versioning/diff-payload.ts` | **Funcional** con tests |
| Schema del evento `CONTRATO_VERSIONADO` | `lib/contracts/versioning/contrato-versionado-payload.ts` | **Funcional** con Zod |
| API de diff | `app/api/contracts/diff/route.ts` | **Funcional**: acepta POST con dos inputs, devuelve `{ changes }` |
| Naming de versiones | `lib/contracts/naming.ts` | **Funcional** con tests |
| Uso en UI | — | **No conectado**: ningún componente en `app/legal/` o `components/legal/` llama a `/api/contracts/diff` ni muestra historial de versiones |

### Qué falta para producción

1. **Componente de historial de versiones** en la vista de detalle del contrato:
   - Listar versiones desde eventos `CONTRATO_VERSIONADO` en Neon.
   - Para cada par consecutivo, mostrar diff (llamando a `/api/contracts/diff`).

2. **Componente de diff visual**: resaltar campos cambiados, valores anteriores vs nuevos.

3. **Integración con el listado**: mostrar `templateVersion` actual y número de revisiones.

### Dependencia

Requiere resolver el gap #3 primero (datos reales vs mock) para tener eventos de versionado reales que consultar.

---

## Matriz de prioridad

> Actualizada 2026-03-27: La implementación de `LegalDocument` + `LegalDocumentParty` es el **paso 0** que desbloquea los gaps #1, #3, #4, #5 y #9 simultáneamente.

| # | Gap | Severidad | Bloqueante para demo | Esfuerzo estimado | Resuelto por |
|---|-----|-----------|---------------------|-------------------|--------------|
| **0** | **Migración Prisma: `LegalDocument` + `LegalDocumentParty`** | **Crítica** | **Sí** | **2–3h** | **Paso previo** |
| 1 | Post-firma (descarga + almacenamiento Cloudinary/Neon) | Alta | No (demo puede mostrar hasta envío) | 4–6h | `LegalDocument` (#0) |
| 2 | Notificación borrador generado | Media | No (UI se abre manualmente) | 1–2h | — |
| 3 | UI legal con datos reales | Alta | Sí para E2E real | 4–6h ↓ | `LegalDocument` (#0) |
| 4 | Persistencia de aprobación | Media | No (FIRMA_ENVIADA implica aprobación) | 1–2h | `LegalDocument.approvedAt` (#0) |
| 5 | Multi-firmante | Media | No para MVP single-signer | 2–3h ↓ | `LegalDocumentParty` (#0) |
| 6 | WhatsApp inicial con URL | Media-Alta | No para demo; sí para operación real | 1–2h | — |
| 7 | Job types sin uso | Baja | No | 0.5h (comentar) o 2h (implementar) | — |
| 8 | Cron schedule | Alta | Sí para recordatorios reales | 0.5h (config) | — |
| 9 | Diff en UI | Baja | No para flujo principal | 3–4h ↓ | `LegalDocument.contractInput` (#0) |

> [!TIP]
> Los esfuerzos de #3, #5 y #9 se reducen porque `LegalDocument` ya provee la estructura de datos. Solo falta conectar la UI.

### Ruta crítica para operación real

```
[0] Migración LegalDocument  →  [3] UI datos reales  →  [1] Post-firma  →  [6] WA inicial  →  [8] Cron
         ↓                              ↓
    [4] Aprobación              [5] Multi-firmante
```

### Ruta mínima para demo

```
[0] Migración LegalDocument  →  [8] Cron schedule  →  [6] WA inicial  →  [4] Persistencia aprobación
```

---

## Limitación confirmada: API REST de Inmovilla y documentos

> [!WARNING]
> Tras revisión exhaustiva de `docs/documentacion-api-rest-inmovilla.md` (2026-03-27), se confirma que la API REST de Inmovilla **no tiene endpoints de gestión documental**. No es posible adjuntar PDFs, DOCXs ni ningún tipo de archivo a propiedades, clientes o propietarios vía API. El campo `fotos` de `/propiedades/` es exclusivo para URLs de imágenes JPG.
>
> **Consecuencia**: Los documentos legales (contratos, audit trails) se almacenan en Cloudinary/S3 con metadatos en Neon (tabla `LegalDocument`). La egestión post-firma a Inmovilla se limita a actualizar el `estadoficha` de la propiedad vía `PUT /propiedades/`.
>
> Esta decisión se ha reflejado en `README.md` y `docs/plan.md`.

---

## Partes del plan días 13–14 que SÍ están construidas

| Funcionalidad | Estado |
|--------------|--------|
| Motor de plantillas DOCX (docx.js) | Funcional con tests |
| Extracción de datos Neon + Inmovilla | Funcional |
| Validación de campos obligatorios | Funcional (`DATOS_INCOMPLETOS`) |
| STT (Whisper endpoint) | Funcional |
| Intérprete de voz (LangGraph) | Funcional |
| Ciclo voz → cambio → regeneración DOCX | Funcional E2E |
| UI de revisión de contratos | Funcional (sobre fixtures) |
| Upload a Cloudinary | Funcional |
| Versionado naming + eventos | Funcional |
| Worker borrador (GENERATE_CONTRACT_DRAFT) | Funcional |
| Firma digital: envío y cierre in-house | Funcional |
| Firma digital: webhook SaaS externo | No aplica (sustituido por flujo propio) |
| Firma digital: recordatorios (lógica) | Funcional |
| Firma digital: desencadenante UI | Funcional (recién implementado) |

