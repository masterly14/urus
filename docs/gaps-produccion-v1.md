# Gaps de Producción v1 — Urus Capital

> Documento generado a partir de análisis de código + lógica de negocio inmobiliario.
> Cada gap incluye: descripción del problema, impacto en el día a día, referencias a código, y propuesta de resolución.
> Prioridad: 🔴 Crítica · 🟡 Alta · 🟢 Media

---

## Índice

| # | Gap | Prioridad | Fase |
|---|-----|-----------|------|
| 1 | [Egestion inversa zonas/coordenadas Inmovilla](#gap-1) | 🟢 | Captación |
| 2 | [Guardia horaria de envío de mensajes](#gap-2) | 🟡 | Matching |
| 3 | [Botón "Dar de baja" en plantilla match](#gap-3) | 🟡 | Matching |
| 4 | [NLU limitado — mensajes que no llegan a procesarse](#gap-4) | 🔴 | Conversación |
| 5 | [Canales invisibles (llamadas, email, presencial)](#gap-5) | 🟡 | Conversación |
| 6 | [Estados zombie — visitas sobre propiedad vendida/eliminada](#gap-6) | 🔴 | Visitas |
| 7 | [No-show sin detección automática](#gap-7) | 🟡 | Visitas |
| 8 | [Panel admin — comerciales sin calendario conectado](#gap-8) | 🟡 | Visitas |
| 9 | [Salvaguarda doble operación sobre misma propiedad](#gap-9) | 🔴 | Cierre |
| 10 | [Panel de jobs fallidos / mensajes no enviados](#gap-10) | 🟡 | Operaciones |

---

<a id="gap-1"></a>
## GAP 1 — Egestion inversa zonas/coordenadas Inmovilla 🟢

### Descripción del problema

Cuando el NLU ajusta la demanda del comprador (evento `DEMANDA_ACTUALIZADA`), el handler
`write-demand-update-handler.ts` encola un job `WRITE_TO_INMOVILLA` con operación
`updateDemandCriteria` que escribe campos simples (precio, habitaciones, metros, tipos).

Para **zonas**, el sistema envía un string plano (`"Chamberí, Centro"`) al campo `zonas` de
Inmovilla. Sin embargo, las zonas en Inmovilla no son strings — son **polígonos geográficos**
codificados en el campo `selpoli` como coordenadas `lat lng,lat lng,...` con metadatos en
bloques `{pol_data}<base64 JSON>`. El campo `zonas` es derivado / auxiliar y Inmovilla puede
ignorarlo o sobrescribirlo al siguiente guardado manual.

### Impacto en el día a día

- El comercial abre la ficha en Inmovilla y ve las zonas originales (polígonos), no las que
  el comprador pidió por WhatsApp. Dos fuentes de verdad divergen.
- Si el comercial guarda la ficha en Inmovilla, el campo `zonas` se recalcula desde `selpoli`
  y la actualización del NLU se pierde.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/inmovilla/api/ficha-demanda.ts` | 49–93 | `parseSelpoliAreas`: decodifica base64 `{pol_data}` → `SelpoliArea[]` |
| `lib/inmovilla/api/ficha-demanda.ts` | 95–111 | `buildZonasFromAreas`: convierte áreas en string comma-separated |
| `lib/inmovilla/api/demands.ts` | 107–125 | Enrichment: merge ficha zones en demand si `zonas` vacío |
| `lib/inmovilla/write/operation-registry.ts` | 166–220 | `updateDemandCriteria`: envía `body["zonas"]` como string plano |
| `lib/workers/consumer/write-demand-update-handler.ts` | 112–154 | Builder del patch NLU → `zonas` string |
| `lib/inmovilla/write/verify.ts` | 44–68 | `verifyDemandCriteria`: **no verifica `zonas`**, solo `presupuestoMax` |

### Desafío técnico

El polígono `selpoli` usa un formato propietario:
- Coordenadas: `lat lng,lat lng,...` (separadas por coma, lat/lng por espacio)
- Metadatos por área: `{pol_data}` seguido de JSON en base64 con `nombre`, `nombrePadre`, `latitud`, `longitud`, etc.
- El endpoint `guardar.php` espera `selpoli-selpoli` con este formato exacto.

Para hacer egestion inversa real, habría que:
1. Geocodificar el nombre de zona a coordenadas (API externa como Google Geocoding / Nominatim)
2. Construir un polígono válido en el formato `selpoli`
3. Codificar los metadatos en base64
4. Enviar al endpoint junto con los campos `centrolatitud`, `centroaltitud`, `zoom`

### Propuesta

**Fase de análisis (no implementar aún)**: documentar el formato completo de `selpoli` con
ejemplos reales (capturar requests del frontend de Inmovilla con DevTools), evaluar si la API
de guardado acepta `zonas` sin `selpoli` de forma estable, y definir si es viable para v2.

---

<a id="gap-2"></a>
## GAP 2 — Guardia horaria de envío de mensajes 🟡

### Descripción del problema

No existe ninguna restricción de horario en el envío de mensajes WhatsApp. Un match generado
a las 23:45 dispara `SEND_WHATSAPP_MATCH` inmediatamente, y la plantilla Meta llega al
comprador de madrugada.

### Impacto en el día a día

- Quejas de compradores por mensajes fuera de horario.
- Percepción de spam automatizado, no de servicio profesional.
- Riesgo de bloqueo del número por parte de Meta si los compradores reportan mensajes.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/whatsapp/send.ts` | 190–208 | `sendMatchNotification`: envía directamente sin check de hora |
| `lib/whatsapp/send.ts` | 30–32 | `shouldSendWhatsAppToCommercials`: flag on/off, no ventana horaria |
| `lib/workers/consumer/match-generado-handler.ts` | 164–192 | `handleSendWhatsAppMatch`: ejecuta `sendMatchNotification` sin guardia |
| `app/api/matching/cruces/[id]/send/route.ts` | 80–92 | Envío manual: tampoco tiene guardia (pero es decisión del comercial) |
| `lib/job-queue/job-queue.ts` | 17–23 | `computeBackoffMs`: backoff de retry, no scheduling temporal |

### Propuesta

Implementar una función `isWithinSendingWindow(timezone?: string)` que valide contra una
ventana configurable (default: 09:00–21:00 hora local). Aplicarla en dos puntos:

1. **`handleSendWhatsAppMatch`** (envío automático): si fuera de ventana, recalcular
   `availableAt` del job para la próxima apertura de ventana (ej: si son las 23:00,
   programar para las 09:00 del día siguiente).
2. **`enqueueJob` en `match-generado-handler.ts`** (notificación al comprador): mismo
   tratamiento.

El envío manual desde la UI (`/api/matching/cruces/:id/send`) puede mantener envío inmediato
(el comercial decide conscientemente).

Variables de entorno propuestas:
```
WHATSAPP_SEND_WINDOW_START=09:00
WHATSAPP_SEND_WINDOW_END=21:00
WHATSAPP_SEND_WINDOW_TIMEZONE=Europe/Madrid
```

---

<a id="gap-3"></a>
## GAP 3 — Botón "Dar de baja" en plantilla match 🟡

### Descripción del problema

La plantilla Meta `match` tiene 3 quick replies (`Me encaja`, `No me encaja`,
`Busco algo diferente`). No existe opción para que el comprador se dé de baja.

Si el comprador ya no busca propiedad o no quiere recibir más mensajes, debe escribir
texto libre que probablemente el NLU no clasifique como "baja", y seguirá recibiendo
mensajes de futuros matches.

### Impacto en el día a día

- Compradores que ya compraron o desistieron siguen recibiendo propuestas.
- Riesgo GDPR: no hay mecanismo explícito de opt-out accesible al usuario final.
- Reportes de spam en Meta → afecta calidad del número de WhatsApp Business.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/whatsapp/send.ts` | 49–66 | `WHATSAPP_TEMPLATES`: registro de plantillas, `MATCH` tiene 2 vars |
| `lib/whatsapp/send.ts` | 190–208 | `sendMatchNotification`: construye template con body params solamente |
| `components/matching/whatsapp-preview.tsx` | 48–71 | Vista previa UI con 3 quick replies |
| `lib/workers/consumer/whatsapp-nlu-handler.ts` | 100–109 | `parseMatchButtonId`: solo parsea `match:<demandId>:<propertyId>:<action>` |

### Propuesta

1. **Crear nueva plantilla Meta** (o versión de `match`) con 4 quick replies: añadir
   `"Dar de baja"` como cuarto botón (Meta permite hasta 3 quick replies por plantilla,
   así que se necesita evaluar si usar un menú interactivo o sustituir uno de los existentes).

   Alternativa: usar el tercer botón como "No me interesa / Darme de baja" y que el handler
   distinga internamente.

2. **Handler en `whatsapp-nlu-handler.ts`**: al recibir el botón de baja:
   - Emitir evento `DEMANDA_BAJA_SOLICITADA`
   - Actualizar `demandCurrent.leadStatus` → `BAJA`
   - Opcional: escribir a Inmovilla el cambio de estado de la demanda
   - Responder al comprador con confirmación

3. **Filtro en matching**: excluir demandas con `leadStatus = BAJA` del motor de cruces.

---

<a id="gap-4"></a>
## GAP 4 — NLU limitado — mensajes que no llegan a procesarse 🔴

### Descripción del problema

Este es el gap de **mayor prioridad**. Hay dos problemas distintos que se retroalimentan:

1. **La plantilla de match usa quick replies** que fuerzan respuestas cerradas (3 botones).
   El comprador que quiere decir algo distinto ("¿tiene garaje?", "depende de la hipoteca")
   no tiene forma natural de hacerlo, y si escribe texto libre, el sistema lo fuerza en un
   clasificador ternario que no lo entiende.

2. **El agente conversacional ya existe y resuelve esto**, pero está apagado
   (`CONVERSATIONAL_AGENT_ENABLED=false`). Tiene tools para: clasificar feedback, registrar
   selección, actualizar demanda, pedir más opciones, iniciar visita, consultar detalles de
   propiedad, y escalar al comercial. Responde en lenguaje natural. Se procesa inline (< 25s).
   Pero hoy hay caminos de pérdida de mensajes que impiden que llegue a activarse.

#### Caminos donde el mensaje se pierde (hoy)

| Condición | Archivo:Línea | Resultado | Llega al agente |
|-----------|---------------|-----------|-----------------|
| Sin texto (imagen, audio, sticker) | `whatsapp-nlu-handler.ts:503` | Log no-op | ❌ |
| Sin `demandId` resolvible | `whatsapp-nlu-handler.ts:563` | Mensaje genérico marketing | ❌ |
| NLU falla (timeout LLM) | `whatsapp-nlu-handler.ts:636` | "Reformular" al comprador | ❌ |
| Intent ambiguo / `propertyFeedback: []` | `nlu-graph.ts:57–62` | Cero acciones | ❌ |
| `CONVERSATIONAL_AGENT_ENABLED=false` | `inline-processor.ts:177` | No se clasifica como Categoría A | ❌ |
| Sin `whatsAppBuyerSession.demandId` | `inline-processor.ts:182` | Inline devuelve `null` | ❌ |

### Lo que YA existe y funciona

El agente conversacional (`conversational-handler.ts` + `conversational-graph.ts`) es un
agente ReAct con LangGraph que:

| Componente | Archivo | Qué hace |
|------------|---------|----------|
| Grafo ReAct | `lib/agents/conversational-graph.ts` | Loop de hasta 3 rondas de tool calls con gpt-5.4-mini |
| System prompt | `lib/agents/conversational-prompt.ts` | Prompt dinámico con propiedades, historial, fase, reglas |
| 7 tools | `lib/agents/conversational-tools.ts` | `classify_feedback`, `emit_selection_feedback`, `update_demand`, `request_more_options`, `initiate_visit`, `get_property_details`, `escalate_to_human` |
| Fases | `lib/agents/conversational-agent-types.ts` | `INITIAL_CONTACT`, `REVIEWING_OPTIONS`, `GIVING_FEEDBACK`, `SCHEDULING_VISIT`, `IDLE_FOLLOWUP` |
| Handler | `lib/workers/consumer/conversational-handler.ts` | Carga contexto, ejecuta agente, envía respuesta, registra evento, actualiza sesión |
| Inline processing | `lib/whatsapp/inline-processor.ts:239–250` | Se ejecuta dentro del request del webhook (< 25s) |

El agente ya sabe manejar: preguntas sobre propiedades, ajustes de demanda, peticiones de
visita, saludos, agradecimientos, meta-preguntas, y escala al comercial cuando no puede
resolver. No necesita nuevos intents ni estados — es texto libre con tools.

### Plan de implementación

#### Decisiones de diseño

1. **No hay quick reply buttons.** La plantilla de match pasa a ser solo texto con un CTA
   tipo "¿Cuál es la propiedad que más te encaja?" que invite al comprador a escribir
   libremente. Esto elimina la restricción de los 3 botones y abre la conversación.

2. **Todo mensaje del comprador se procesa en tiempo real (inline).** El procesamiento no
   pasa por el Worker/consumer — se resuelve dentro del request del webhook vía
   `tryInlineProcessing` con timeout de 25s. Si el inline falla, el consumer actúa como
   fallback.

3. **El agente conversacional es el handler principal.** Se activa `CONVERSATIONAL_AGENT_ENABLED=true`.
   Las tools del agente (`emit_selection_feedback`, `update_demand`, `initiate_visit`) ya
   disparan los mismos eventos y jobs que el NLU clásico (`SELECCION_COMPRADOR`,
   `DEMANDA_ACTUALIZADA`, `GENERATE_MICROSITE`, visitas). No se pierde funcionalidad.

4. **No se modelan intents nuevos ni estados adicionales.** El LLM con tools es el
   clasificador. Si el comprador dice "depende de la hipoteca", el agente responde con
   empatía y pregunta si quiere seguir viendo opciones. Si dice "¿tiene garaje?", usa
   `get_property_details`. Si dice "quiero verla", usa `initiate_visit`. No hace falta
   una taxonomía cerrada.

#### Paso 1 — Adaptar plantilla de match (texto libre, sin botones)

**Archivos a modificar:**

| Archivo | Cambio |
|---------|--------|
| `lib/whatsapp/send.ts` | `sendMatchNotification`: la plantilla Meta debe cambiar de `match` (con quick replies) a una nueva versión solo con body text. Si no se puede modificar la plantilla en Meta sin romper la aprobación, crear una nueva (`match_v2`) y actualizar `WHATSAPP_TEMPLATES.MATCH`. |
| `components/matching/whatsapp-preview.tsx` | Actualizar la vista previa para reflejar el nuevo formato sin botones, con CTA de texto. |
| `.env.example` | Documentar `WHATSAPP_TEMPLATE_MATCH=match_v2` si se crea plantilla nueva. |

**Texto propuesto para la plantilla:**

```
Hola {{1}}, somos Urus Capital Group.

Hemos captado una nueva propiedad que encaja con lo que buscabas.

Ver inmueble: {{2}}

¿Qué te parece? ¿Es el tipo de propiedad que buscas?
```

Sin quick replies. El CTA es la pregunta abierta final que invita a responder con texto
libre.

**Impacto en Meta Business Manager:**
- Crear plantilla `match_v2` con categoría `MARKETING`, idioma `es`, 2 variables body.
- Esperar aprobación (típicamente < 24h).
- Dejar `match` original activa como fallback configurable.

#### Paso 2 — Activar agente conversacional y cerrar caminos de pérdida

**Archivos a modificar:**

| Archivo | Cambio |
|---------|--------|
| `.env` / `.env.example` | `CONVERSATIONAL_AGENT_ENABLED=true` |
| `lib/whatsapp/inline-processor.ts:150–187` | `classifyCategory`: ampliar la condición del `conversational-agent` para que no dependa **solo** de `whatsAppBuyerSession.demandId`. Si no hay sesión pero hay `demandId` resoluble por otros caminos (reply context, match button), crear la sesión on-the-fly. |
| `lib/whatsapp/inline-processor.ts:105–107` | Para mensajes sin texto (imagen, audio): en lugar de `{ processed: false }`, intentar responder con texto genérico vía el agente ("He recibido tu mensaje, pero solo puedo leer texto por ahora. ¿Puedes escribirme lo que necesitas?") y marcar como `processed: true`. |

**Detalle del cambio en `classifyCategory`:**

Hoy la condición es:
```typescript
if (process.env.CONVERSATIONAL_AGENT_ENABLED === "true") {
  const buyerSession = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId },
    select: { demandId: true, selectionId: true },
  });
  if (buyerSession?.demandId) {
    return { handler: "conversational-agent" };
  }
}
```

Debe ampliarse a:
```typescript
if (process.env.CONVERSATIONAL_AGENT_ENABLED === "true") {
  const buyerSession = await prisma.whatsAppBuyerSession.findUnique({
    where: { waId },
    select: { demandId: true, selectionId: true },
  });
  if (buyerSession?.demandId) {
    return { handler: "conversational-agent" };
  }

  // Fallback: intentar resolver demandId desde reply context o match button
  const demandId = await tryResolveDemandId(waId, payload);
  if (demandId) {
    // Crear sesión on-the-fly para que el handler la encuentre
    await prisma.whatsAppBuyerSession.upsert({
      where: { waId },
      create: { waId, demandId, lastMessageAt: new Date(), turnCount: 0 },
      update: { demandId },
    });
    return { handler: "conversational-agent" };
  }
}
```

Donde `tryResolveDemandId` encapsula la lógica que hoy está dispersa en
`whatsapp-nlu-handler.ts` (parse match button, reply context, resolve from session).

#### Paso 3 — Garantizar que el consumer no duplique procesamiento

Hoy el consumer (`whatsapp-nlu-handler.ts`) corre como fallback si el inline falla o si
el mensaje no es Categoría A. Con el agente activado, el flujo es:

```
Webhook POST
  → appendEvent(WHATSAPP_RECIBIDO)
  → tryInlineProcessing()
    → classifyCategory()
      → "conversational-agent" (si hay demandId resoluble)
    → executeInline()
      → handleConversationalFlow()
        → runConversationalAgent() [LLM + tools]
        → sendTextMessage() [respuesta al comprador]
        → appendEvent(WHATSAPP_ENVIADO)
        → upsert whatsAppBuyerSession
    → return { processed: true }
  → NO encola PROCESS_EVENT (el webhook lo skipea)
```

Si el inline falla (timeout, error LLM), se encola `PROCESS_EVENT` y el consumer ejecuta
`handleWhatsAppRecibido`. El guard existente (línea 484) detecta si ya se procesó inline
(busca `WHATSAPP_ENVIADO` con `causationId = event.id`) y hace skip. Esto ya funciona.

**Caso sin `demandId` resolvible (ni inline ni consumer):**

Hoy se envía un mensaje genérico de marketing. Con el agente activo, este caso sigue
igual — pero hay que **notificar al comercial** de que un número desconocido escribió.
Esto se resuelve añadiendo después del `sendTextMessage(waId, GENERIC_MARKETING_MESSAGE)`:

```typescript
await emitManagementAlert({
  source: "whatsapp-nlu",
  severity: "info",
  title: "Mensaje de comprador sin demanda asociada",
  description: `waId=${waId} escribió "${messageText.slice(0, 100)}" pero no tiene demanda resolvible.`,
});
```

#### Paso 4 — Actualizar UI de cruces (vista previa)

La vista previa en `components/matching/whatsapp-preview.tsx` ya se actualizó para mostrar
la plantilla real con quick replies. Hay que ajustarla de nuevo para reflejar el formato
de texto libre.

#### Verificación / Testing

| Qué verificar | Cómo |
|----------------|------|
| Comprador responde texto libre → agente responde | Script `scripts/test-nlu-microsite/` con `CONVERSATIONAL_AGENT_ENABLED=true` |
| Comprador dice "quiero verla" → visita se inicia | Verificar que `initiate_visit` tool se invoca y `VisitSchedulingSession` se crea |
| Comprador dice "busco más barato" → demanda se actualiza | Verificar evento `DEMANDA_ACTUALIZADA` + job `WRITE_TO_INMOVILLA` |
| Comprador sin demandId → marketing + alerta admin | Verificar que `emitManagementAlert` se dispara |
| Timeout de LLM → fallback al consumer | Simular timeout, verificar que `PROCESS_EVENT` se encola |
| Inline < 25s → no se encola job | Medir `elapsedMs` en logs, confirmar que no hay `PROCESS_EVENT` |

### Resumen de esfuerzo

| Paso | Esfuerzo | Dependencia |
|------|----------|-------------|
| 1. Plantilla Meta sin botones | 0.5 día código + esperar aprobación Meta (< 24h) | Ninguna |
| 2. Activar agente + cerrar pérdidas | 1–2 días | Ninguna (el agente ya existe) |
| 3. Garantizar no-duplicación consumer | 0.5 día (ya funciona, solo verificar) | Paso 2 |
| 4. UI vista previa | 0.5 día | Paso 1 |
| **Total** | **2.5–3.5 días** | — |

---

<a id="gap-5"></a>
## GAP 5 — Canales invisibles (llamadas, email, presencial) 🟡

### Descripción del problema

Todo lo que ocurre fuera de WhatsApp no queda registrado en el Event Store. El comercial
habla 30 minutos por teléfono con el comprador, acuerda una visita, y el sistema:
- Sigue mandando recordatorios como si el lead estuviera mudo
- Muestra un timeline vacío para ese comprador
- El NLU desconoce el contexto de la llamada

### Impacto en el día a día

- Doble comunicación: el sistema manda un mensaje automatizado 5 minutos después de
  que el comercial ya cerró todo por teléfono.
- El CEO ve métricas de conversión que no reflejan la realidad (leads "sin contacto"
  que en realidad ya están avanzados).
- Al cambiar de comercial, se pierde todo el contexto no registrado.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/workers/consumer/whatsapp-nlu-handler.ts` | 315–364 | `loadConversationHistory`: solo carga `WHATSAPP_RECIBIDO` y `WHATSAPP_ENVIADO` |
| `lib/agents/nlu-graph.ts` | toda | NLU solo recibe `conversationHistory` de WhatsApp |
| `prisma/schema.prisma` | Event model | `aggregateType` no incluye `PHONE_CALL` ni `EMAIL` |

### Propuesta de modelado

**Opción A — Registro manual ligero (recomendada para v1)**:
- Añadir en la UI del comercial un botón "Registrar contacto" con campos:
  - Canal: `llamada` / `email` / `presencial` / `otro`
  - Resumen libre (texto, 1–2 líneas)
  - Resultado: `interesado` / `no interesado` / `aplazado` / `información dada`
- Persiste como evento `CONTACTO_MANUAL_REGISTRADO` en el Event Store con
  `aggregateType: "DEMAND"`.
- El NLU incluye estos eventos en `conversationHistory` para dar contexto.
- Los recordatorios automáticos consultan si hay contacto reciente (cualquier canal)
  antes de disparar.

**Opción B — Integración telefónica (v2+)**:
- Integrar con proveedor VoIP (Aircall, Ringover) para capturar llamadas automáticamente.
- Transcripción con Whisper → resumen → evento.

---

<a id="gap-6"></a>
## GAP 6 — Estados zombie: visitas sobre propiedad vendida/eliminada 🔴

### Descripción del problema

Cuando una propiedad cambia a "Vendida" o es eliminada en Inmovilla, el sistema:
- Actualiza la proyección (`UPDATE_PROPERTY_PROJECTION`)
- Re-evalúa cobertura de demandas (`EVALUATE_DEMAND_COVERAGE`)
- Genera borrador de contrato si es reserva/arras
- Inicia cadencia post-venta si es cierre

Pero **no cancela sesiones de visita activas** sobre esa propiedad. La
`cancelVisitAtomically` existe pero nadie la invoca desde `PROPIEDAD_ELIMINADA`
ni `ESTADO_CAMBIADO`.

### Impacto en el día a día

- El comprador recibe un recordatorio de visita para una casa que ya está vendida.
- El comercial queda como desorganizado ante el comprador.
- Slots del calendario del comercial quedan bloqueados innecesariamente.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/workers/consumer/handlers.ts` | 142–196 | `handlePropertyRemovedWithCoverage`: projection + coverage, **sin cancelar visitas** |
| `lib/workers/consumer/smart-closing-handler.ts` | 178–369 | `handleEstadoCambiado`: smart closing + post-venta, **sin cancelar visitas** |
| `lib/visit-scheduling/confirm-visit.ts` | 128–179 | `cancelVisitAtomically`: existe, funcional, pero **no invocada desde estos handlers** |
| `lib/visit-scheduling/session-manager.ts` | 50–63 | `createSession`: filtra por `TERMINAL_STATES`, no por estado de propiedad |
| `lib/visit-scheduling/constants.ts` | 110–137 | Transiciones + terminales: `VISIT_CANCELLED` es terminal válido |

### Propuesta

Añadir en `handlePropertyRemovedWithCoverage` y en `handleEstadoCambiado` (rama de cierre):

```typescript
// Cancelar sesiones de visita activas sobre esta propiedad
const activeSessions = await prisma.visitSchedulingSession.findMany({
  where: {
    propertyCode,
    state: { notIn: TERMINAL_STATES },
  },
  select: { id: true, buyerWaId: true },
});

for (const session of activeSessions) {
  try {
    await cancelVisitAtomically(session.id);
    // Notificar al comprador
    await sendTextMessage(
      session.buyerWaId,
      "La propiedad que ibas a visitar ya no está disponible. Te avisaremos cuando tengamos alternativas."
    );
    console.log(`[consumer] Visita cancelada sessionId=${session.id} — propiedad ${propertyCode} no disponible`);
  } catch (err) {
    console.error(`[consumer] Error cancelando visita ${session.id}: ${err}`);
  }
}
```

Emisión de evento `VISITA_CANCELADA` con causa `"propiedad_no_disponible"` para trazabilidad.

---

<a id="gap-7"></a>
## GAP 7 — No-show sin detección automática 🟡

### Descripción del problema

Una vez confirmada la visita (`VISIT_CONFIRMED`), el sistema no tiene mecanismo para
detectar que la visita no se realizó. Depende de que el comercial marque manualmente
el resultado.

### Impacto en el día a día

- Leads que no aparecieron a la visita no se re-trabajan automáticamente.
- El sistema asume que toda visita confirmada se completó eventualmente.
- Métricas de conversión infladas (visitas "confirmadas" que nunca ocurrieron).

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/visit-scheduling/constants.ts` | 110–129 | Desde `VISIT_CONFIRMED` solo puede ir a `COMPLETED`, `CANCELLED` o `RESCHEDULED` |
| `lib/workers/consumer/visit-scheduling-event-handlers.ts` | 110–121 | `VISITA_DATOS_RECOPILADOS` → `VISITA_REALIZADA` (requiere trigger externo) |
| `lib/visit-scheduling/session-manager.ts` | 23–38 | `deadlineForState`: **no tiene deadline para `VISIT_CONFIRMED`** |

### Propuesta

1. **Añadir estado `VISIT_NO_SHOW`** al enum `VisitSessionState` y a `TERMINAL_STATES`.
2. **Deadline en `VISIT_CONFIRMED`**: si la fecha/hora de la visita + 2h pasan sin
   transición a `COMPLETED`, un cron/scanner marca como `VISIT_NO_SHOW`.
3. **Handler de `VISIT_NO_SHOW`**:
   - Notificar al comercial: "¿El comprador X asistió a la visita?"
   - Si no responde en 24h, marcar como no-show definitivo.
   - `updateDemandLeadStatus` → `PERDIDO` o `CONTACTADO` según política.
4. **Cron**: `POST /api/cron/visit-no-show-scan` que busque sesiones en `VISIT_CONFIRMED`
   cuya fecha de visita ya pasó.

---

<a id="gap-8"></a>
## GAP 8 — Panel admin: comerciales sin calendario conectado 🟡

### Descripción del problema

Cuando un comercial no tiene `composioConnectionId` (calendario no conectado), el
flujo de agendamiento de visitas falla silenciosamente con `ComposioNotConnectedError`.
El admin no tiene visibilidad de qué comerciales están en esta situación.

### Impacto en el día a día

- Compradores que dicen "me encaja" no reciben propuesta de visita → se enfrían.
- El comercial no sabe que el sistema intentó agendar y falló.
- El admin descubre el problema cuando un comprador se queja.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/visit-scheduling/orchestrator.ts` | 92–96 | `throw new ComposioNotConnectedError(comercial.id)` |
| `lib/visit-scheduling/types.ts` | 168–175 | Definición del error |
| `lib/workers/consumer/whatsapp-nlu-handler.ts` | 750–754 | Catch: solo `console.warn`, sin acción |
| `lib/workers/consumer/seleccion-comprador-handler.ts` | 113–117 | Catch: solo `console.warn`, sin acción |
| `components/configuracion/calendar-connection.tsx` | 57–61 | UI per-comercial en Configuración (solo para el propio comercial) |

### Propuesta

1. **Panel admin** en `/platform/configuracion` (tab Health o nueva tab "Equipo"):
   - Query: `SELECT * FROM comerciales WHERE composioConnectionId IS NULL`
   - Mostrar tabla con nombre, teléfono, y estado del calendario.
   - Badge de alerta si hay comerciales con propiedades asignadas sin calendario.

2. **Notificación proactiva**: cuando `ComposioNotConnectedError` se lanza, emitir
   alerta de management (`emitManagementAlert`) con `severity: "warning"` indicando
   qué comercial y qué propiedad/demanda se vieron afectadas.

---

<a id="gap-9"></a>
## GAP 9 — Salvaguarda doble operación sobre misma propiedad 🔴

### Descripción del problema

`resolveOrCreateOperacion` busca una operación abierta por `propertyCode` y la reutiliza.
Pero si dos compradores distintos pasan por matching, dicen "me encaja", y avanzan
simultáneamente, el sistema puede:

1. Crear una operación para el primer comprador (reserva).
2. Al llegar el segundo `ESTADO_CAMBIADO`, reutilizar la misma operación (que ya tiene
   `demandId` del primer comprador) o crear una segunda si la primera ya está cerrada.

No hay un check explícito de "esta propiedad ya tiene un comprador en proceso de reserva/arras,
rechazar o poner en espera al segundo".

### Impacto en el día a día

- Dos compradores pueden creer que tienen la propiedad reservada.
- Dos borradores de contrato podrían generarse para la misma propiedad con diferentes compradores.
- Situación legal y reputacional grave.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/workers/consumer/smart-closing-handler.ts` | 65–78 | `resolveOrCreateOperacion`: busca open operación por `propertyCode`, pero **no valida `demandId`** |
| `lib/workers/consumer/smart-closing-handler.ts` | 199–224 | Smart closing: usa operación existente sin verificar si es del mismo comprador |
| `lib/workers/consumer/contract-draft-handler.ts` | 130–148 | Upsert por `operationId_documentKind`: **sobrescribe** si ya existe |
| `lib/visit-scheduling/confirm-visit.ts` | 38–115 | `MAX_CONCURRENT_VISITS_PER_PROPERTY`: limita visitas confirmadas, no contratos |

### Propuesta

1. **Check en `resolveOrCreateOperacion`**: si la operación existente tiene `demandId ≠ null`
   y el nuevo `ESTADO_CAMBIADO` trae un `demandId` diferente (resoluble desde el match o
   la demanda asociada), emitir alerta `CONFLICTO_DOBLE_RESERVA` y **no generar borrador
   automáticamente**.

2. **Notificación al admin/CEO**: "La propiedad X tiene una reserva activa para Comprador A,
   pero se detectó intención de reserva de Comprador B. Requiere intervención manual."

3. **Estado en operación**: añadir campo `exclusiva: boolean` que, cuando `true`, bloquee
   la creación de una segunda operación sobre la misma propiedad.

---

<a id="gap-10"></a>
## GAP 10 — Panel de jobs fallidos / mensajes no enviados 🟡

### Descripción del problema

Existe un panel básico en **Configuración → Health** que muestra los últimos 5 errores
de la job queue. Sin embargo:
- Solo muestra 5 errores (hardcoded `RECENT_ERRORS_LIMIT`).
- No distingue entre tipos de fallo (WhatsApp rechazado vs error de red vs plantilla expirada).
- No permite reintentar manualmente un job fallido.
- No muestra el contexto del comprador afectado.
- Los jobs en `DEAD_LETTER` no tienen acción posible desde la UI.

### Impacto en el día a día

- Un WhatsApp que no se envió por plantilla expirada queda invisible para el comercial.
- El comercial cree que el comprador no respondió, cuando en realidad nunca recibió el mensaje.
- Acumulación de dead-letter sin que nadie los revise.

### Referencias a código

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `lib/workers/status.ts` | 235–248 | `getRecentErrors`: query FAILED/DEAD_LETTER, **limit 5** |
| `app/platform/configuracion/page.tsx` | 251–263 | Card "Errores / DLQ" con contadores |
| `app/platform/configuracion/page.tsx` | 395–439 | Tabla "Errores recientes" (tipo, error, fecha) |
| `lib/alerts/alert-service.ts` | 63–80 | `alertDeadLetter`: alerta management en DLQ |
| `lib/job-queue/job-queue.ts` | 190–249 | `markFailed`: lógica retry vs DLQ |
| `prisma/schema.prisma` | JobQueue model | Campos disponibles para UI expandida |

### Propuesta

1. **Panel expandido** `/platform/operaciones/jobs` (o tab en Configuración):
   - Tabla paginada con todos los jobs `FAILED` y `DEAD_LETTER`.
   - Filtros por tipo (`SEND_WHATSAPP_MATCH`, `NOTIFY_LEAD_WHATSAPP`, etc.).
   - Columnas: tipo, estado, intentos, error, comprador afectado (extraer de payload),
     fecha, acciones.
   - Acción "Reintentar": resetear job a `PENDING` con `attempts = 0`.
   - Acción "Descartar": marcar como revisado (nuevo campo `reviewedAt`).

2. **Alerta contextual en la UI de cruces**: si un cruce tiene un job `SEND_WHATSAPP_MATCH`
   en `FAILED`/`DEAD_LETTER`, mostrar badge rojo "Error de envío" en la tarjeta del cruce.

3. **Alerta proactiva por WhatsApp al admin**: cuando un job de tipo `SEND_WHATSAPP_*`
   va a DLQ, además del log, enviar notificación al admin con el teléfono/nombre del
   comprador afectado.

---

## Resumen de priorización

### 🔴 Críticos (implementar primero)

| # | Gap | Esfuerzo estimado |
|---|-----|-------------------|
| 4 | NLU limitado — activar agente conversacional + plantilla texto libre | 2.5–3.5 días |
| 6 | Estados zombie — visitas sobre propiedad vendida | 1–2 días |
| 9 | Salvaguarda doble operación | 1–2 días |

### 🟡 Altos (implementar después de críticos)

| # | Gap | Esfuerzo estimado |
|---|-----|-------------------|
| 2 | Guardia horaria de envío | 0.5–1 día |
| 3 | Botón "Dar de baja" | 1–2 días (incluye aprobación Meta) |
| 5 | Canales invisibles (registro manual) | 2–3 días |
| 7 | No-show detección | 1–2 días |
| 8 | Panel comerciales sin calendario | 0.5–1 día |
| 10 | Panel de jobs fallidos | 2–3 días |

### 🟢 Medio (análisis para v2)

| # | Gap | Esfuerzo estimado |
|---|-----|-------------------|
| 1 | Egestion inversa zonas | Análisis: 1 día / Implementación: TBD |
