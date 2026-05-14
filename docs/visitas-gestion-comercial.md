# Visitas — Gestión Comercial

## Qué Cambia

El flujo principal de visitas ya no negocia horarios automáticamente por WhatsApp entre comprador y comercial. Cuando un comprador marca interés en una o varias propiedades, Urus genera un paquete operativo para el comercial: demanda, teléfono del comprador, propiedades interesadas, dirección, referencia, referencia catastral si existe y teléfonos disponibles del propietario, agencia o anunciante.

El comercial coordina la visita fuera de la plataforma llamando al propietario o agencia. Cuando ya tiene día y hora, entra en `Visitas`, selecciona la demanda y la propiedad, y registra la cita. En ese momento Urus crea el evento de Google Calendar, emite `VISITA_AGENDADA` y programa el WhatsApp Flow del Parte de Visita en **Upstash QStash** con `notBefore = visitDateTime`. QStash llama al endpoint dedicado `POST /api/parte-visita/send` en el instante exacto de la visita y se envía el Flow **en caliente**, sin pasar por la cola interna `job_queue` ni por ningún cron poller. Esto garantiza que el comprador reciba el mensaje en el momento en que está físicamente con el comercial, listo para rellenar el formulario.

## Rutas y Archivos Principales

- `app/platform/visitas/page.tsx` y `app/platform/visitas/visitas-client.tsx`: pestaña interna para gestionar propiedades de interés y registrar visitas.
- `app/api/visitas/route.ts`: lista demandas con propiedades marcadas `ME_INTERESA`.
- `app/api/visitas/schedule/route.ts`: confirma una visita manualmente.
- `lib/visitas/interest-package.ts`: resuelve el paquete de visita desde `MicrositeSelectionFeedback`, `MicrositeSelection.properties` y `PropertyCurrent`.
- `lib/visitas/notify-commercial.ts`: notifica al comercial por WhatsApp con el paquete operativo.
- Plantilla Meta usada: `visita_paquete_comercial` (configurable con `WHATSAPP_TEMPLATE_VISITA_PAQUETE_COMERCIAL`).
- `lib/visitas/manual-schedule.ts`: crea calendario, `VisitSchedulingSession`, `PropertyVisitSlot`, evento `VISITA_AGENDADA` y programa el Flow.
- `lib/parte-visita/schedule.ts`: expone `scheduleParteVisitaFromDetails` y `publishParteVisitaSendSchedule`; crea la `ParteVisitaSession` y publica a QStash con `notBefore = visitDateTime` apuntando a `/api/parte-visita/send`.
- `lib/parte-visita/send.ts`: `sendParteVisitaForSession(sessionId)` envía la plantilla de contexto + el WhatsApp Flow. Idempotente: si la sesión ya no está en `PENDING`, no reenvía.
- `app/api/parte-visita/send/route.ts`: endpoint dedicado al que QStash llama exactamente cuando empieza la visita; valida firma Upstash o `CRON_SECRET` y delega en `sendParteVisitaForSession`.
- `lib/workers/consumer/parte-visita-handlers.ts`: handler legacy de `PARTE_VISITA_ENVIAR_FORMULARIO`. Tras la migración a QStash queda solo como red de seguridad para drenar jobs antiguos; delega en `sendParteVisitaForSession`.

## Datos de Contacto

Para cartera interna se usa `PropertyCurrent`: `ref`, `refCatastral`, `propietarioNombre`, `propietarioPhone`, `zona`, `ciudad`.

Para cartera externa se usa el JSON curado del microsite (`MicrositeSelection.properties`): `contactPhones`, `advertiserType`, `advertiserName`, `address`, `link`. Si no hay teléfono externo, la UI y el mensaje al comercial lo muestran explícitamente como faltante.

## Eventos y Jobs

- `SELECCION_COMPRADOR`: persiste feedback y, si la decisión es `ME_INTERESA`, marca la demanda como `VISITA_PENDIENTE` y notifica al comercial.
- `VISITA_AGENDADA`: se emite al registrar día/hora desde `Visitas`. Alimenta analítica comercial y deja trazabilidad.
- **Parte de Visita (QStash, no job_queue)**: al confirmar la visita se publica un mensaje diferido en QStash con `notBefore = visitDateTime` apuntando a `/api/parte-visita/send`. Cuando llega ese instante, QStash llama al endpoint y se envía la plantilla `visita_contexto_propiedad` + el WhatsApp Flow `parte_visita_formulario` en caliente.

## Configuración Meta (plantillas)

Las dos plantillas pueden estar aprobadas en idiomas distintos en Meta. Se configuran por separado:

- `WHATSAPP_TEMPLATE_PARTE_VISITA_CONTEXTO` (default `visita_contexto_propiedad`)
- `WHATSAPP_TEMPLATE_PARTE_VISITA_CONTEXTO_LANGUAGE` (default = `WHATSAPP_TEMPLATE_LANGUAGE`)
- `WHATSAPP_TEMPLATE_PARTE_VISITA_FORMULARIO` (default `parte_visita_formulario`)
- `WHATSAPP_TEMPLATE_PARTE_VISITA_FORMULARIO_LANGUAGE` (default = `WHATSAPP_TEMPLATE_LANGUAGE`)

Si Meta responde `#132001 Template name does not exist in the translation`, el idioma configurado no coincide con el de la plantilla aprobada (p. ej. `es` vs `es_ES`). Consultar con `npm run whatsapp:template:get-by-name -- --name <nombre>` para ver el `language` real.

## Operación: rescatar o migrar Partes de Visita

- **Rescatar un envío perdido** (visita pasada en estado `PENDING`): `npm run parte-visita:force-send -- --visit-session-id <id> --confirm`. Llama `sendParteVisitaForSession` directamente, sin pasar por QStash.
- **Migrar pendientes futuros a QStash** (tras el cambio de arquitectura): `POST /api/admin/parte-visita/migrate-to-qstash` con `Authorization: Bearer $CRON_SECRET`. Publica un schedule en QStash para cada `ParteVisitaSession` PENDING con `visitDateTime` futuro y borra el job legacy correspondiente en `job_queue`. Las sesiones cuya hora ya pasó se omiten (usar el rescate anterior).

## Cómo Probar

1. Generar o usar un microsite donde el comprador haya marcado una propiedad como `ME_INTERESA`.
2. Abrir `/platform/visitas`.
3. Seleccionar la demanda y la propiedad interesada.
4. Introducir día, hora de inicio y hora de fin.
5. Confirmar. Debe crearse el evento en Google Calendar y quedar programado el Flow de parte de visita.

Tests focalizados:

```bash
npm test -- lib/visitas/__tests__/interest-package.test.ts lib/workers/consumer/__tests__/seleccion-comprador-handler.test.ts
```
