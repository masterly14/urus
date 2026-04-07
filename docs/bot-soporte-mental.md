# M12 — Bot de Soporte Mental para Comerciales

> **Estado:** implementado (grafo LangGraph + routing WhatsApp + handler).
> **Branch:** `feat/M10-dashboard-comercial` (pendiente de mover a `feat/M12-bot-mental`).
> **Sprint:** 3, Semana 5, Día 25.

---

## Qué es

Un bot conversacional vía WhatsApp que actúa como compañero silencioso del comercial inmobiliario. No es un terapeuta, no es un coach motivacional, es un colega veterano que entiende la presión de vender pisos en España.

El comercial escribe `/coach` en cualquier momento y entra en una conversación privada con el bot. Puede hablar de bloqueos, preparar un cierre, desahogarse, recuperar el foco o trabajar en su desarrollo profesional.

## Arquitectura

### Grafo LangGraph

Primer grafo del repo con routing condicional (`addConditionalEdges`). Dos invocaciones LLM por turno:

1. **Clasificador** (`gpt-5.4-mini`, temp=0): structured output que determina flujo, subtipo, energía, foco y urgencia.
2. **Generador de respuesta** (`gpt-5.4-mini`, temp=0.7): respuesta natural con system prompt especializado por flujo.

```
START → classify → (condicional) → respondBloqueo → END
                                  → respondPreparacion → END
                                  → respondDescarga → END
                                  → respondEnfoque → END
                                  → respondCrecimiento → END
                                  → respondSaludo → END
```

### Flujos disponibles

| Flujo | Cuándo se activa | Qué hace |
|-------|-----------------|----------|
| **Bloqueo** | Miedo, inseguridad, presión, ego, fatiga | Identifica el bloqueo concreto, propone UN ejercicio de 2-5 min |
| **Preparación** | Cierre/visita/llamada próxima | Preguntas guiadas, simulación de objeciones, anclajes de seguridad |
| **Descarga** | Mal día, operación perdida, frustración | Escucha activa, reencuadre suave cuando el comercial esté listo |
| **Enfoque** | Disperso, demasiadas tareas | Micro-rutina de priorización, una sola acción para los próximos 30 min |
| **Crecimiento** | Quiere mejorar, sin problema urgente | Reto semanal concreto, reflexión guiada sobre operaciones recientes |
| **Saludo** | Hola, adiós, charla genérica | Conversación natural sin forzar ningún flujo |

## Archivos principales

| Archivo | Función |
|---------|---------|
| `lib/agents/mental-health-graph.ts` | Grafo LangGraph: StateGraph con 7 nodos y conditional edges |
| `lib/agents/mental-health-types.ts` | Tipos y schemas Zod (clasificación, input, output) |
| `lib/agents/mental-health-prompts.ts` | System prompts del clasificador y de cada flujo de respuesta |
| `lib/agents/llm.ts` | Instancias LLM: `llmMentalHealthClassifier` (temp=0) y `llmMentalHealth` (temp=0.7) |
| `lib/workers/consumer/mental-health-handler.ts` | Handler: sesión, historial, invocación del grafo, envío WhatsApp |
| `lib/workers/consumer/whatsapp-nlu-handler.ts` | Routing: intercepta `/coach` y sesiones activas antes del flujo comprador |
| `prisma/schema.prisma` | Modelo `MentalHealthSession` + enums `MENTAL_CONVERSATION`, `MENTAL_MSG_RECIBIDO`, `MENTAL_MSG_ENVIADO` |

## Cómo se activa

1. El comercial escribe `/coach` (o `coach`) al número WhatsApp del sistema.
2. El handler intercepta el mensaje antes del flujo NLU de comprador.
3. Se crea una `MentalHealthSession` con timeout de 30 minutos.
4. Los mensajes siguientes del mismo `waId` van al bot mental mientras la sesión esté activa.
5. El comercial escribe `/salir` o la sesión expira por inactividad (30 min).

## Modelo de datos

### MentalHealthSession (Prisma)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| waId | String (unique) | Teléfono WhatsApp del comercial |
| comercialId | String? | ID del comercial en tabla `comerciales` (si se resuelve) |
| flujoActivo | String? | Último flujo clasificado (bloqueo, preparacion, etc.) |
| subtipoBloqueo | String? | Subtipo si flujo=bloqueo (miedo, inseguridad, presion, ego, fatiga) |
| nivelEnergia | Int? | Último nivel de energía detectado (1-5) |
| turnCount | Int | Número de turnos en la sesión actual |
| lastMessageAt | DateTime | Timestamp del último mensaje (para timeout) |
| closedAt | DateTime? | Cuando se cerró la sesión (null = activa) |

### Eventos del Event Store

| Tipo | AggregateType | Descripción |
|------|--------------|-------------|
| `MENTAL_MSG_RECIBIDO` | `MENTAL_CONVERSATION` | Mensaje del comercial al bot |
| `MENTAL_MSG_ENVIADO` | `MENTAL_CONVERSATION` | Respuesta del bot al comercial |

## Prompt Engineering

Los prompts están diseñados para que el bot no suene a bot:

- **Persona:** colega veterano de 10 años vendiendo pisos en España
- **Idioma:** español de España natural (tuteo, "vale", "mira", "a ver")
- **Anti-patrones prohibidos:** emojis, exclamaciones motivacionales, frases de LinkedIn, reformulación del mensaje, listas numeradas
- **Brevedad:** máximo 3-4 frases por mensaje
- **Honestidad:** si algo es duro, se reconoce; si no sabe, lo dice
- **Acción:** ofrece UN ejercicio concreto (2-5 min), no teoría
- **Contexto CRM:** inyecta nombre, cierres pendientes y racha del comercial de forma natural

## Tests

```bash
npx vitest run lib/agents/__tests__/mental-health-graph.test.ts
npx vitest run lib/workers/consumer/__tests__/mental-health-routing.test.ts
```

- 7 tests del grafo: clasificación por flujo, inyección de historial, contexto CRM, manejo de errores
- 12 tests de routing: activación `/coach`, detección `/salir`, gestión de sesiones (activa, expirada, cerrada)

## Variables de entorno

No requiere variables adicionales. Usa `OPENAI_API_KEY` (ya existente) y la configuración de WhatsApp existente.
