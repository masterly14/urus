# Flujo Lead-to-Notification + Cadencias Automáticas (M3)

Pipeline end-to-end: ingesta de lead → scoring → SLA → routing → notificación WhatsApp al comercial asignado → cadencias automáticas D+1, D+3, D+7 para leads sin respuesta.

## Arquitectura del flujo

```
POST /api/leads/ingest (o ingesta automática futura)
  └─ emitLeadIngestado(payload)
       ├─ appendEvent(LEAD_INGESTADO)
       └─ enqueueJob(PROCESS_EVENT)

Consumer (ciclo N):
  dequeue PROCESS_EVENT
  └─ handleLeadIngestado(event)
       ├─ calculateScore(input) → { score, pclose, value, urgency, reasons }
       ├─ assignSla(score) → { sla, notifyImmediately, followUpCadence }
       ├─ selectBestAgent(agents, routingInput) → { assigned, agent, reason }
       ├─ incrementAgentLoad(agentId)  ← si hay agente asignado
       └─ return followUpJobs:
            ├─ NOTIFY_LEAD_WHATSAPP (si notifyImmediately)
            └─ FOLLOW_UP_LEAD x N (si followUpCadence)

Consumer (ciclo N+1):
  dequeue NOTIFY_LEAD_WHATSAPP
  └─ sendLeadAssignedToCommercial(telefono, params)
       └─ WhatsApp Cloud API → mensaje al comercial

Consumer (cuando availableAt llega — D+1, D+3, D+7):
  dequeue FOLLOW_UP_LEAD
  └─ handleFollowUpLead(job)
       ├─ checkLeadNeedsFollowUp(aggregateId)
       │    └─ ¿Existe evento LEAD_CONTACTADO? → Sí: omitir / No: seguir
       ├─ lookupAgentPhone(agentId)
       └─ sendFollowUpToCommercial(telefono, params)
            └─ WhatsApp Cloud API → recordatorio al comercial

Cron de seguridad (POST /api/cron/cadences — cada 6-12h):
  └─ scanAndEnqueueMissingFollowUps()
       └─ Para cada lead sin LEAD_CONTACTADO ni FOLLOW_UP_LEAD pendientes:
            encolar jobs FOLLOW_UP_LEAD faltantes
```

## API de ingesta de leads

### `POST /api/leads/ingest`

Endpoint temporal para disparar manualmente la ingesta de leads (pruebas, demos, integración con sistemas externos). En producción, la ingesta se realizará automáticamente desde el Ingestion Worker cuando detecte leads nuevos en Inmovilla.

**Autenticación:** `Authorization: Bearer <CRON_SECRET>` o parámetro de consulta `cronSecret` con el mismo valor.

**Body (JSON):**

```json
{
  "tipo": "comprador",
  "ciudad": "Córdoba",
  "nombre": "Juan Pérez",
  "telefono": "+34612345678",
  "preaprobacionHipotecaria": true,
  "presupuestoDefinido": true,
  "plazoDias": 30,
  "mensajeConDetalles": true,
  "referido": false
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `tipo` | `"comprador" \| "propietario"` | Sí | Tipo de lead |
| `ciudad` | string | Sí | Ciudad del lead (usado para routing) |
| `nombre` | string | No | Nombre del contacto |
| `email` | string | No | Email del contacto |
| `telefono` | string | No | Teléfono del contacto |
| `source` | string | No | Origen del lead (ej. "web", "inmovilla", "referido") |
| `preaprobacionHipotecaria` | boolean | No | Señal de scoring (comprador) |
| `presupuestoDefinido` | boolean | No | Señal de scoring (comprador) |
| `plazoDias` | number | No | Plazo en días para la operación |
| `mensajeConDetalles` | boolean | No | Señal de scoring (comprador) |
| `referido` | boolean | No | Señal de scoring (comprador) |
| `soloMirando` | boolean | No | Señal negativa de scoring |
| `urgenciaVenta` | boolean | No | Señal de scoring (propietario) |
| `precioCercanoMercado` | boolean | No | Señal de scoring (propietario) |
| `exclusivaAceptable` | boolean | No | Señal de scoring (propietario) |
| `documentacionDisponible` | boolean | No | Señal de scoring (propietario) |
| `probarSinAgencia` | boolean | No | Señal negativa de scoring (propietario) |
| `especialidad` | string | No | Especialidad para routing |

**Respuesta 201:**

```json
{
  "eventId": "cm...",
  "aggregateId": "lead-a1b2c3d4e5f6"
}
```

### Ejemplo con curl

```bash
curl -X POST http://localhost:3000/api/leads/ingest \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "comprador",
    "ciudad": "Córdoba",
    "preaprobacionHipotecaria": true,
    "presupuestoDefinido": true,
    "plazoDias": 20,
    "mensajeConDetalles": true
  }'
```

## Consumer: configuración para el flujo completo

El consumer debe procesar `PROCESS_EVENT`, `NOTIFY_LEAD_WHATSAPP` y `FOLLOW_UP_LEAD` para que el flujo funcione de extremo a extremo:

```typescript
runConsumerLoop({
  workerId: "...",
  types: ["PROCESS_EVENT", "NOTIFY_LEAD_WHATSAPP", "FOLLOW_UP_LEAD"],
  // ...
});
```

Tanto la ruta cron (`/api/cron/consumer`) como el script CLI (`scripts/run-consumer.ts`) ya incluyen los tres tipos.

### Procesamiento de NOTIFY_LEAD_WHATSAPP

Cuando el consumer desencola un job `NOTIFY_LEAD_WHATSAPP`:

1. Lee el payload del job directamente (no busca evento).
2. Si hay `assignedAgentTelefono`, envía un mensaje WhatsApp vía `sendLeadAssignedToCommercial`.
3. Si no hay teléfono, marca el job como completado (no-op).
4. Si WhatsApp falla, el job se marca como `FAILED` y se reintenta según política del job queue (max 5 intentos).

## Notificación WhatsApp al comercial

### MVP (desarrollo/demos)

Se envía un **mensaje de texto** (requiere ventana de conversación de 24h iniciada por el comercial):

```
📋 *Nuevo lead asignado*

• ID: lead-a1b2c3d4e5f6
• Score: 85/100
• SLA: CRITICAL (< 5min)
• Ciudad: Córdoba
• Señales: preaprobación hipotecaria, presupuesto definido

Revisa el panel para más detalles.
```

### Producción (futuro)

Se sustituirá por una **plantilla aprobada en Meta Business Manager** (`lead_asignado`) con parámetros `{{1}}=leadId`, `{{2}}=score`, `{{3}}=slaLevel`. Para activar plantilla, pasar `{ useTemplate: true }` en las opciones de `sendLeadAssignedToCommercial`.

## Cadencias automáticas (D+1, D+3, D+7)

### Cómo funciona

Para leads con score bajo (<40), el SLA devuelve `followUpCadence` con 3 pasos (D+1, D+3, D+7). El handler `handleLeadIngestado` encola jobs `FOLLOW_UP_LEAD` con `availableAt` fijado a 1, 3 y 7 días después del alta. Cuando llega la fecha, el consumer desencola el job y:

1. **Consulta "sin respuesta"**: busca eventos `LEAD_CONTACTADO` para ese lead en el Event Store.
2. **Si ya fue contactado** → marca el job completado sin envío.
3. **Si sigue sin respuesta** → busca el teléfono del comercial asignado y envía un recordatorio por WhatsApp.

### Evento `LEAD_CONTACTADO`

Evento inmutable que marca que un comercial ha contactado al lead. Se puede emitir desde:

- `markLeadAsContacted(aggregateId, { comercialId, canal })` — función helper en `lib/leads/follow-up-checker.ts`.
- Webhook de WhatsApp (cuando el comercial envía un mensaje al lead).
- Micro-frontend de seguimiento (cuando el comercial marca "contactado").

Una vez existe un `LEAD_CONTACTADO`, todos los follow-ups pendientes para ese lead se auto-cancelan (se completan sin envío al procesarse).

### Mensajes de follow-up

Cada recordatorio tiene un nivel de urgencia visual:

| Step | Emoji | Mensaje |
|------|-------|---------|
| D+1 | 🟢 | "1 día sin contacto" |
| D+3 | 🟡 | "3 días sin contacto" |
| D+7 | 🔴 | "7 días sin contacto — última alerta" |

El D+7 incluye un aviso de que es el último recordatorio automático.

### Cron de seguridad: `/api/cron/cadences`

Red de seguridad que se ejecuta periódicamente (recomendado cada 6–12h) para cubrir edge cases donde el handler original no pudo encolar los follow-ups:

```bash
curl -X POST http://localhost:3000/api/cron/cadences \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Respuesta:**

```json
{
  "leadsScanned": 45,
  "followUpsEnqueued": 2,
  "leadsAlreadyCovered": 43
}
```

El cron revisa los últimos 200 leads ingestados, verifica si tienen `LEAD_CONTACTADO`, si ya tienen `FOLLOW_UP_LEAD` pendientes/completados, y encola los faltantes con idempotency key.

**Configuración QStash (producción):**

```
POST https://<dominio>/api/cron/cadences
Authorization: Bearer <CRON_SECRET>
Schedule: 0 */6 * * * (cada 6 horas)
```

## Notas para futuro

- **Evento `SLA_INICIADO`**: El handler no emite explícitamente este evento todavía. Se podrá añadir para trackear métricas del temporizador SLA.
- **Integración con Ingestion Worker**: Cuando el worker detecte un lead nuevo en Inmovilla, deberá llamar a `emitLeadIngestado(payload)` en lugar de publicar directamente un evento. Esto garantiza que el flujo scoring → SLA → routing → WhatsApp → cadencias se active automáticamente.
- **Cadencias para scores altos**: Actualmente solo leads LOW (<40) reciben cadencias D+1/D+3/D+7. Para leads CRITICAL/HIGH/MEDIUM se podría añadir cadencias de escalado si el SLA no se cumple (ej. "lead score 85, SLA <5min, 30min sin respuesta → escalado a supervisor").

## Tests

```bash
# Tests del módulo de ingesta
npx vitest run lib/leads/__tests__/ingest.test.ts

# Tests del follow-up checker (lógica "sin respuesta")
npx vitest run lib/leads/__tests__/follow-up-checker.test.ts

# Tests del handler LEAD_INGESTADO (scoring + SLA + routing + carga)
npx vitest run lib/workers/consumer/__tests__/lead-scoring-handler.test.ts

# Tests del job handler NOTIFY_LEAD_WHATSAPP + FOLLOW_UP_LEAD
npx vitest run lib/workers/consumer/__tests__/job-handlers.test.ts

# Todos los tests del flujo
npx vitest run lib/leads/ lib/workers/consumer/__tests__/ lib/scoring/ lib/sla/ lib/routing/
```

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Sí | Conexión a Neon (Prisma) |
| `CRON_SECRET` | Sí | Token para autenticar endpoints cron/API |
| `WHATSAPP_ACCESS_TOKEN` | Sí | Token de acceso Meta WhatsApp Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | Sí | Phone Number ID de la cuenta WhatsApp Business |
