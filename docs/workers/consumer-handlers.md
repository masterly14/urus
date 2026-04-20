# Consumer Event Handlers — Referencia completa

Registro centralizado de todos los event handlers del consumer (`lib/workers/consumer/handlers.ts`). Cada evento procesado por el consumer llega aquí como un `PROCESS_EVENT` job; el consumer busca el handler correspondiente y ejecuta sus side effects.

## Arquitectura

```
Event Store (Neon)
  └─ appendEvent(TYPE) + enqueueJob(PROCESS_EVENT)

Consumer (cron o CLI):
  dequeue PROCESS_EVENT
  └─ getHandler(event.type)
       ├─ Handler real → side effects (DB, WhatsApp, follow-up jobs)
       └─ auditOnlyHandler → log + return success (sin side effects)
```

Archivo de registro: `lib/workers/consumer/handlers.ts`
Tipos: `lib/workers/consumer/types.ts` (`EventHandler`, `HandlerResult`)

---

## LeadStatus — Pipeline interno del lead

Varios handlers actualizan `DemandCurrent.leadStatus` como side effect al procesar su evento. Este campo representa el estado del lead en el pipeline comercial de Urus, **independientemente de Inmovilla** (ver [`docs/lead-status-pipeline.md`](../lead-status-pipeline.md)).

| Handler | Evento | `leadStatus` resultante |
|---------|--------|------------------------|
| `whatsapp-nlu-handler` | `WHATSAPP_RECIBIDO` | `CONTACTADO` (solo si era `NUEVO`) |
| `seleccion-comprador-handler` | `SELECCION_COMPRADOR` (ME_INTERESA) | `EN_SELECCION` |
| `visit-scheduling-event-handlers` | `VISITA_SOLICITADA` | `VISITA_PENDIENTE` |
| `visit-scheduling-event-handlers` | `VISITA_COMPRADOR_ACEPTO` | `VISITA_CONFIRMADA` |
| `visit-scheduling-event-handlers` | `VISITA_DATOS_RECOPILADOS` | `VISITA_REALIZADA` |
| `visit-scheduling-event-handlers` | `VISITA_ESCALADA_MANUAL` | `PERDIDO` |
| `visit-scheduling-event-handlers` | `VISITA_CANCELADA` | `EN_SELECCION` |
| `contrato-borrador-handler` | `CONTRATO_BORRADOR_GENERADO` | `EN_NEGOCIACION` |
| `firma-enviada-handler` | `FIRMA_ENVIADA` | `EN_FIRMA` |
| `firma-completada-handler` | `FIRMA_COMPLETADA` | `CERRADO` |
| `post-sale-handler` | `OPERACION_CERRADA` | `CERRADO` |

Helper: `lib/projections/update-lead-status.ts`

---

## Handlers con lógica real

### PROPIEDAD_CREADA — Smart Matching + Proyección

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/matching-handler.ts` |
| **Función** | `handlePropertyMatching` |
| **Módulo** | M5 (Smart Matching) |

Cruza la propiedad nueva con todas las demandas activas. Por cada match con score suficiente emite `MATCH_GENERADO` (vía `appendEvent`) y encola su procesamiento. También encola `UPDATE_PROPERTY_PROJECTION` y, si hay campos de pricing relevantes, `RUN_PRICING_ANALYSIS`.

**Side effects:** `appendEvent(MATCH_GENERADO)` por match, jobs `UPDATE_PROPERTY_PROJECTION`, `RUN_PRICING_ANALYSIS`, `PROCESS_EVENT` por cada match.

---

### PROPIEDAD_MODIFICADA — Proyección + Pricing

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/handlers.ts` (inline `propertyHandler`) |
| **Módulo** | M2/M3 (Proyecciones) + M7 (Pricing) |

Encola `UPDATE_PROPERTY_PROJECTION`. Si los campos modificados incluyen precio, metros, habitaciones o baños, también encola `RUN_PRICING_ANALYSIS`.

**Side effects:** jobs `UPDATE_PROPERTY_PROJECTION`, condicional `RUN_PRICING_ANALYSIS`.

---

### ESTADO_CAMBIADO — Smart Closing + Post-Venta

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/smart-closing-handler.ts` |
| **Función** | `handleEstadoCambiado` |
| **Módulo** | M8 (Smart Closing) + M9 (Post-Venta) |

Siempre encola `UPDATE_PROPERTY_PROJECTION`. Si el estado indica reserva/arras, encola `GENERATE_CONTRACT_DRAFT`. Si indica cierre de operación, emite `OPERACION_CERRADA` y encola `START_POSTVENTA_CADENCE`.

**Side effects:** `appendEvent(OPERACION_CERRADA)` si aplica, jobs `UPDATE_PROPERTY_PROJECTION`, `GENERATE_CONTRACT_DRAFT`, `START_POSTVENTA_CADENCE`.

---

### DEMANDA_CREADA / DEMANDA_MODIFICADA / DEMANDA_ESTADO_CAMBIADO — Proyección de demandas

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/handlers.ts` (inline `demandHandler`) |
| **Módulo** | M2/M3 (Proyecciones) |

Encola `UPDATE_DEMAND_PROJECTION` para mantener la vista materializada `demands_current`.

**Side effects:** job `UPDATE_DEMAND_PROJECTION`.

---

### LEAD_INGESTADO — Scoring + SLA + Routing

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/lead-scoring-handler.ts` |
| **Función** | `handleLeadIngestado` |
| **Módulo** | M1 (Ingesta) + M3 (Lead Management) + M10 (Dashboard) |

Calcula score del lead, asigna SLA, selecciona comercial por zona/carga, incrementa carga del agente y encola notificación. Actualiza facts del dashboard comercial (best-effort).

**Side effects:** `incrementAgentLoad`, `upsertCommercialLeadFactFromLeadIngestedEvent`, jobs `NOTIFY_LEAD_WHATSAPP`, `FOLLOW_UP_LEAD` (cadencias D+1, D+3, D+7).

Documentación detallada: [`docs/workers/lead-scoring-flow.md`](lead-scoring-flow.md).

---

### LEAD_CONTACTADO — Analytics Dashboard

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/lead-contacted-handler.ts` |
| **Función** | `handleLeadContactado` |
| **Módulo** | M10 (Dashboard Comercial) |

Registra el contacto en analytics del dashboard comercial.

**Side effects:** `upsertCommercialLeadFactFromLeadContactedEvent` (best-effort).

---

### WHATSAPP_RECIBIDO — NLU Contextual LangGraph

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/whatsapp-nlu-handler.ts` |
| **Función** | `handleWhatsAppRecibido` |
| **Módulo** | M5 (Smart Matching / NLU) |

Resuelve demanda/sesión del comprador, clasifica el mensaje con NLU (LangGraph), emite `SELECCION_COMPRADOR` y/o `DEMANDA_ACTUALIZADA` según la clasificación. Actualiza la sesión WhatsApp. Si el comprador pide más opciones, encola `GENERATE_MICROSITE`.

**Side effects:** `appendEvent`, `whatsAppBuyerSession.upsert`, jobs `PROCESS_EVENT`, condicional `GENERATE_MICROSITE`.

Documentación detallada: [`docs/microsite-feedback-loop.md`](../microsite-feedback-loop.md).

---

### DEMANDA_ACTUALIZADA — Egestión + Microsite

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/write-demand-update-handler.ts` |
| **Función** | `handleDemandaActualizada` |
| **Módulo** | M5 + M6 (Microsite) |

Lee snapshot de Inmovilla, construye parche de criterios y encola proyección + escritura a Inmovilla. Si el origen es feedback de microsite/WhatsApp, también encola regenerar microsite.

**Side effects:** jobs `UPDATE_DEMAND_PROJECTION`, `WRITE_TO_INMOVILLA` (updateDemandCriteria), condicional `GENERATE_MICROSITE`.

---

### VISITA_EVALUADA — Scoring + Statefox + Microsite

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/visita-evaluada-handler.ts` |
| **Función** | `handleVisitaEvaluada` |
| **Módulo** | M6 + M10 (Dashboard) |

Ajusta score según interés (alto +20, medio 0, bajo -15), consulta stock en Statefox API y, si hay stock suficiente + interés alto, encola `GENERATE_MICROSITE`. Actualiza fact de evaluación en dashboard.

**Side effects:** `upsertCommercialVisitEvaluationFactFromVisitaEvaluadaEvent`, condicional job `GENERATE_MICROSITE`.

---

### VISITA_AGENDADA — Analytics Dashboard

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/visita-agendada-handler.ts` |
| **Función** | `handleVisitaAgendada` |
| **Módulo** | M10 (Dashboard Comercial) |

Registra la visita agendada en el fact comercial para el dashboard.

**Side effects:** `upsertCommercialVisitFactFromVisitaAgendadaEvent`.

---

### SELECCION_COMPRADOR — Feedback Microsite

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/seleccion-comprador-handler.ts` |
| **Función** | `handleSeleccionComprador` |
| **Módulo** | M6 (Microsite) |

Upsert idempotente del feedback de selección del comprador en `MicrositeSelectionFeedback`.

**Side effects:** `micrositeSelectionFeedback.upsert`.

---

### MATCH_GENERADO — Notificación comprador + comercial

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/match-generado-handler.ts` |
| **Función** | `handleMatchGenerado` |
| **Módulo** | M5 (Smart Matching) |

Resuelve comprador, propiedad y comercial asignado. Encola notificación WhatsApp al comercial y envía WhatsApp al comprador con enlace a la propiedad.

**Side effects:** WhatsApp `sendMatchNotification` al comprador, job `NOTIFY_LEAD_WHATSAPP` al comercial.

---

### EVALUATE_DEMAND_COVERAGE — Enriquecimiento Statefox por baja cobertura

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/coverage-handler.ts` |
| **Función** | `handleEvaluateDemandCoverage` |
| **Módulo** | M5 (Smart Matching + Statefox) |

Evalúa si una demanda activa está bien cubierta por la cartera interna (cruza contra `properties_current`). Si `bestScore < COVERAGE_MIN_SCORE` (default 60, env `MATCHING_COVERAGE_MIN_SCORE`) y no hay un microsite de coverage reciente (dedup por cooldown de `MATCHING_COVERAGE_COOLDOWN_DAYS`, default 7), encola `GENERATE_MICROSITE` con `source=coverage_scan` y `notifyOnEmpty=false`.

**Disparadores:**
- `DEMANDA_CREADA`, `DEMANDA_MODIFICADA`, `DEMANDA_ESTADO_CAMBIADO` (via `demandHandler` en `handlers.ts`).
- `DEMANDA_ACTUALIZADA` (via `write-demand-update-handler.ts`).
- `PROPIEDAD_ELIMINADA` (re-evalúa demandas que tenían match con la propiedad eliminada).
- `ESTADO_CAMBIADO` cuando la propiedad deja de ser "Libre" (re-evalúa demandas afectadas).
- Cron diario `POST /api/cron/matching-coverage-scan` (barrido de todas las demandas activas).

**Side effects:** condicional job `GENERATE_MICROSITE` (source=coverage_scan). El microsite resultante pasa por la misma validación comercial que cualquier otro microsite.

---

### CONTRATO_BORRADOR_GENERADO — Notificación borrador listo

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/contrato-borrador-handler.ts` |
| **Función** | `handleContratoBorradorGenerado` |
| **Módulo** | M8 (Smart Closing) |

Notifica al gestor y al comercial de que el borrador de contrato está listo, incluyendo enlace al PDF en Cloudinary y al panel de gestión legal.

**Side effects:** WhatsApp `sendContractDraftReadyNotification`.

---

### CONTRATO_VERSIONADO — Actualizar documento + notificar

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/contrato-versionado-handler.ts` |
| **Función** | `handleContratoVersionado` |
| **Módulo** | M8 (Smart Closing) |

Actualiza `LegalDocument` con la nueva versión de plantilla y URL de Cloudinary. Si el documento estaba en estado APPROVED o SENT_TO_SIGNATURE, preserva ese estado; si no, vuelve a DRAFT. Notifica al gestor/comercial.

**Side effects:** `legalDocument.update`, WhatsApp `sendContractDraftReadyNotification`.

---

### CONTRATO_APROBADO — Iniciar flujo de firma server-side

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/contrato-aprobado-handler.ts` |
| **Función** | `handleContratoAprobado` |
| **Módulo** | M8 (Smart Closing / Firma Digital) |

Valida que el documento aprobado tiene parties con email y que la firma no se ha iniciado ya (idempotencia por `signatureRequestId`). Encola `SEND_SIGNATURE_REQUEST` con la lista de firmantes para que el job handler inicie el flujo de firma in-house de forma resiliente.

**Side effects:** job `SEND_SIGNATURE_REQUEST`.

---

### FIRMA_ENVIADA — WhatsApp URL de firma al firmante

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/firma-enviada-handler.ts` |
| **Función** | `handleFirmaEnviada` |
| **Módulo** | M8 (Firma Digital) |

Envía la URL de firma por WhatsApp a las parties con teléfono. Fallback al vendedor por defecto y aviso interno para management en plataforma.

**Side effects:** WhatsApp `sendSignatureInitialNotification`.

Documentación detallada: [`docs/firma-digital.md`](../firma-digital.md).

---

### FIRMA_COMPLETADA — Egestión Inmovilla + Confirmación

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/firma-completada-handler.ts` |
| **Función** | `handleFirmaCompletada` |
| **Módulo** | M8 (Firma Digital) |

Encola actualización de estado en Inmovilla (`estadoficha: vendido`), confirma por WhatsApp al vendedor y emite aviso interno para management.

**Side effects:** job `WRITE_TO_INMOVILLA` (UPDATE_PROPERTY_STATUS), WhatsApp `sendFirmaCompletadaConfirmation`.

---

### FIRMA_RECHAZADA — Alerta + Notificación al comercial

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/firma-rechazada-handler.ts` |
| **Función** | `handleFirmaRechazada` |
| **Módulo** | M8 (Firma Digital) + M10 (Dashboard) |

Se dispara cuando el firmante rechaza la firma vía `POST /api/firma/{token}/decline`. El endpoint ya actualiza `SignatureRequest → DECLINED` y `LegalDocument → DRAFT`. Este handler crea una `DashboardAlert` de severidad HIGH y notifica al comercial por WhatsApp con el motivo del rechazo.

**Side effects:** `dashboardAlert.create` (type FIRMA_DECLINED), WhatsApp `sendFirmaRechazadaNotification`.

**Emisor:** `POST /api/firma/{token}/decline` → `appendEvent(FIRMA_RECHAZADA)`.

---

### FIRMA_SLA_ESCALADO / FIRMA_EXPIRADA — Cierre administrativo por SLA

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/workers/consumer/firma-sla-escalado-handler.ts` |
| **Función** | `handleFirmaSlaEscalado` |
| **Módulo** | M8 (Firma Digital) + M10 (Dashboard) |

Handler unificado para ambos eventos. Marca `SignatureRequest → EXPIRED` y `LegalDocument → EXPIRED`, y crea `DashboardAlert` de severidad HIGH. El WhatsApp de escalado al comercial lo envía el `reminder-scanner.ts` antes de emitir el evento.

> `FIRMA_EXPIRADA` es un alias de `FIRMA_SLA_ESCALADO`; el evento canónico es `FIRMA_SLA_ESCALADO`.

**Side effects:** `signatureRequest.update`, `legalDocument.update`, `dashboardAlert.create` (type FIRMA_SLA_BREACH).

**Emisor:** `lib/signaturit/reminder-scanner.ts` → `appendEvent(FIRMA_SLA_ESCALADO)`.

---

### OPERACION_CERRADA — Cadencia Post-Venta

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/post-sale/post-sale-handler.ts` |
| **Función** | `handleOperacionCerrada` |
| **Módulo** | M9 (Post-Venta) + M10 (Dashboard) |

Valida payload y actualiza fact comercial de operación cerrada. Encola la cadencia completa post-venta con delays escalonados: agradecimiento (D+1), soporte (D+3), reseña (D+7), referidos (D+14), re-captación (D+30).

**Side effects:** `upsertCommercialOperationFactFromOperacionCerradaEvent`, múltiples jobs `SEND_POSTVENTA_MESSAGE` con `availableAt` diferidos.

---

## Handlers audit-only (no-op justificado)

Estos eventos ya tienen sus side effects ejecutados por el emisor (API route, scanner, job handler) antes de llegar al consumer. El handler solo loguea para trazabilidad.

| Evento | Emisor | Justificación |
|--------|--------|---------------|
| `SELECCION_VALIDADA` | `POST /api/validar-seleccion/[token]` | Ruta ya hace DB update + encola `SEND_MICROSITE_TO_BUYER` |
| `SELECCION_RECHAZADA` | `POST /api/validar-seleccion/[token]` | Ruta ya marca REJECTED en DB; no hay acción downstream |
| `DATOS_INCOMPLETOS` | `lib/contracts/extraction/emit-incomplete.ts` | Emisor ya encola `NOTIFY_CONTRACT_DATA_INCOMPLETE` |
| `FIRMA_RECORDATORIO_ENVIADO` | `lib/signaturit/reminder-scanner.ts` | Scanner ya envió WhatsApp + actualizó `lastReminderDay` |
| `INCIDENCIA_POSTVENTA_ABIERTA` | `POST /api/postventa/incidencia` + NLU handler | Ruta encola `NOTIFY_LEAD_WHATSAPP`; pausa de cadencia es declarativa vía `hasOpenIncidencia()` |
| `INCIDENCIA_POSTVENTA_RESUELTA` | `PATCH /api/postventa/incidencia` | Reanudación automática por cron scanner declarativo (`cadence-scanner`) |
| `LEAD_SCORED` | Nunca emitido | Scoring incrustado en `LEAD_INGESTADO`; tipo reservado en schema |
| `SLA_INICIADO` | Nunca emitido | SLA asignado inline en `lead-scoring-handler`; tipo reservado para métricas futuras |
| `WHATSAPP_ENVIADO` | Job handler `SEND_MICROSITE_TO_BUYER` | Trazabilidad; consumido como lectura por NLU para contexto conversacional |

---

## Mapa visual: evento → handler → side effects

```
PROPIEDAD_CREADA ─────── handlePropertyMatching ──── jobs: PROJECTION, PRICING, MATCH_GENERADO*
PROPIEDAD_MODIFICADA ─── propertyHandler ─────────── jobs: PROJECTION, condicional PRICING
ESTADO_CAMBIADO ──────── handleEstadoCambiado ────── jobs: PROJECTION, CONTRACT_DRAFT, POSTVENTA
DEMANDA_* ────────────── demandHandler ───────────── jobs: DEMAND_PROJECTION
LEAD_INGESTADO ──────── handleLeadIngestado ──────── jobs: NOTIFY_WA, FOLLOW_UP, DB: agent load
LEAD_CONTACTADO ──────── handleLeadContactado ────── DB: dashboard fact
WHATSAPP_RECIBIDO ────── handleWhatsAppRecibido ──── events: SELECCION/DEMANDA, jobs: MICROSITE
DEMANDA_ACTUALIZADA ──── handleDemandaActualizada ── jobs: PROJECTION, WRITE_INMOVILLA, MICROSITE
VISITA_EVALUADA ──────── handleVisitaEvaluada ────── API: Statefox, condicional job MICROSITE
VISITA_AGENDADA ──────── handleVisitaAgendada ────── DB: dashboard fact
SELECCION_COMPRADOR ──── handleSeleccionComprador ── DB: feedback upsert
MATCH_GENERADO ──────── handleMatchGenerado ──────── WA: comprador, job: NOTIFY comercial
CONTRATO_BORRADOR ────── handleBorradorGenerado ──── WA: gestor/comercial
CONTRATO_VERSIONADO ──── handleContratoVersionado ── DB: legalDoc update, WA: gestor/comercial
CONTRATO_APROBADO ────── handleContratoAprobado ──── job: SEND_SIGNATURE_REQUEST
FIRMA_ENVIADA ────────── handleFirmaEnviada ──────── WA: firmante (URL firma)
FIRMA_COMPLETADA ──────── handleFirmaCompletada ──── job: WRITE_INMOVILLA, WA: confirmación
FIRMA_RECHAZADA ──────── handleFirmaRechazada ────── DB: alert, WA: comercial
FIRMA_SLA_ESCALADO ───── handleFirmaSlaEscalado ──── DB: EXPIRED + alert
OPERACION_CERRADA ────── handleOperacionCerrada ──── jobs: cadencia postventa (5 etapas)
```

---

## Job Handlers relacionados

Los event handlers frecuentemente encolaen jobs que procesan otros módulos de `lib/workers/consumer/job-handlers.ts`:

| JobType | Qué hace |
|---------|----------|
| `UPDATE_PROPERTY_PROJECTION` | Actualiza vista materializada `properties_current` |
| `UPDATE_DEMAND_PROJECTION` | Actualiza vista materializada `demands_current` |
| `RUN_PRICING_ANALYSIS` | Ejecuta análisis de pricing IA para la propiedad |
| `NOTIFY_LEAD_WHATSAPP` | Envía WhatsApp al comercial con datos del lead |
| `FOLLOW_UP_LEAD` | Recordatorio cadencia D+1/D+3/D+7 si no hay LEAD_CONTACTADO |
| `WRITE_TO_INMOVILLA` | Egestión: escribe cambios en Inmovilla (API REST o RPA) |
| `GENERATE_CONTRACT_DRAFT` | Genera borrador de contrato (docx → Cloudinary) |
| `GENERATE_MICROSITE` | Genera/regenera microsite de selección para el comprador |
| `SEND_MICROSITE_TO_BUYER` | Envía enlace del microsite al comprador por WhatsApp |
| `SEND_SIGNATURE_REQUEST` | Inicia flujo de firma digital in-house (upload PDF, token, SignatureRequest) |
| `SEND_POSTVENTA_MESSAGE` | Envía mensaje de cadencia post-venta (agradecimiento, soporte, reseña, etc.) |
| `NOTIFY_CONTRACT_DATA_INCOMPLETE` | Notifica al comercial de datos faltantes para contrato |
| `EVALUATE_DEMAND_COVERAGE` | Evalúa si la cartera interna cubre una demanda; si bestScore < 60, encola `GENERATE_MICROSITE` con `source=coverage_scan` para buscar en Statefox |

---

## Rollout — EVALUATE_DEMAND_COVERAGE + cobertura Statefox

1. **Migración Prisma**: aplicar migración `add-evaluate-demand-coverage-and-microsite-source` (columna `source String?` + índice en `MicrositeSelection`, nuevo enum `EVALUATE_DEMAND_COVERAGE` en `JobType`).
2. **Deploy con cron desactivado**: desplegar sin registrar `POST /api/cron/matching-coverage-scan` en QStash. Los triggers por evento (DEMANDA_*, PROPIEDAD_ELIMINADA, ESTADO_CAMBIADO) ya estarán activos.
3. **Validación manual**: ejecutar `POST /api/cron/matching-coverage-scan` manualmente contra 1-5 demandas de prueba. Verificar en logs `[coverage]` que las decisiones sean correctas (`covered`, `dedup_skip`, `enqueued_microsite`). Verificar que las MicrositeSelection generadas tengan `source=coverage_scan`.
4. **Activar cron en QStash**: registrar el endpoint con cadencia diaria (`0 6 * * *`).
5. **Monitoreo 1 semana**: vigilar logs `[coverage]` y métricas. Verificar que el cooldown funciona (no se duplican microsites). Si es necesario, ajustar `MATCHING_COVERAGE_MIN_SCORE`, `MATCHING_COVERAGE_COOLDOWN_DAYS` o `MATCHING_COVERAGE_CRON_BATCH` via env vars sin re-deploy.
