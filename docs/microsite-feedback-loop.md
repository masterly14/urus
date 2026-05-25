# Microsite de Seleccion — Arquitectura y Feedback Loop

## Que es

El microsite es la experiencia publica que ve el comprador cuando Urus Capital le presenta propiedades de mercado que encajan con su demanda. Es una aplicacion Next.js bajo la ruta `/seleccion/{token}` que actua como **portal de marca propia** — el comprador nunca sale del dominio de Urus Capital.

El feedback del comprador llega por **dos canales complementarios**:

- **Boton "Me encaja" en cada ficha del micrositio** (canal canonico para
  expresar interes positivo en una propiedad concreta). Ver `docs/microsite-me-encaja-flow.md`.
- **WhatsApp en texto libre**, procesado por LangGraph con NLU contextual,
  para rechazo de propiedades (`NO_ME_ENCAJA`) y ajuste de demanda
  (`BUSCO_DIFERENTE` + variables). El NLU **ya no infiere interes positivo**:
  si detecta lenguaje de interes positivo en texto libre, redirige al
  comprador al boton de la ficha.

## Flujo completo

```
Visita evaluada (interes alto)
  → GENERATE_MICROSITE (job)
    → Statefox API /properties (stock portal)
    → Filtro + scoring + curacion completa
    → Persistencia en MicrositeSelection (JSON con todos los datos)
  → Aprobacion IA (rebranding + mejora de descripciones)
    → SELECCION_VALIDADA (evento de auditoria)
    → SEND_MICROSITE_TO_BUYER
      → Envia WhatsApp al comprador con la plantilla microsite_listo_comprador
      → Persiste WHATSAPP_ENVIADO (WAMID + demandId + selectionId)
      → Crea/actualiza WhatsAppBuyerSession
        → Comprador navega /seleccion/{token}
          → Grid de tarjetas con boton "Me encaja" por ficha
          → Click "Me encaja" en una ficha (canal canonico de interes positivo):
            → POST /api/seleccion/{token}/feedback con decision=ME_INTERESA
            → SELECCION_COMPRADOR con source.channel="microsite_card"
            → handleSeleccionComprador:
              → leadStatus -> VISITA_PENDIENTE
              → notifyCommercialVisitInterest (paquete al comercial)
              → SEND_BUYER_INTEREST_ACK (plantilla
                microsite_propiedad_me_encaja al comprador)
            → El boton queda permanentemente bloqueado y muestra
              "Ya elegida — un agente te contactara"
          → Click en el resto de la tarjeta abre /seleccion/{token}/propiedad/{propertyId}
            (detalle completo con el mismo boton)
        → Comprador responde por WhatsApp en texto libre
          → WHATSAPP_RECIBIDO → Handler NLU contextual
            → Resolucion de demandId (session / reply context / boton match)
            → Carga propiedades del microsite activo como contexto
            → Carga historial conversacional
            → classifyBuyerFeedback (LangGraph)
              → propertyFeedback[] -> SELECCION_COMPRADOR (solo NO_ME_ENCAJA)
              → variables -> DEMANDA_ACTUALIZADA -> projection + Inmovilla + GENERATE_MICROSITE
              → wantsMoreOptions -> GENERATE_MICROSITE directo
              → Si el comprador expresa interes positivo en texto libre
                (intention=OTRO + senal positiva), el handler responde con
                un texto que invita a pulsar el boton de la ficha
                (sin emitir SELECCION_COMPRADOR / ME_INTERESA).
```

## Estructura de archivos

| Archivo | Funcion |
|---------|---------|
| `lib/microsite/selection.ts` | Generacion de seleccion: query Statefox, filtro, scoring, curacion, persistencia |
| `lib/microsite/approve-by-ai.ts` | Aprobacion automatica IA (descripciones + rebranding + enqueue de envio) |
| `lib/microsite/buyer-phone.ts` | Resolucion de telefono del comprador |
| `lib/microsite/app-url.ts` | URL publica del microsite |
| `lib/microsite/mock-selection.ts` | Datos mock para vista demo |
| `app/seleccion/[token]/page.tsx` | Grid de propiedades (comprador) |
| `app/seleccion/[token]/propiedad/[propertyId]/page.tsx` | Detalle completo de propiedad |
| `app/seleccion/[token]/propiedad/[propertyId]/image-carousel.tsx` | Carrusel de imagenes |
| `app/api/seleccion/[token]/feedback/route.ts` | API de feedback HTTP (canal canonico para `ME_INTERESA` via boton del micrositio; idempotente con 409) |
| `components/seleccion/property-card.tsx` | Tarjeta de propiedad con boton "Me encaja" (Client Component) |
| `components/seleccion/me-encaja-button.tsx` | Boton "Me encaja" reutilizable en la pagina de detalle |
| `lib/workers/consumer/buyer-interest-ack-handler.ts` | Handler `SEND_BUYER_INTEREST_ACK` (acuse al comprador) |
| `lib/agents/nlu-graph.ts` | Grafo LangGraph NLU contextual (2 modos: simple y con propiedades) |
| `lib/agents/types.ts` | Tipos NLU: PropertyFeedbackItem, PropertySummaryForNLU, ConversationTurn |
| `lib/workers/consumer/whatsapp-nlu-handler.ts` | Handler WHATSAPP_RECIBIDO con session + NLU contextual |
| `lib/workers/consumer/seleccion-comprador-handler.ts` | Handler SELECCION_COMPRADOR: persistencia pura de feedback por propiedad |
| `lib/workers/consumer/write-demand-update-handler.ts` | Handler DEMANDA_ACTUALIZADA: projection + Inmovilla (incl. metros) + GENERATE_MICROSITE |
| `lib/workers/consumer/job-handlers.ts` | SEND_MICROSITE_TO_BUYER con WHATSAPP_ENVIADO + session |
| `lib/workers/consumer/__tests__/feedback-loop-e2e.test.ts` | Test E2E determinista del pipeline completo |

### Nota historica

La validacion manual por comercial (`/validar-seleccion/*` + SLA 2h) existio en una etapa previa y fue retirada del runtime. El flujo actual es IA-first y envia siempre al comprador tras aprobacion automatica.

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

Produce (contrato vigente tras el refactor "Me encaja"):
- `intention`: `NO_ME_ENCAJA` / `BUSCO_DIFERENTE` / `OTRO`. **Ya no existe
  `ME_ENCAJA`**: el interes positivo se captura por el boton de la ficha.
- `propertyFeedback[]`: array de `{ propertyId, sentiment }` por cada
  propiedad mencionada. `sentiment` se restringe a `"NO_ME_ENCAJA"`.
- `variables`: ajustes de demanda (precio, zona, metros, tipo, habitaciones)
- `wantsMoreOptions`: true si pide ver mas propiedades

Cuando el comprador expresa interes positivo en texto libre ("me encaja
la del centro", "me gusta la segunda", "me la quedo"), el NLU devuelve
`intention=OTRO` con `propertyFeedback=[]`. El handler de WhatsApp
(`lib/workers/consumer/whatsapp-nlu-handler.ts`) detecta esa senal y
responde con un mensaje que invita al comprador a pulsar el boton "Me
encaja" en la ficha del micrositio (cooldown de 12h para evitar spam).

## Eventos emitidos

| Evento | Cuando | Payload clave |
|--------|--------|--------------|
| WHATSAPP_ENVIADO | Al enviar el micrositio (kind=`microsite_link`) o el acuse (kind=`buyer_interest_ack`) | messageId (WAMID), demandId, selectionId, kind, propertyId (en acuses) |
| MICROSITE_GENERACION_RESULTADO | Cada `GENERATE_MICROSITE` termina con selección creada o salida controlada | jobId, status (`created`/`skipped`), reason, source, notifyOnEmpty, selectionId |
| COBERTURA_DEMANDA_EVALUADA | Cada `EVALUATE_DEMAND_COVERAGE` toma una decisión operativa | jobId, decision, reason, bestScore, threshold, followUpJobType |
| SELECCION_COMPRADOR | `ME_INTERESA` via boton del micrositio (`source.channel="microsite_card"`) o `NO_ME_ENCAJA` via NLU (`source.channel="whatsapp_feedback"`) | demandId, selectionId, propertyId, decision, source.channel |
| DEMANDA_ACTUALIZADA | Cuando hay ajuste de demanda (NO_ME_ENCAJA/BUSCO_DIFERENTE con variables) | source.channel, selectionId, variables, nlu |

## Roles de los handlers

### SELECCION_COMPRADOR (seleccion-comprador-handler)

Persiste feedback individual por propiedad en `MicrositeSelectionFeedback` (upsert idempotente por selectionId+propertyId). **No dispara** actualizacion de demanda ni regeneracion de microsite — eso lo gestiona `DEMANDA_ACTUALIZADA`.

Cuando `decision === "ME_INTERESA"`:

1. Avanza `leadStatus` a `VISITA_PENDIENTE`.
2. Llama a `notifyCommercialVisitInterest` (paquete WhatsApp al comercial).
3. Si `source.channel === "microsite_card"` encola `SEND_BUYER_INTEREST_ACK`
   con `idempotencyKey = send_buyer_interest_ack:{event.id}`. Para otros
   canales no se envia acuse (regla "un mensaje por click").

### DEMANDA_ACTUALIZADA (write-demand-update-handler)

Orquesta la cadena completa cuando el NLU detecta variables de ajuste:
1. `UPDATE_DEMAND_PROJECTION` → actualiza `demands_current` en Neon
2. `WRITE_TO_INMOVILLA(updateDemandCriteria)` → escribe en Inmovilla via RPA (precio, habitaciones, metros, zonas, tipos)
3. Si `source.channel === "whatsapp_feedback"` o `source.selectionId` → `GENERATE_MICROSITE` con variables actualizadas (incl. metros)

## Regeneracion del microsite

Se dispara en dos caminos:
1. **DEMANDA_ACTUALIZADA desde feedback WhatsApp**: el handler de escritura detecta `source.channel === "whatsapp_feedback"` o `source.selectionId` y encola GENERATE_MICROSITE tras la egestion a Inmovilla. Las variables de metros se pasan en el payload para que la búsqueda de cartera externa use los criterios actualizados.
2. **wantsMoreOptions**: el handler de WhatsApp encola GENERATE_MICROSITE directamente cuando el comprador pide mas opciones.

### Manejo de salidas sin microsite

`GENERATE_MICROSITE` ya no debe terminar como un éxito opaco cuando no crea
selección. El consumer registra `MICROSITE_GENERACION_RESULTADO` con `status=
"skipped"` y una `reason` normalizada:

- `NO_MATCHING_PROPERTIES`: no hay propiedades suficientes que encajen. Si
  `notifyOnEmpty !== false`, se avisa al comprador con `kind=
  "no_stock_available"`.
- `EXTERNAL_SEARCH_DISABLED`, `STATEFOX_TOKEN_MISSING`, `STATEFOX_ERROR`:
  fallos de configuración o dependencia externa. Se emite alerta operativa y,
  si el job viene de una conversación con comprador y `notifyOnEmpty !== false`,
  se manda un aviso `kind="microsite_generation_delayed"` para evitar que el
  comprador quede esperando una entrega que no ocurrirá.

Los scans automáticos de coverage conservan `notifyOnEmpty=false` para no hacer
spam al comprador, pero dejan `COBERTURA_DEMANDA_EVALUADA` y/o
`MICROSITE_GENERACION_RESULTADO` para diagnóstico.

## Canales canonicos

- **Interes positivo en una propiedad concreta**: boton "Me encaja" en
  cada ficha del micrositio (`POST /api/seleccion/{token}/feedback` con
  `decision=ME_INTERESA`). Es el **unico** canal valido para
  `ME_INTERESA`. Idempotente: la API responde 409 ante un segundo click
  sobre la misma propiedad, y el boton queda permanentemente bloqueado
  con el badge "Ya elegida — un agente te contactara". Detalle completo
  en `docs/microsite-me-encaja-flow.md`.
- **Rechazo de propiedades y ajuste de demanda**: WhatsApp en texto libre
  procesado por NLU contextual (`source.channel="whatsapp_feedback"`).

## Variables de entorno

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `ENABLE_EXTERNAL_PORTFOLIO_SEARCH` | Si (produccion) | Kill switch de búsqueda de cartera externa para coverage y microsites |
| `STATEFOX_BEARER_TOKEN` | Si (produccion) | Consulta de propiedades de mercado |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Opcional | Mapa estatico en detalle de propiedad |
| `DEMO_UI` | Opcional | Activa vistas demo sin Statefox ni DB |
| `OPENAI_API_KEY` | Si | NLU contextual con LangGraph |
| `WHATSAPP_TEMPLATE_MICROSITE_LISTO_COMPRADOR` | Opcional (default `microsite_listo_comprador`) | Plantilla del mensaje inicial al comprador con el enlace al micrositio |
| `WHATSAPP_TEMPLATE_MICROSITE_PROPIEDAD_ME_ENCAJA` | Opcional (default `microsite_propiedad_me_encaja`) | Plantilla del acuse al comprador tras pulsar "Me encaja" en una ficha |

## Test

```bash
# Unit tests
npm test -- seleccion-comprador-handler      # Handler de feedback por propiedad
npm test -- feedback-loop-e2e                # E2E determinista: WA → eventos → jobs (BD real, NLU stub)

# Scripts cercanos a produccion
npx tsx scripts/test-microsite-curate.ts     # Pipeline de curacion Statefox
npx tsx scripts/test-feedback-loop.ts        # NLU aislado (classifyBuyerFeedback)
npm run microsite:debug-delivery -- --demandId=DEM-XXXX
npm run microsite:debug-delivery -- --waId=34600000000 --json

# Live RPA (escritura real a Inmovilla — requiere FEEDBACK_LOOP_LIVE=true)
FEEDBACK_LOOP_LIVE=true \
FEEDBACK_LOOP_DEMAND_ID=DEM-XXXX \
npx tsx scripts/test-feedback-loop-live-rpa.ts [--buyer-text "..."]

# Dry-run (sin escritura) — omitir FEEDBACK_LOOP_LIVE
FEEDBACK_LOOP_DEMAND_ID=DEM-XXXX \
npx tsx scripts/test-feedback-loop-live-rpa.ts
```

**Precauciones del script live-RPA:**
- Usar siempre una demanda de pruebas dedicada (`FEEDBACK_LOOP_DEMAND_ID`)
- El modo live requiere credenciales de Inmovilla (`INMOVILLA_USER`, `INMOVILLA_PASSWORD`, `INMOVILLA_OFFICE_KEY`)
- El dry-run ejecuta todo excepto la escritura real en Inmovilla

## Referencia en el plan

Resumen ejecutivo del mismo alcance en **`docs/plan.md`**, sección **Implementación consolidada — Microsite, NLU comprador y suite de evaluación IA**. La **suite de evaluación NLU** (AI-to-AI) está documentada en `docs/nlu-eval-suite.md`.
