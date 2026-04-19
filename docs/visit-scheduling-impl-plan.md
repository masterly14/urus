# Plan de Implementación — Sistema de Agendamiento de Visitas

> **Duración:** 1 día (11.5 horas: 8:30–20:00)
> **Referencia de diseño:** `docs/visit-scheduling-system.md`
> **Horario:** Lunes a Sábado · 8:30 AM – 8:00 PM (Europe/Madrid)

---

## Inventario: Lo que ya existe

| Componente | Estado | Ruta |
|---|---|---|
| Event Store (`appendEvent`, `getEventsByAggregate`) | ✅ Completo | `lib/event-store/` |
| Job Queue (`enqueueJob`, `dequeueJob`, retry, DLQ) | ✅ Completo | `lib/job-queue/` |
| WhatsApp Client (envío text, template, interactive) | ✅ Completo | `lib/whatsapp/` |
| WhatsApp Webhook (parse, verify) | ✅ Completo | `lib/whatsapp/webhook.ts` |
| NLU WhatsApp Handler (`handleWhatsAppRecibido`) | ✅ Completo | `lib/workers/consumer/whatsapp-nlu-handler.ts` |
| NLU Graph (`classifyBuyerFeedback`) | ✅ Completo | `lib/agents/nlu-graph.ts` |
| Composio — create calendar event (single tenant) | ✅ Existe (rehacer multi-tenant) | `lib/composio/create-calendar-event.ts` |
| Composio — get 2FA code | ✅ Completo (no se toca) | `lib/composio/get-inmovilla-2fa-code.ts` |
| Consumer handlers registry | ✅ Completo | `lib/workers/consumer/handlers.ts` |
| Job handlers registry | ✅ Completo | `lib/workers/consumer/job-handlers.ts` |
| Handler `VISITA_AGENDADA` (analytics fact) | ✅ Completo | `lib/workers/consumer/visita-agendada-handler.ts` |
| Handler `VISITA_EVALUADA` (scoring + Statefox) | ✅ Completo | `lib/workers/consumer/visita-evaluada-handler.ts` |
| Modelo `Comercial` en Prisma | ✅ Existe (ampliar) | `prisma/schema.prisma` |
| Micro-frontend post-visita | ✅ Completo (se mantiene) | `app/platform/post-visita/` |
| Micro-frontend agenda (fallback manual) | ✅ Completo (se mantiene) | `app/platform/agenda/` |
| API `POST /api/agenda` | ✅ Completo (se mantiene como fallback) | `app/api/agenda/route.ts` |
| API `POST /api/post-visit` | ✅ Completo (no cambia) | `app/api/post-visit/route.ts` |
| `WhatsAppBuyerSession` | ✅ Completo | Prisma + NLU handler |
| `sendInteractiveMessage` (reply buttons) | ✅ Completo | `lib/whatsapp/send.ts` |
| `sendTemplateMessage` | ✅ Completo | `lib/whatsapp/send.ts` |

---

## Lo que se debe construir

| # | Componente | Dependencia |
|---|---|---|
| 1 | Schema Prisma: enums + 3 modelos nuevos + ampliación `Comercial` | — |
| 2 | Constantes y tipos del módulo visitas | Schema |
| 3 | Composio Calendar API directa (free/busy, create, cancel) multi-tenant | Schema (ConnectionId) |
| 4 | Motor de disponibilidad: generación de slots + reglas de negocio | Constantes + Composio |
| 5 | Lock Manager: crear, liberar, consultar soft-locks | Schema |
| 6 | Session Manager: CRUD + transiciones de estado | Schema + Lock Manager |
| 7 | Confirmación atómica (transacción Prisma) | Session + Lock + PropertyVisitSlot |
| 8 | Funciones WhatsApp de visita (templates + interactive) | WhatsApp existente |
| 9 | Grafo LangGraph de agendamiento de visitas | Composio + Disponibilidad + Session + WhatsApp |
| 10 | NLU: clasificación de intención QUIERE_VISITAR + routing | NLU Graph existente |
| 11 | Consumer handlers: nuevos eventos de visita | Session Manager + WhatsApp |
| 12 | Job handlers: timeouts, calendar events, cleanup | Session + Composio + Locks |
| 13 | Integración en NLU handler (routing visitas) | Todo lo anterior |
| 14 | API routes Composio onboarding (connect + callback) | Composio multi-tenant |
| 15 | Tests de integración del flujo completo | Todo |

---

## Plan Hora por Hora

### Bloque 1 — 8:30 a 10:00 · Cimientos: Schema + Migración + Tipos

**Objetivo:** Tener la base de datos lista y los tipos TypeScript del módulo.

#### 8:30–9:15 — Schema Prisma

Modificar `prisma/schema.prisma`:

1. **Nuevo enum `VisitSessionState`** (16 estados del state machine).

2. **Nuevos EventTypes** al enum existente:
   ```
   VISITA_SOLICITADA, VISITA_SLOTS_PROPUESTOS, VISITA_SLOT_SELECCIONADO,
   VISITA_PROPUESTA_ENVIADA, VISITA_COMPRADOR_ACEPTO, VISITA_COMPRADOR_RECHAZO,
   VISITA_DATOS_RECOPILADOS, VISITA_ESCALADA_MANUAL, VISITA_CANCELADA,
   VISITA_REPROGRAMADA
   ```

3. **Nuevos JobTypes** al enum existente:
   ```
   VISIT_FETCH_SLOTS, VISIT_PROPOSE_TO_COMMERCIAL, VISIT_PROPOSE_TO_BUYER,
   VISIT_CHECK_COMMERCIAL_TIMEOUT, VISIT_CHECK_BUYER_TIMEOUT,
   VISIT_CREATE_CALENDAR_EVENT, VISIT_CANCEL_CALENDAR_EVENT,
   VISIT_CLEANUP_EXPIRED_LOCKS, VISIT_CHECK_COMPOSIO_HEALTH
   ```

4. **Nuevo modelo `VisitSchedulingSession`** (sesión de negociación).

5. **Nuevo modelo `VisitSlotLock`** (soft-locks de slots).

6. **Nuevo modelo `PropertyVisitSlot`** (visitas confirmadas por propiedad).

7. **Ampliar modelo `Comercial`** con:
   - `composioConnectionId String?`
   - `composioConnectedAt DateTime?`
   - `calendarProvider String? @default("google")`
   - `waId String?`

8. Ejecutar `npx prisma migrate dev --name visit-scheduling-system`.

9. Ejecutar `npx prisma generate`.

#### 9:15–10:00 — Tipos y Constantes del módulo

Crear `lib/visit-scheduling/`:

**`lib/visit-scheduling/constants.ts`**
- `WORKING_HOURS` (L–S, 09:00–14:00, 16:00–20:00, Europe/Madrid).
- `VISIT_DURATION_MIN = 60`.
- `BUFFER_BETWEEN_VISITS_MIN = 30`.
- `MAX_ROUNDS` (env `VISIT_MAX_ROUNDS` || 3).
- `COMMERCIAL_RESPONSE_TTL_MS` (env `VISIT_COMMERCIAL_TTL_HOURS` || 2h).
- `BUYER_RESPONSE_TTL_MS` (env `VISIT_BUYER_TTL_HOURS` || 4h).
- `BUYER_PREFERENCE_TTL_MS` (env `VISIT_BUYER_PREF_TTL_HOURS` || 6h).
- `SLOT_LOCK_TTL_MS` = `COMMERCIAL_RESPONSE_TTL_MS`.
- `LOOKAHEAD_BUSINESS_DAYS` (env `VISIT_LOOKAHEAD_BUSINESS_DAYS` || 5).
- `MAX_CONCURRENT_VISITS_PER_PROPERTY = 1`.
- `MAX_ACTIVE_SESSIONS_PER_BUYER = 3`.
- `MAX_SLOTS_TO_PROPOSE = 3`.

**`lib/visit-scheduling/types.ts`**
- `TimeSlot { start: Date; end: Date }`.
- `ProposedSlot extends TimeSlot { label: string }`.
- `FreeBusyBlock { start: string; end: string }`.
- `SlotFinderInput { comercialId, composioConnectionId, propertyCode, excludeSessionId? }`.
- `SlotFinderResult { available: ProposedSlot[]; totalCandidates: number }`.
- `VisitContext { demandId, propertyCode, property, comercial, buyerWaId }`.
- `VisitorData { name: string; phone: string; count?: number }`.

**`lib/visit-scheduling/index.ts`** — Barrel de exports.

**Entregable:** `npx prisma generate` sin errores, carpeta `lib/visit-scheduling/` con tipos listos.

---

### Bloque 2 — 10:00 a 11:30 · Composio Multi-Tenant + Motor de Disponibilidad

**Objetivo:** Poder consultar calendarios de comerciales específicos y calcular slots disponibles.

#### 10:00–10:45 — Composio Calendar API Directa

**`lib/composio/calendar.ts`** — Nuevo archivo (no se toca `get-inmovilla-2fa-code.ts`).

Funciones:

1. **`getFreeBusy(composioConnectionId, timeMin, timeMax)`**
   - Instancia Composio con el `connectionId` del comercial (no global).
   - `session.executeAction("GOOGLECALENDAR_FIND_FREE_SLOTS", { timeMin, timeMax, timeZone })`.
   - Parsea respuesta → `FreeBusyBlock[]`.
   - 3 reintentos con backoff.

2. **`createCalendarEventDirect(composioConnectionId, input: CalendarEventInput)`**
   - Usa `session.executeAction("GOOGLECALENDAR_CREATE_EVENT", { ... })`.
   - Sin agente LLM. Determinista.
   - Devuelve `{ eventId, link, success }`.

3. **`cancelCalendarEvent(composioConnectionId, eventId)`**
   - `session.executeAction("GOOGLECALENDAR_DELETE_EVENT", { eventId })`.

4. **`checkCalendarHealth(composioConnectionId)`**
   - Intenta `getFreeBusy` para hoy → mañana.
   - Devuelve `{ healthy: boolean; error?: string }`.

5. **Fallback con agente** (reutiliza patrón de `create-calendar-event.ts`):
   - `getFreeBusyWithAgent(composioConnectionId, ...)` — usa gpt-4o como último recurso.

Actualizar **`lib/composio/index.ts`** para exportar las nuevas funciones.

#### 10:45–11:30 — Motor de Disponibilidad (Slot Finder)

**`lib/visit-scheduling/slot-finder.ts`**

1. **`generateWorkingSlots(startDate, businessDays)`**
   - Genera todos los slots de 1h dentro del horario laboral (L–S, 09–14 + 16–20).
   - Step de 30 min: 09:00, 09:30, 10:00...
   - Timezone `Europe/Madrid` (usar `Intl.DateTimeFormat` o `date-fns-tz`).
   - Devuelve `TimeSlot[]`.

2. **`filterByCalendar(slots, busyBlocks)`**
   - Filtra slots que colisionan con bloques ocupados del calendario.
   - Incluye buffer de 30 min antes y después.

3. **`filterByLocks(slots, comercialId, excludeSessionId?)`**
   - Consulta `VisitSlotLock` activos (no expirados, no liberados) del comercial.
   - Excluye locks de la propia sesión (`excludeSessionId`).

4. **`filterByPropertyCapacity(slots, propertyCode)`**
   - Consulta `PropertyVisitSlot` (no cancelados) que colisionan.
   - Filtra slots donde `count >= MAX_CONCURRENT_VISITS_PER_PROPERTY`.

5. **`selectTopSlots(slots, maxCount = 3)`**
   - Heurística: proximidad → distribución por día → mañana primero.

6. **`findAvailableSlots(input: SlotFinderInput)`** — Orquestador:
   - Llama a Composio `getFreeBusy`.
   - Genera working slots.
   - Aplica los 3 filtros en cascada.
   - Selecciona top 3.
   - Genera labels legibles (ej: "Mar 15 Abr · 10:00–11:00").

**Entregable:** Llamar `findAvailableSlots({ comercialId, composioConnectionId, propertyCode })` devuelve hasta 3 `ProposedSlot[]` listos para enviar al comercial.

---

### Bloque 3 — 11:30 a 13:00 · Lock Manager + Session Manager + Confirmación Atómica

**Objetivo:** Gestión completa del estado de las sesiones de negociación con control de concurrencia.

#### 11:30–12:00 — Lock Manager

**`lib/visit-scheduling/lock-manager.ts`**

1. **`createSlotLocks(sessionId, comercialId, propertyCode, slots, ttlMs)`**
   - Crea `VisitSlotLock` por cada slot propuesto.
   - `expiresAt = now() + ttlMs`.
   - Usa `createMany` con `skipDuplicates`.

2. **`releaseLocksForSession(sessionId)`**
   - `updateMany({ where: { sessionId, released: false }, data: { released: true } })`.

3. **`releaseLocksExcept(sessionId, keepSlotStart)`**
   - Libera todos los locks de la sesión excepto el slot seleccionado.

4. **`getActiveLocksForComercial(comercialId, excludeSessionId?)`**
   - Devuelve locks no expirados y no liberados.

5. **`cleanupExpiredLocks()`**
   - `updateMany` donde `expiresAt < now()` y `released = false`.
   - Para el cron de limpieza.

#### 12:00–12:30 — Session Manager

**`lib/visit-scheduling/session-manager.ts`**

1. **`createSession(input: VisitContext)`**
   - Verifica que no haya más de `MAX_ACTIVE_SESSIONS_PER_BUYER` sesiones activas.
   - Crea `VisitSchedulingSession` en estado `INITIATED`.

2. **`getActiveSessionForBuyer(buyerWaId, propertyCode?)`**
   - Busca sesión con `state NOT IN (terminal states)`.
   - Si `propertyCode`, filtra también por propiedad.

3. **`getActiveSessionForComercial(comercialWaId)`**
   - Para cuando el comercial responde a una propuesta.

4. **`transitionState(sessionId, newState, data?)`**
   - Actualiza `state` + campos opcionales (`currentRound`, `confirmedSlotStart`, etc.).
   - Valida que la transición es legal (mapa de transiciones válidas).
   - Actualiza `currentStepDeadline` según el nuevo estado.

5. **`incrementRound(sessionId)`**
   - `currentRound += 1`, devuelve si se alcanzó `maxRounds`.

6. **`setVisitorData(sessionId, data: VisitorData)`**
   - Persiste nombre, teléfono, count.

7. **`markCompleted(sessionId, calendarEventId?, calendarLink?)`**
   - Transita a `VISIT_CONFIRMED`, guarda datos de calendario, `completedAt = now()`.

8. **`markEscalated(sessionId, reason)`**
   - Transita a `ESCALATED_MANUAL`, guarda `escalationReason`.

#### 12:30–13:00 — Confirmación Atómica

**`lib/visit-scheduling/confirm-visit.ts`**

Función **`confirmVisitAtomically(sessionId, slotStart, slotEnd, propertyCode, comercialId)`**:

Transacción Prisma (`$transaction`) que:
1. Verifica lock vigente para la sesión + slot.
2. Verifica capacidad de la propiedad (`PropertyVisitSlot.count`).
3. Crea `PropertyVisitSlot`.
4. Actualiza `VisitSchedulingSession` a `VISIT_CONFIRMED`.
5. Libera todos los locks de la sesión.
6. Devuelve `{ success: true }` o lanza error tipado (`SlotNoLongerAvailableError`, `PropertyFullError`).

Función **`cancelVisitAtomically(sessionId)`**:

Transacción que:
1. Marca `VisitSchedulingSession.state = VISIT_CANCELLED`.
2. Marca `PropertyVisitSlot.cancelled = true`.
3. Libera locks residuales.

**Entregable:** Todo el ciclo de vida de sesión + locks + propiedad manejado con transacciones atómicas.

---

### Bloque 4 — 13:00 a 14:00 · Funciones WhatsApp para Visitas

**Objetivo:** Todas las funciones de envío de mensajes del flujo de visitas listas.

**`lib/whatsapp/visit-messages.ts`** — Nuevo archivo.

#### Al Comercial

1. **`sendVisitProposalToCommercial(comercialWaId, data)`**
   - Mensaje interactivo con reply buttons (hasta 3 slots).
   - Body: datos de propiedad + comprador.
   - Botones: labels de los slots (ej: "Mar 15 Abr · 10:00").
   - Usa `sendInteractiveMessage` existente.

2. **`sendBuyerRejectionToCommercial(comercialWaId, data)`**
   - Template `visita_rechazo_comprador`.
   - Variables: nombre comercial, nombre comprador, fecha rechazada.

3. **`sendBuyerPreferenceToCommercial(comercialWaId, data)`**
   - Mensaje interactivo con 2 botones: ✅ Confirmar / ❌ No puedo.
   - Body: comprador X ha solicitado fecha Y.

4. **`sendEscalationToCommercial(comercialWaId, data)`**
   - Template `visita_escalado_manual`.
   - Toda la info: comprador, propiedad, horarios intentados, preferencia.

5. **`sendVisitConfirmedToCommercial(comercialWaId, data)`**
   - Template `visita_confirmada_comercial`.
   - Propiedad, comprador, fecha/hora.

#### Al Comprador

6. **`sendSlotProposalToBuyer(buyerWaId, data)`**
   - Mensaje interactivo con 2 botones: ✅ Sí, me va bien / ❌ No puedo.
   - Body: propiedad, fecha, hora.

7. **`sendAskPreferenceToBuyer(buyerWaId, data)`**
   - Template `visita_pedir_preferencia`.
   - Pide día y hora al comprador.

8. **`sendVisitConfirmedToBuyer(buyerWaId, data)`**
   - Template `visita_confirmada_comprador`.

9. **`sendEscalationToBuyer(buyerWaId, data)`**
   - Template `visita_escalado_comprador`.

10. **`sendVisitCancelledToBuyer(buyerWaId, data)`**
    - Template `visita_cancelada_comprador`.

11. **`sendCollectDataRequest(buyerWaId, data)`**
    - Texto libre (dentro de ventana 24h): "¡Genial! Para confirmar tu visita necesito tu nombre completo y un teléfono de contacto para el día de la visita."

Actualizar **`lib/whatsapp/index.ts`** para exportar las nuevas funciones.

**Entregable:** 11 funciones de mensajería cubriendo cada paso del flujo.

---

### Bloque 5 — 14:00 a 15:30 · NLU: Clasificación de Intención + Routing de Visitas

**Objetivo:** El NLU detecta `QUIERE_VISITAR`, `CANCELAR_VISITA`, respuestas a propuestas de visita, y datos del visitante.

#### 14:00–14:45 — Clasificador de intención de visita

**`lib/agents/visit-intent-classifier.ts`** — Nuevo grafo LangGraph.

Intenciones a clasificar:
- `QUIERE_VISITAR` — "me encaja", "quiero verlo", "podemos agendar una visita?".
- `ACEPTA_HORARIO` — "sí", "me va bien", "perfecto", "ok".
- `RECHAZA_HORARIO` — "no puedo", "ese día no", "imposible".
- `INDICA_PREFERENCIA` — "el martes por la mañana", "prefiero jueves a las 16".
- `PROPORCIONA_DATOS` — "Me llamo Juan García, mi teléfono es 654..."
- `CANCELAR_VISITA` — "quiero cancelar", "ya no puedo ir".
- `REPROGRAMAR_VISITA` — "puedo cambiar la fecha?", "necesito mover la visita".
- `AMBIGUO` — no encaja en ninguna.
- `NO_VISIT_RELATED` — mensaje que no tiene que ver con visitas.

Implementación:
- **Input:** texto del mensaje + `VisitSessionState` actual (contexto).
- **Output:** `{ intent, extractedDate?, extractedName?, extractedPhone?, confidence }`.
- Modelo: `gpt-4o-mini` (rápido y barato para clasificación).
- Prompt incluye el estado actual de la sesión para contextualizar.

Para respuestas a botones interactivos (`interactive.button_reply.id`), la clasificación es **determinista** (sin LLM):
- `button_id = "slot_1"` → `ACEPTA_HORARIO` (comercial eligió slot 1).
- `button_id = "si_me_va"` → `ACEPTA_HORARIO` (comprador confirma).
- `button_id = "no_puedo"` → `RECHAZA_HORARIO`.
- `button_id = "confirmar"` → `ACEPTA_HORARIO` (comercial confirma preferencia).
- `button_id = "no_puedo_confirmar"` → `RECHAZA_HORARIO`.

#### 14:45–15:30 — Routing en NLU handler

Modificar **`lib/workers/consumer/whatsapp-nlu-handler.ts`**:

Añadir al inicio del handler `handleWhatsAppRecibido`, **antes** del routing actual:

```
1. Extraer waId y texto del mensaje.
2. ¿Hay VisitSchedulingSession activa para este waId?
   - Buscar por buyerWaId O comercialWaId.
   - Si es botón interactivo → clasificación determinista.
   - Si es texto libre → clasificar con visit-intent-classifier.
3. Si hay sesión activa Y la intención es visit-related:
   → Delegar a handleVisitMessage(event, session, intent).
   → Return (no pasa al flujo NLU general).
4. Si hay sesión activa PERO intención es NO_VISIT_RELATED:
   → Continuar con el flujo NLU existente.
5. Si NO hay sesión activa:
   - Clasificar si es QUIERE_VISITAR.
   - Si sí → iniciar nueva sesión de visita.
   - Si no → flujo NLU existente.
```

**`lib/visit-scheduling/handle-visit-message.ts`** — Router interno:

Función **`handleVisitMessage(event, session, intent)`** que según `session.state` + `intent`:

| Estado actual | Intención | Acción |
|---|---|---|
| `SLOTS_PROPOSED_TO_COMMERCIAL` | Botón slot_N | Comercial eligió → transitar a `COMMERCIAL_ACCEPTED_SLOT` → proponer a comprador |
| `SLOT_PROPOSED_TO_BUYER` | `ACEPTA_HORARIO` | Transitar a `BUYER_ACCEPTED` → pedir datos |
| `SLOT_PROPOSED_TO_BUYER` | `RECHAZA_HORARIO` | Transitar a `BUYER_REJECTED` → nueva ronda o escalar |
| `SLOT_PROPOSED_TO_BUYER` | `AMBIGUO` | Re-preguntar (máx 2 veces) |
| `ASKING_BUYER_PREFERENCE` | `INDICA_PREFERENCIA` | Extraer fecha → verificar disponibilidad |
| `COLLECTING_VISITOR_DATA` | `PROPORCIONA_DATOS` | Extraer datos → confirmar visita |
| `SPECIFIC_SLOT_TO_COMMERCIAL` | `ACEPTA_HORARIO` / botón confirmar | Comercial confirma → pedir datos al comprador |
| `SPECIFIC_SLOT_TO_COMMERCIAL` | `RECHAZA_HORARIO` / botón no | Escalar a manual |
| Cualquier estado confirmado | `CANCELAR_VISITA` | Cancelar |
| Cualquier estado confirmado | `REPROGRAMAR_VISITA` | Reprogramar → escalar |

**Entregable:** Mensajes de WhatsApp se rutean correctamente al flujo de visitas según contexto.

---

### Bloque 6 — 15:30 a 17:00 · Orquestador Principal: Flujo de Visita Step-by-Step

**Objetivo:** Implementar cada "paso" del flujo como funciones orquestadoras que conectan todos los módulos.

**`lib/visit-scheduling/orchestrator.ts`** — El cerebro del flujo.

#### 15:30–16:00 — Inicio y Búsqueda de Slots

1. **`initiateVisitScheduling(demandId, propertyCode, buyerWaId)`**
   - Resuelve comercial asignado (de `PropertyCurrent` o tabla de routing).
   - Resuelve `composioConnectionId` del comercial.
   - Si no tiene conexión → escalado inmediato + notificación.
   - Crea sesión.
   - Emite `VISITA_SOLICITADA`.
   - Llama a `fetchAndProposeSlots`.

2. **`fetchAndProposeSlots(sessionId)`**
   - Carga sesión.
   - Llama `findAvailableSlots(...)` (con fallback: API directa → agente IA → preguntar al comprador).
   - Si no hay slots → escalar.
   - Crea soft-locks.
   - Envía `sendVisitProposalToCommercial`.
   - Transita a `SLOTS_PROPOSED_TO_COMMERCIAL`.
   - Encola job `VISIT_CHECK_COMMERCIAL_TIMEOUT` con `availableAt = now() + TTL`.
   - Emite `VISITA_SLOTS_PROPUESTOS`.

#### 16:00–16:30 — Respuestas del Comercial y Comprador

3. **`handleCommercialSlotSelection(sessionId, selectedSlotIndex)`**
   - Libera locks excepto el seleccionado.
   - Transita a `COMMERCIAL_ACCEPTED_SLOT`.
   - Emite `VISITA_SLOT_SELECCIONADO`.
   - Envía `sendSlotProposalToBuyer`.
   - Transita a `SLOT_PROPOSED_TO_BUYER`.
   - Encola `VISIT_CHECK_BUYER_TIMEOUT`.
   - Emite `VISITA_PROPUESTA_ENVIADA`.

4. **`handleBuyerAcceptance(sessionId)`**
   - Transita a `BUYER_ACCEPTED` → `COLLECTING_VISITOR_DATA`.
   - Envía `sendCollectDataRequest`.
   - Emite `VISITA_COMPRADOR_ACEPTO`.

5. **`handleBuyerRejection(sessionId)`**
   - Libera locks.
   - Incrementa ronda.
   - Emite `VISITA_COMPRADOR_RECHAZO`.
   - Si `currentRound < maxRounds`:
     - Envía `sendBuyerRejectionToCommercial`.
     - Llama `fetchAndProposeSlots` (nueva ronda con re-fetch).
   - Si `currentRound >= maxRounds`:
     - Transita a `ASKING_BUYER_PREFERENCE`.
     - Envía `sendAskPreferenceToBuyer`.

#### 16:30–17:00 — Preferencia explícita, Datos y Confirmación

6. **`handleBuyerPreference(sessionId, preferredDate)`**
   - Consulta calendario para ese slot específico.
   - Si disponible:
     - Crea lock para el slot.
     - Envía `sendBuyerPreferenceToCommercial` con botón confirmar.
     - Transita a `SPECIFIC_SLOT_TO_COMMERCIAL`.
   - Si no disponible:
     - Informa al comprador, pide otra fecha.

7. **`handleVisitorData(sessionId, visitorData)`**
   - `setVisitorData`.
   - Ejecuta `confirmVisitAtomically`.
   - Crea evento en Google Calendar (`createCalendarEventDirect`, con retry + fallback).
   - Emite `VISITA_AGENDADA` (el handler existente registra el analytics fact).
   - Envía confirmación a ambas partes.
   - Emite `VISITA_DATOS_RECOPILADOS`.

8. **`handleCommercialConfirmsBuyerPreference(sessionId)`**
   - Transita a `BUYER_ACCEPTED` → `COLLECTING_VISITOR_DATA`.
   - Envía `sendCollectDataRequest`.

9. **`handleCommercialRejectsBuyerPreference(sessionId)`**
   - Escalar a manual.

10. **`handleEscalation(sessionId, reason)`**
    - `markEscalated`.
    - Envía `sendEscalationToCommercial` + `sendEscalationToBuyer`.
    - Emite `VISITA_ESCALADA_MANUAL`.

11. **`handleCancellation(sessionId)`**
    - `cancelVisitAtomically`.
    - Cancela evento en Google Calendar.
    - Notifica al comercial + comprador.
    - Emite `VISITA_CANCELADA`.

12. **`handleRescheduling(sessionId)`**
    - Transita a `VISIT_RESCHEDULED` → `ESCALATED_MANUAL`.
    - Cancela evento calendario.
    - Notifica a ambos.
    - Emite `VISITA_REPROGRAMADA`.

**Entregable:** 12 funciones orquestadoras que cubren cada transición del state machine.

---

### Bloque 7 — 17:00 a 18:00 · Consumer Handlers + Job Handlers

**Objetivo:** Registrar los handlers de los nuevos eventos y jobs.

#### 17:00–17:30 — Event Consumer Handlers

Añadir a `lib/workers/consumer/handlers.ts`:

Los nuevos eventos (`VISITA_SOLICITADA`, `VISITA_SLOTS_PROPUESTOS`, etc.) se registran pero sus handlers son **ligeros** — la lógica pesada ya se ejecutó en el orquestador. Los handlers de eventos solo:
- Actualizan analytics facts si corresponde.
- Loguean para auditoría.

El evento `VISITA_AGENDADA` ya tiene handler (analytics fact) y **no cambia**.

Crear **`lib/workers/consumer/visit-scheduling-event-handlers.ts`**:
- `handleVisitaSolicitada` — log + analytics fact.
- `handleVisitaEscaladaManual` — log + posible alerta.
- `handleVisitaCancelada` — log + cleanup.
- `handleVisitaReprogramada` — log.

#### 17:30–18:00 — Job Handlers

Añadir a `lib/workers/consumer/job-handlers.ts`:

1. **`handleVisitCheckCommercialTimeout(job)`**
   - Carga sesión por `sessionId` del payload.
   - Si `state !== SLOTS_PROPOSED_TO_COMMERCIAL` → ya se procesó, skip.
   - Libera locks.
   - Si `currentRound < maxRounds` → `fetchAndProposeSlots`.
   - Si no → `handleEscalation`.

2. **`handleVisitCheckBuyerTimeout(job)`**
   - Si `state !== SLOT_PROPOSED_TO_BUYER` → ya se procesó, skip.
   - Trata como rechazo → `handleBuyerRejection`.

3. **`handleVisitCreateCalendarEvent(job)`**
   - Retry con backoff para crear el evento.
   - Si falla tras 3 intentos → marcar `calendarSuccess = false`, notificar.

4. **`handleVisitCancelCalendarEvent(job)`**
   - Cancela evento por `eventId`.

5. **`handleVisitCleanupExpiredLocks(job)`**
   - Llama `cleanupExpiredLocks()`.

6. **`handleVisitCheckComposioHealth(job)`**
   - Itera comerciales con `composioConnectionId`.
   - `checkCalendarHealth` para cada uno.
   - Si falla → `composioConnectedAt = null` + notificación.

Registrar cada handler con `registerJobHandler(...)`.

**Entregable:** Todos los jobs del flujo de visitas ejecutándose correctamente via la JobQueue existente.

---

### Bloque 8 — 18:00 a 19:00 · API Routes Composio Onboarding + Integración Final

**Objetivo:** Onboarding de calendarios + integración completa del flujo.

#### 18:00–18:30 — API Routes Composio

**`app/api/composio/connect/route.ts`**

```
POST /api/composio/connect
Body: { comercialId }
→ Genera userId = "comercial_{comercialId}"
→ Inicia OAuth flow de Composio para Google Calendar
→ Devuelve { redirectUrl }
```

**`app/api/composio/callback/route.ts`**

```
POST /api/composio/callback (o GET según Composio)
→ Recibe connectionId tras autorización
→ Persiste en Comercial.composioConnectionId
→ Marca composioConnectedAt = now()
→ Emite evento COMPOSIO_CALENDAR_CONNECTED (opcional)
→ Envía WhatsApp de confirmación al comercial
```

#### 18:30–19:00 — Integración en el NLU Handler Existente

Modificar **`lib/workers/consumer/whatsapp-nlu-handler.ts`**:

Insertar **al inicio** de `handleWhatsAppRecibido` (después del routing a mental health y postventa, antes del NLU general):

```typescript
// --- Routing de visitas ---
const visitResult = await routeToVisitSchedulingIfApplicable(event, messageText, waId);
if (visitResult) return visitResult;
```

Crear función `routeToVisitSchedulingIfApplicable`:
1. Busca sesión activa por `buyerWaId` o `comercialWaId`.
2. Clasifica intención (determinista para botones, LLM para texto).
3. Si hay sesión activa + intención visit-related → `handleVisitMessage`.
4. Si no hay sesión + intención `QUIERE_VISITAR` → `initiateVisitScheduling`.
5. Si nada de lo anterior → `return null` (el NLU general continúa).

Registrar nuevos handlers de eventos en `handlers.ts` con `registerHandler(...)`.

**Entregable:** El flujo de visitas intercepta mensajes correctamente y se integra sin romper el NLU existente.

---

### Bloque 9 — 19:00 a 20:00 · Tests de Integración + Documentación

**Objetivo:** Verificar el flujo end-to-end y documentar.

#### 19:00–19:45 — Tests

**`scripts/test-visit-scheduling.ts`** — Script de test E2E (patrón existente en `scripts/test-sprint2-e2e.ts`):

1. **Test: Creación de sesión**
   - Crear comercial con `composioConnectionId` mock.
   - Simular `QUIERE_VISITAR` → verificar sesión creada en `INITIATED`.

2. **Test: Slot finder**
   - Mock de Composio free/busy (calendar vacío).
   - Verificar que genera slots dentro del horario laboral.
   - Verificar buffer de 30 min.
   - Verificar exclusión de locks activos.

3. **Test: Lock lifecycle**
   - Crear locks → verificar exclusión → liberar → verificar disponibles.
   - Verificar expiración por TTL.

4. **Test: Confirmación atómica**
   - Crear sesión + lock + confirmar → verificar `PropertyVisitSlot` creado.
   - Intentar doble booking → verificar error `PropertyFullError`.

5. **Test: State machine transitions**
   - Verificar cada transición legal.
   - Verificar que transiciones ilegales lanzan error.

6. **Test: Rondas de negociación**
   - Simular 3 rechazos → verificar transición a `ASKING_BUYER_PREFERENCE`.
   - Simular escalado tras rechazo del comercial a preferencia.

7. **Test: Timeout handlers**
   - Simular commercial timeout → verificar nueva ronda o escalado.
   - Simular buyer timeout → verificar tratamiento como rechazo.

#### 19:45–20:00 — Actualización de Documentación

1. Actualizar **`.env.example`** con nuevas variables:
   ```
   VISIT_MAX_ROUNDS=3
   VISIT_COMMERCIAL_TTL_HOURS=2
   VISIT_BUYER_TTL_HOURS=4
   VISIT_BUYER_PREF_TTL_HOURS=6
   VISIT_LOOKAHEAD_BUSINESS_DAYS=5
   ```

2. Actualizar **`CHANGELOG.md`** con entrada del día.

3. Actualizar **`docs/visit-scheduling-system.md`** si hubo decisiones de implementación que difieren del diseño.

---

## Resumen de Archivos a Crear/Modificar

### Archivos nuevos (14)

| # | Ruta | Propósito |
|---|---|---|
| 1 | `lib/visit-scheduling/constants.ts` | Constantes de negocio y TTLs |
| 2 | `lib/visit-scheduling/types.ts` | Tipos TypeScript del módulo |
| 3 | `lib/visit-scheduling/index.ts` | Barrel |
| 4 | `lib/visit-scheduling/slot-finder.ts` | Motor de disponibilidad |
| 5 | `lib/visit-scheduling/lock-manager.ts` | Gestión de soft-locks |
| 6 | `lib/visit-scheduling/session-manager.ts` | CRUD + transiciones de sesión |
| 7 | `lib/visit-scheduling/confirm-visit.ts` | Transacciones atómicas |
| 8 | `lib/visit-scheduling/orchestrator.ts` | 12 funciones orquestadoras |
| 9 | `lib/visit-scheduling/handle-visit-message.ts` | Router de mensajes del flujo |
| 10 | `lib/composio/calendar.ts` | API directa multi-tenant |
| 11 | `lib/whatsapp/visit-messages.ts` | 11 funciones de mensajería |
| 12 | `lib/agents/visit-intent-classifier.ts` | Clasificador NLU de visitas |
| 13 | `lib/workers/consumer/visit-scheduling-event-handlers.ts` | Event handlers |
| 14 | `app/api/composio/connect/route.ts` + `callback/route.ts` | Onboarding OAuth |

### Archivos modificados (5)

| # | Ruta | Cambio |
|---|---|---|
| 1 | `prisma/schema.prisma` | Nuevos enums + 3 modelos + ampliar Comercial |
| 2 | `lib/composio/index.ts` | Exportar funciones de calendar.ts |
| 3 | `lib/whatsapp/index.ts` | Exportar visit-messages |
| 4 | `lib/workers/consumer/handlers.ts` | Registrar nuevos event handlers |
| 5 | `lib/workers/consumer/whatsapp-nlu-handler.ts` | Insertar routing de visitas |

### Archivos no modificados (se mantienen)

- `lib/workers/consumer/visita-agendada-handler.ts` — No cambia (analytics fact).
- `lib/workers/consumer/visita-evaluada-handler.ts` — No cambia (scoring + Statefox).
- `app/api/post-visit/route.ts` — No cambia.
- `app/api/agenda/route.ts` — No cambia (fallback manual).
- `app/platform/post-visita/` — No cambia (micro-frontend de post-visita).
- `app/platform/agenda/` — No cambia (fallback manual para el comercial).
- `lib/composio/get-inmovilla-2fa-code.ts` — No se toca.

---

## Diagrama de Dependencias de Construcción

```
8:30 ─── Schema + Migración ─── Tipos + Constantes
          │                          │
10:00 ─── Composio Calendar ────── Slot Finder
          │                          │
11:30 ─── Lock Manager ──── Session Manager ──── Confirm Atomic
          │                    │                      │
13:00 ─── WhatsApp Visit Messages ──────────────────────┐
          │                                              │
14:00 ─── Visit Intent Classifier ──── NLU Routing ─────┤
          │                                              │
15:30 ─── Orchestrator (12 funciones) ◄─────────────────┘
          │
17:00 ─── Event Handlers ──── Job Handlers
          │
18:00 ─── API Routes Composio ──── Integración NLU Handler
          │
19:00 ─── Tests ──── Docs
```

---

## Dependencias de Paquetes

Verificar que ya están instalados (lo están en el proyecto actual):

| Paquete | Uso | Estado |
|---|---|---|
| `@composio/core` | API Composio | ✅ Instalado |
| `@langchain/langgraph` | Grafo NLU visitas | ✅ Instalado |
| `@langchain/openai` | Modelo para clasificación | ✅ Instalado |
| `date-fns` | Manipulación de fechas | Verificar; si no → `npm i date-fns` |
| `date-fns-tz` | Timezone Europe/Madrid | Verificar; si no → `npm i date-fns-tz` |

---

## Riesgos del Plan de 1 Día

| Riesgo | Mitigación |
|---|---|
| La API de Composio `executeAction` no funciona como se espera para free/busy | Tener fallback al agente LLM listo; si ambos fallan, el flujo escala a manual |
| El schema Prisma tiene conflictos con migraciones existentes | Hacer `migrate dev` lo primero; si falla, resolver antes de continuar |
| Las plantillas WhatsApp no están aprobadas por Meta | Usar `sendTextMessage` o `sendInteractiveMessage` (que no requieren aprobación previa) como fallback temporal; someter templates a aprobación en paralelo |
| El bloque de 11.5h no alcanza para tests exhaustivos | Priorizar tests del slot-finder, lock-manager y confirmación atómica (las partes con más riesgo de bug); dejar tests E2E de WhatsApp para el día siguiente |
| `date-fns-tz` no resuelve bien los horarios de Europa/Madrid | Usar `Intl.DateTimeFormat` nativo como alternativa |
