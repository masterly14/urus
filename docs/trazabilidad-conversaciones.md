# Trazabilidad de conversaciones

La sección `/platform/conversaciones` permite revisar, en modo solo lectura, las conversaciones de WhatsApp guardadas en Neon. Su objetivo es que el equipo pueda auditar qué mensajes recibió el sistema, qué respuestas emitió y cuándo intervino la IA, antes de escalar el uso con clientes reales.

La fuente de verdad es el Event Store. Los mensajes entrantes se leen desde eventos `WHATSAPP_RECIBIDO` y los salientes desde `WHATSAPP_ENVIADO`, siempre bajo `aggregateType = WHATSAPP_CONVERSATION` y `aggregateId = waId`.

Cada conversacion se enriquece con el mejor contexto disponible para evitar que el equipo vea solo numeros de telefono:

- `WhatsAppBuyerSession` para resolver `demandId`, `selectionId` y fase conversacional.
- `DemandCurrent` / `DemandSnapshot` para mostrar nombre de demanda, telefono, agente y codigo.
- `MicrositeSelection` para conversaciones de compradores que vienen de un microsite.
- `VisitSchedulingSession` para distinguir comprador en visita y comercial en visita.
- `Comercial` para identificar conversaciones internas de comerciales.
- `PostventaSurveySession` y `ParteVisitaSession` como fallback de nombre/operacion cuando no hay demanda enlazada.

## Alcance y privacidad

- Incluye conversaciones operativas y comerciales de WhatsApp.
- Es visible para cualquier usuario autenticado de la plataforma.
- No incluye `MENTAL_CONVERSATION` ni mensajes del bot de soporte mental.
- La pantalla no permite responder mensajes; solo consulta trazabilidad.
- Los mensajes salientes históricos que no fueron registrados en Neon no se reconstruyen desde Meta.

## Archivos principales

- `lib/conversations/normalize.ts`: normaliza payloads heterogeneos de WhatsApp a mensajes renderizables.
- `lib/conversations/queries.ts`: lista conversaciones y recupera transcripts desde `events`.
- `lib/conversations/types.ts`: define los campos de relacion visibles en la UI (`ownerName`, `relationLabel`, `demandName`, `commercialName`, etc.).
- `app/api/conversations/route.ts`: API autenticada para listar conversaciones.
- `app/api/conversations/[waId]/route.ts`: API autenticada para consultar una conversacion.
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

## Registro de salientes

Los helpers de envio de WhatsApp aceptan `options.trace`. Cuando se informa, el envio exitoso crea `WHATSAPP_ENVIADO` con:

- `messageId` devuelto por Meta, si existe.
- `messageType`: `text`, `template`, `interactive` o `document`.
- `source` y `kind` del flujo que envio el mensaje.
- `correlationId` / `causationId`, si el caller los proporciona.

La escritura del evento es idempotente por `messageId` dentro de la conversacion. Si el registro falla despues de enviar a Meta, se loguea el error para evitar reintentos que dupliquen mensajes reales al cliente.

## Como probar

- Tests unitarios de normalizacion: `npm test -- lib/conversations/__tests__/normalize.test.ts`.
- Revision manual: abrir `/platform/conversaciones` con una sesion autenticada y verificar lista, filtros y transcript.
- Para validar una conversacion concreta, consultar `GET /api/conversations/{waId}` desde la sesion de plataforma.

