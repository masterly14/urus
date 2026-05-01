# NLU de Demanda — Primer Contacto

## Que Se Construyo

El primer contacto NLU inicia automaticamente una conversacion con el comprador cuando entra una demanda nueva. El objetivo es pasar de una demanda estatica a una conversacion viva donde el comprador pueda confirmar, matizar o ampliar sus criterios antes de generar cruces, microsites y visitas.

El flujo es seguro frente a duplicados: no envia mensajes si falta telefono, si la demanda esta en estado terminal, si hay opt-out o si ya existe una sesion reciente de descubrimiento inicial.

## Archivos Principales

| Archivo | Funcion |
| --- | --- |
| `lib/nlu/initial-contact.ts` | Servicio de primer contacto: validacion, anti-spam, sesion y plantilla WhatsApp. |
| `lib/workers/consumer/nlu-initial-contact-handler.ts` | Handler del consumer para enganchar `DEMANDA_CREADA`. |
| `lib/workers/consumer/handlers.ts` | Encadena proyeccion de demanda y primer contacto NLU. |
| `lib/nlu/__tests__/initial-contact.test.ts` | Tests unitarios exhaustivos del servicio. |
| `scripts/test-nlu-initial-contact-dry-run.ts` | Dry-run cercano a produccion sin WhatsApp real. |

## Evento

`NLU_CONTACTO_INICIADO`

Payload principal:

- `demandId`
- `waId`
- `sent`
- `skippedReason`
- `templateName`
- `messageId`
- `dryRun`

Se emite tanto cuando se envia como cuando se omite el envio por una regla de seguridad.

## Plantilla WhatsApp

Nombre por defecto: `nlu_demanda_contacto_inicial`

Variable opcional:

```bash
WHATSAPP_TEMPLATE_NLU_DEMANDA_CONTACTO_INICIAL=nlu_demanda_contacto_inicial
```

Cuerpo esperado: 2 variables.

- Nombre del comprador.
- Mensaje breve de bienvenida.

## Sesion Conversacional

Se crea o actualiza `WhatsAppBuyerSession` con:

- `waId`
- `demandId`
- `conversationPhase = "initial_nlu_discovery"`
- `buyerDigest` con el mensaje base de bienvenida.

Cuando el comprador responda, el handler de `WHATSAPP_RECIBIDO` puede resolver la demanda desde esta sesion.

## Como Probar

Tests:

```bash
npm test -- lib/nlu/__tests__/initial-contact.test.ts
```

Dry-run:

```bash
npm run test:nlu-initial-contact:dry-run -- --demandId=DEM-REAL-O-TEST
```

El dry-run requiere `DATABASE_URL`, no envia WhatsApp real y registra el resultado como `dryRun`.
