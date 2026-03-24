# M5 — Agentes LangGraph

Módulo oficial de agentes de IA del sistema Urus Capital. Los grafos se ejecutan con LangGraph y OpenAI.

---

## Agente de clasificación de respuestas WhatsApp

**Nombre (interno):** Agente NLU de clasificación de respuestas WhatsApp  
**Identificador del grafo:** `nluGraph`  
**Ubicación:** `lib/agents/nlu-graph.ts`

### Qué hace

Recibe el texto libre que un comprador escribe en WhatsApp como respuesta a una propiedad enviada y devuelve:

- **Intención:** `ME_ENCAJA` | `NO_ME_ENCAJA` | `BUSCO_DIFERENTE`
- **Variables de demanda** (cuando aplica): precio min/max, metros, zonas, tipos, extras
- **Confianza** (0–1) y **razonamiento** (para logs/auditoría)

### Cómo invocarlo

**Desde código (recomendado):**

```ts
import { classifyWhatsAppResponse } from "@/lib/agents";

const result = await classifyWhatsAppResponse({
  messageText: "No me convence, busco algo más barato y con terraza",
  buyerPhone: "34600000000",
  demandId: "demand-abc123",
});

// result.intention === "NO_ME_ENCAJA"
// result.variables.precioMax, result.variables.extras, etc.
```

**Desde API Route o webhook WhatsApp:** importar `classifyWhatsAppResponse` desde `@/lib/agents`, extraer el cuerpo del mensaje entrante (`messageText`), opcionalmente `demandId` y `buyerPhone` del contexto, y llamar a la función. El resultado se usa para emitir `DEMANDA_ACTUALIZADA` (Smart Matching) o para seguir el flujo conversacional.

**Script de validación (solo pruebas):** `npm run agents:test-langgraph` ejecuta `scripts/test-langgraph.ts`, que invoca este agente con varios mensajes de ejemplo. No es el agente en sí; el agente está en `lib/agents/`.

### Entrada y salida

| Entrada (`NLUGraphInput`) | Salida (`NLUResult`) |
|---------------------------|----------------------|
| `messageText: string`     | `intention`, `confidence`, `variables`, `rawText`, `reasoning?` |
| `buyerPhone: string`      | Tipos: `IntentionWhatsApp`, `DemandVariables` en `@/lib/agents` |
| `demandId: string`        | Lanza `Error` si falla la llamada a OpenAI o el grafo |

### Dependencias

- `OPENAI_API_KEY` en entorno (obligatoria para ejecutar el grafo).
