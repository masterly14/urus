# Trazabilidad de conversaciones

La sección `/platform/conversaciones` permite revisar, en modo solo lectura, las conversaciones de WhatsApp guardadas en Neon. Su objetivo es que el equipo pueda auditar qué mensajes recibió el sistema, qué respuestas emitió y cuándo intervino la IA, antes de escalar el uso con clientes reales.

La fuente de verdad es el Event Store. Los mensajes operativos entrantes se leen desde eventos `WHATSAPP_RECIBIDO` y los salientes desde `WHATSAPP_ENVIADO`, bajo `aggregateType = WHATSAPP_CONVERSATION` y `aggregateId = waId`. Las conversaciones del Coach emocional se leen desde `MENTAL_MSG_RECIBIDO` / `MENTAL_MSG_ENVIADO`, bajo `aggregateType = MENTAL_CONVERSATION` y el mismo `aggregateId = waId`.

Cada conversacion se enriquece con el mejor contexto disponible para evitar que el equipo vea solo numeros de telefono:

- `WhatsAppBuyerSession` para resolver `demandId`, `selectionId` y fase conversacional.
- `DemandCurrent` / `DemandSnapshot` para mostrar nombre de demanda, telefono, agente y codigo.
- `MicrositeSelection` para conversaciones de compradores que vienen de un microsite.
- `VisitSchedulingSession` para distinguir comprador en visita y comercial en visita.
- `Comercial` para identificar conversaciones internas de comerciales y sesiones del Coach emocional.
- `MentalHealthSession` para marcar las conversaciones del bot de soporte mental como `Coach emocional`.
- `PostventaSurveySession` y `ParteVisitaSession` como fallback de nombre/operacion cuando no hay demanda enlazada.

## Alcance y privacidad

- Incluye conversaciones operativas y comerciales de WhatsApp, además de los mensajes persistidos del Coach emocional.
- Es visible para cualquier usuario autenticado de la plataforma.
- Los mensajes del Coach emocional se muestran como trazabilidad porque están persistidos en el Event Store. La pantalla sigue siendo de solo lectura.
- La pantalla no permite responder mensajes; solo consulta trazabilidad.
- Los mensajes salientes históricos que no fueron registrados en Neon no se reconstruyen desde Meta.

## Archivos principales

- `lib/conversations/normalize.ts`: normaliza payloads heterogeneos de WhatsApp a mensajes renderizables.
- `lib/conversations/queries.ts`: lista conversaciones y recupera transcripts desde `events`.
- `lib/conversations/types.ts`: define los campos de relacion visibles en la UI (`ownerName`, `relationLabel`, `demandName`, `commercialName`, etc.).
- `lib/whatsapp/templates/`: sincroniza plantillas aprobadas desde WABA y renderiza `{{1}}`, `{{2}}`, etc. con los valores guardados en cada evento.
- `components/conversations/template-message-card.tsx`: tarjeta visual para plantillas con header, body, footer, botones y variables.
- `app/api/conversations/route.ts`: API autenticada para listar conversaciones.
- `app/api/conversations/[waId]/route.ts`: API autenticada para consultar una conversacion.
- `app/api/admin/whatsapp/templates/sync/route.ts`: endpoint admin para refrescar la caché de plantillas desde Meta.
- `app/platform/conversaciones/page.tsx`: ruta interna de la UI.
- `app/platform/conversaciones/conversations-client.tsx`: lista, filtros y panel de chat.
- `lib/whatsapp/send.ts`: soporte de trazabilidad explicita para registrar salientes.

## Contexto visible en el chat

La pantalla usa un layout de altura fija tipo bandeja de correo con tres paneles independientes que hacen scroll por separado:

- Panel izquierdo: lista de conversaciones con avatar de iniciales, preview del ultimo mensaje, badge de numero de mensajes y badge "IA" cuando el agente intervino. Se puede colapsar con el boton superior para dedicar toda la pantalla al chat.
- Panel central: transcript en burbujas (cliente a la izquierda, sistema a la derecha) dentro de un area scrollable.
- Panel derecho de contexto, colapsable desde la cabecera del chat, que muestra:
  - Estado actual de la demanda (`DemandCurrent.leadStatus`), nombre, codigo, telefono, zonas, tipos, presupuesto y agente si existen.
  - Selecciones/microsites relacionados con la demanda o el telefono del comprador.
  - Propiedades enviadas dentro de cada seleccion, con la primera imagen de la ficha, titulo, zona/ciudad, precio, metros, habitaciones y enlace de ficha cuando existe.

Esto permite revisar en la misma pantalla que propiedades vio el cliente y en que punto del pipeline esta la demanda, sin depender solo del numero de telefono.

## Renderizado de plantillas WhatsApp

Los mensajes salientes enviados con plantillas Meta se guardan en Event Store con `messageType = template` y el objeto `template` enviado a Meta. Ese objeto contiene el nombre, idioma y los valores de las variables, pero no contiene el texto completo aprobado de la plantilla.

Para poder ver el mensaje real en la trazabilidad, Urus mantiene una caché local en Neon (`whatsapp_templates`) sincronizada desde WABA:

- Script operativo: `npm run whatsapp:templates:sync`.
- Endpoint admin: `POST /api/admin/whatsapp/templates/sync`.
- Variables necesarias: `WHATSAPP_ACCESS_TOKEN` con permiso `whatsapp_business_management` y `WHATSAPP_BUSINESS_ID`.

La UI resuelve cada plantilla por `(name, language)` y renderiza:

- `HEADER`, incluyendo texto o referencia al media enviado.
- `BODY`, sustituyendo placeholders `{{1}}`, `{{2}}`, etc. con los parámetros históricos.
- `FOOTER`, si existe.
- `BUTTONS`, incluyendo URLs dinámicas interpoladas cuando el botón usa variables.
- Tabla de variables por componente para auditar qué valor se inyectó en cada placeholder.

Si la plantilla todavía no está cacheada, el chat mantiene un fallback legible con el nombre de la plantilla y los valores enviados, sin bloquear la carga del transcript.

## Endpoints

### `GET /api/conversations`

Query params:

- `q`: busca por telefono, nombre, demanda, seleccion o preview del ultimo mensaje.
- `direction`: `inbound`, `outbound` o ausente para todos.
- `agent=1`: restringe a conversaciones con mensajes cuyo `source` parezca IA/NLU.
- `from` / `to`: fechas ISO para acotar por `occurredAt`.
- `limit`: maximo de conversaciones a devolver.

### `GET /api/conversations/{waId}`

Query params:

- `direction`: `inbound`, `outbound` o ausente para todos.
- `limit`: maximo de mensajes.
- `offset`: desplazamiento para paginacion.

### `POST /api/admin/whatsapp/templates/sync`

Sincroniza desde Meta las plantillas del WABA configurado en `WHATSAPP_BUSINESS_ID` y actualiza la tabla `whatsapp_templates`. Requiere usuario autenticado con rol `ceo` o `admin`.

### `POST /api/cron/whatsapp-templates-sync`

Endpoint para ejecucion automatizada diaria del mismo sync de plantillas. Autenticacion por firma QStash (`Upstash-Signature`) o `Authorization: Bearer <CRON_SECRET>`.

## Registro de salientes

Los helpers de envio de WhatsApp aceptan `options.trace`. Cuando se informa, el envio exitoso crea `WHATSAPP_ENVIADO` con:

- `messageId` devuelto por Meta, si existe.
- `messageType`: `text`, `template`, `interactive` o `document`.
- `source` y `kind` del flujo que envio el mensaje.
- `correlationId` / `causationId`, si el caller los proporciona.

Los eventos tecnicos de escalado (`kind/type = escalation_requested`) se conservan en Event Store para auditoria, pero no se renderizan dentro del transcript de chat para evitar ruido no conversacional.

La escritura del evento es idempotente por `messageId` dentro de la conversacion. Si el registro falla despues de enviar a Meta, se loguea el error para evitar reintentos que dupliquen mensajes reales al cliente.

## Como probar

- Tests unitarios de normalizacion: `npm test -- lib/conversations/__tests__/normalize.test.ts`.
- Tests unitarios de render de plantillas: `npm test -- lib/whatsapp/templates/__tests__/render.test.ts`.
- Sincronizar plantillas en entorno configurado: `npm run whatsapp:templates:sync`.
- Probar cron de plantillas: `curl -X POST "$APP_URL/api/cron/whatsapp-templates-sync" -H "Authorization: Bearer $CRON_SECRET"`.
- Revision manual: abrir `/platform/conversaciones` con una sesion autenticada y verificar lista, filtros y transcript.
- Para validar una conversacion concreta, consultar `GET /api/conversations/{waId}` desde la sesion de plataforma.

