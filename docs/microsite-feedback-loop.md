# Microsite de Seleccion — Arquitectura y Feedback Loop

## Que es

El microsite es la experiencia publica que ve el comprador cuando Urus Capital le presenta propiedades de mercado que encajan con su demanda. Es una aplicacion Next.js bajo la ruta `/seleccion/{token}` que actua como **portal de marca propia** — el comprador nunca sale del dominio de Urus Capital.

El feedback del comprador llega exclusivamente por WhatsApp. El sistema usa LangGraph con NLU contextual para interpretar texto libre del comprador, resolver a que propiedades se refiere y clasificar sentimiento por propiedad.

## Flujo completo

```
Visita evaluada (interes alto)
  → GENERATE_MICROSITE (job)
    → Statefox API /properties (stock portal)
    → Filtro + scoring + curacion completa
    → Persistencia en MicrositeSelection (JSON con todos los datos)
  → NOTIFY_MICROSITE_PENDING_VALIDATION (WhatsApp al comercial)
    → Comercial revisa en /validar-seleccion/{validationToken}
    → APPROVE → SEND_MICROSITE_TO_BUYER
      → Envia WhatsApp con URL al comprador
      → Persiste WHATSAPP_ENVIADO (WAMID + demandId + selectionId)
      → Crea/actualiza WhatsAppBuyerSession
        → Comprador navega /seleccion/{token}
          → Grid de tarjetas clickeables
          → Click → /seleccion/{token}/propiedad/{propertyId} (detalle completo)
        → Comprador responde por WhatsApp
          → WHATSAPP_RECIBIDO → Handler NLU contextual
            → Resolucion de demandId (session / reply context / boton match)
            → Carga propiedades del microsite activo como contexto
            → Carga historial conversacional
            → classifyBuyerFeedback (LangGraph)
              → propertyFeedback[] → SELECCION_COMPRADOR por propiedad
              → variables → DEMANDA_ACTUALIZADA → projection + Inmovilla + GENERATE_MICROSITE
              → wantsMoreOptions → GENERATE_MICROSITE directo
```

## Estructura de archivos

| Archivo | Funcion |
|---------|---------|
| `lib/microsite/selection.ts` | Generacion de seleccion: query Statefox, filtro, scoring, curacion, persistencia |
| `lib/microsite/constants.ts` | SLA de validacion (2h) |
| `lib/microsite/buyer-phone.ts` | Resolucion de telefono del comprador |
| `lib/microsite/app-url.ts` | URL publica del microsite |
| `lib/microsite/mock-selection.ts` | Datos mock para vista demo |
| `app/seleccion/[token]/page.tsx` | Grid de propiedades (comprador) |
| `app/seleccion/[token]/propiedad/[propertyId]/page.tsx` | Detalle completo de propiedad |
| `app/seleccion/[token]/propiedad/[propertyId]/image-carousel.tsx` | Carrusel de imagenes |
| `app/validar-seleccion/[validationToken]/page.tsx` | Validacion comercial |
| `app/api/seleccion/[token]/feedback/route.ts` | API de feedback HTTP (canal legacy) |
| `lib/agents/nlu-graph.ts` | Grafo LangGraph NLU contextual (2 modos: simple y con propiedades) |
| `lib/agents/types.ts` | Tipos NLU: PropertyFeedbackItem, PropertySummaryForNLU, ConversationTurn |
| `lib/workers/consumer/whatsapp-nlu-handler.ts` | Handler WHATSAPP_RECIBIDO con session + NLU contextual |
| `lib/workers/consumer/seleccion-comprador-handler.ts` | Handler SELECCION_COMPRADOR con upsert feedback |
| `lib/workers/consumer/write-demand-update-handler.ts` | Handler DEMANDA_ACTUALIZADA con regeneracion condicional |
| `lib/workers/consumer/job-handlers.ts` | SEND_MICROSITE_TO_BUYER con WHATSAPP_ENVIADO + session |

## WhatsAppBuyerSession

Tabla Prisma que mantiene el estado de la sesion conversacional del comprador:

- `waId` (unique): telefono WhatsApp del comprador
- `demandId`: demanda activa asociada
- `selectionId` / `selectionToken`: microsite activo
- `turnCount`: numero de mensajes procesados
- `lastMessageAt`: ultimo mensaje
- `summary`: resumen conversacional (para futuro uso con LLM)

Se crea al enviar el microsite al comprador y se actualiza con cada mensaje.

## NLU Contextual (classifyBuyerFeedback)

El agente NLU recibe:
- Texto del mensaje del comprador
- Lista de propiedades del microsite activo (id, titulo, precio, zona, m2, habitaciones, extras)
- Historial de conversacion (ultimos 10 mensajes)

Produce:
- `intention`: ME_ENCAJA / NO_ME_ENCAJA / BUSCO_DIFERENTE
- `propertyFeedback[]`: array de { propertyId, sentiment } por cada propiedad mencionada
- `variables`: ajustes de demanda (precio, zona, metros, tipo, habitaciones)
- `wantsMoreOptions`: true si pide ver mas propiedades

## Eventos emitidos

| Evento | Cuando | Payload clave |
|--------|--------|--------------|
| WHATSAPP_ENVIADO | Al enviar microsite al comprador | messageId (WAMID), demandId, selectionId, kind |
| SELECCION_COMPRADOR | Por cada propiedad con feedback del comprador | demandId, selectionId, propertyId, decision, source.channel |
| DEMANDA_ACTUALIZADA | Cuando hay ajuste de demanda (NO_ME_ENCAJA/BUSCO_DIFERENTE con variables) | source.channel, selectionId, variables, nlu |

## Regeneracion del microsite

Se dispara en dos caminos:
1. **DEMANDA_ACTUALIZADA desde feedback WhatsApp**: el handler de escritura detecta `source.channel === "whatsapp_feedback"` o `source.selectionId` y encola GENERATE_MICROSITE tras la egesion a Inmovilla.
2. **wantsMoreOptions**: el handler de WhatsApp encola GENERATE_MICROSITE directamente cuando el comprador pide mas opciones.

## Variables de entorno

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `STATEFOX_BEARER_TOKEN` | Si (produccion) | Consulta de propiedades de mercado |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Opcional | Mapa estatico en detalle de propiedad |
| `DEMO_UI` | Opcional | Activa vistas demo sin Statefox ni DB |
| `OPENAI_API_KEY` | Si | NLU contextual con LangGraph |

## Test

```bash
npx tsx scripts/test-microsite-curate.ts     # Pipeline de curacion Statefox
npx tsx scripts/test-feedback-loop.ts        # Feedback loop completo
npm test -- seleccion-comprador-handler      # Unit test handler
npm test -- whatsapp-nlu-handler             # Unit test NLU handler
```
