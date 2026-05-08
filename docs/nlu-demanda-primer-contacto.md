# NLU de Demanda — Primer Contacto

## Que Se Construyo

El primer contacto NLU inicia automaticamente una conversacion con el comprador cuando entra una demanda nueva. El objetivo es pasar de una demanda estatica a una conversacion viva donde el comprador pueda confirmar, matizar o ampliar sus criterios antes de generar cruces, microsites y visitas.

El flujo es seguro frente a duplicados: no envia mensajes si falta telefono, si la demanda esta en estado terminal, si hay opt-out o si ya existe una sesion reciente de descubrimiento inicial.

## Archivos Principales

| Archivo | Funcion |
| --- | --- |
| `lib/nlu/initial-contact.ts` | Servicio de primer contacto: validacion, anti-spam, sesion y plantilla WhatsApp. |
| `lib/nlu/welcome-message.ts` | Constructor determinista del cuerpo de bienvenida y del seed del digest. |
| `lib/workers/consumer/nlu-initial-contact-handler.ts` | Handler del consumer para enganchar `DEMANDA_CREADA`. |
| `lib/workers/consumer/handlers.ts` | Encadena proyeccion de demanda y primer contacto NLU. |
| `lib/nlu/__tests__/initial-contact.test.ts` | Tests unitarios del servicio. |
| `lib/nlu/__tests__/welcome-message.test.ts` | Tests del helper de variantes de copy y sanitizacion. |
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

- `{{1}}` Nombre del comprador (sanitizado: solo el primer nombre, capitalizado).
- `{{2}}` Mensaje de bienvenida construido dinamicamente desde los criterios reales de la demanda en `DemandCurrent` (origen Inmovilla).

## Cuerpo Dinamico (variable {{2}})

El cuerpo se elige de forma determinista en `lib/nlu/welcome-message.ts` (`buildWelcomeMessage`) segun los datos disponibles en la demanda. No usa LLM y nunca inventa criterios que el comprador no haya aportado:

| Variante | Datos disponibles | Intencion |
| --- | --- | --- |
| A | `zonas` y `presupuestoMax` | Confirmacion amable de criterios. |
| B | Solo `zonas` | Ancla la zona y pregunta presupuesto. |
| C | Solo `presupuestoMax` | Ancla el tope y pregunta zona. |
| D | Sin datos utiles (ceros, vacios) | Pregunta abierta neutra (zona o presupuesto). |

Reglas duras:

- Solo se inyectan datos reales del CRM. Valores `0`, `""` o `null` se tratan como ausentes.
- El copy es siempre una propuesta a confirmar, nunca afirmacion cerrada, para tolerar inconsistencias del CRM.
- El nombre se sanitiza con `sanitizeFirstName` (toma solo el primer nombre y normaliza mayusculas tipo `JUAN PEREZ` → `Juan`).
- Cada variante se mantiene por debajo de 250 caracteres para encajar en una burbuja de WhatsApp.

## Sesion Conversacional

Se crea o actualiza `WhatsAppBuyerSession` con:

- `waId`
- `demandId`
- `conversationPhase = "initial_nlu_discovery"`
- `buyerDigest`: digest sembrado con los criterios reales de la demanda (`buildSeedDigest`), formato compacto compatible con `lib/agents/buyer-digest.ts`. Ejemplo: `Presupuesto: 150.000–220.000€ | Ubicación: Centro, Macarena | ≥3 hab | Tipo: Piso`.

Esto permite que el agente conversacional disponga de contexto real desde el primer turno cuando llegue `WHATSAPP_RECIBIDO`, sin necesidad de recargar la demanda.

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
