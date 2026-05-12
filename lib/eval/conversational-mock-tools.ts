/**
 * Mock tools para evaluación del agente conversacional.
 *
 * Reutiliza la misma firma y schemas que createConversationalTools,
 * pero sustituye los side-effects (appendEvent, enqueueJob, initiateVisitScheduling)
 * por no-ops que retornan respuestas ficticias.
 *
 * classify_feedback ejecuta el NLU REAL (necesario para evaluar calidad de clasificación).
 * get_property_details ejecuta lógica real (no tiene side-effects).
 * Los demás retornan mocks.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { classifyBuyerFeedback } from "@/lib/agents/nlu-graph";
import type { ToolExecutionContext } from "@/lib/agents/conversational-tools";
import {
  MICROSITE_HANDOFF_ETA_MINUTES,
  MICROSITE_HANDOFF_STANDARD_MESSAGE,
} from "@/lib/agents/conversational-operational-constants";
import type { PropertySummaryForNLU } from "@/lib/agents/types";

function analyzeCompatibility(
  properties: PropertySummaryForNLU[],
  c: {
    priceMax?: number;
    priceMin?: number;
    habitacionesMin?: number;
    metrosMin?: number;
  } | undefined,
): { compatibleCount: number | null; total: number } {
  if (!c || properties.length === 0) return { compatibleCount: null, total: properties.length };
  const hasAny =
    c.priceMax != null || c.priceMin != null || c.habitacionesMin != null || c.metrosMin != null;
  if (!hasAny) return { compatibleCount: null, total: properties.length };

  const compatible = properties.filter((p) => {
    if (c.priceMax != null && p.price != null && p.price > c.priceMax) return false;
    if (c.priceMin != null && p.price != null && p.price < c.priceMin) return false;
    if (c.habitacionesMin != null && p.rooms != null && p.rooms < c.habitacionesMin) return false;
    if (c.metrosMin != null && p.metersBuilt != null && p.metersBuilt < c.metrosMin) return false;
    return true;
  }).length;
  return { compatibleCount: compatible, total: properties.length };
}

let _mockEventCounter = 0;
function nextMockEventId(): string {
  return `mock-event-${++_mockEventCounter}-${Date.now()}`;
}

let _mockJobCounter = 0;
function nextMockJobId(): string {
  return `mock-job-${++_mockJobCounter}-${Date.now()}`;
}

export function resetMockCounters(): void {
  _mockEventCounter = 0;
  _mockJobCounter = 0;
}

export function createMockConversationalTools(ctx: ToolExecutionContext): StructuredToolInterface[] {
  const classifyFeedbackTool = new DynamicStructuredTool({
    name: "classify_feedback",
    description:
      "Analiza el mensaje del comprador para clasificar su intención (NO_ME_ENCAJA, BUSCO_DIFERENTE, OTRO), " +
      "detectar rechazos por propiedad (NO_ME_ENCAJA) y extraer variables de demanda. El interés positivo " +
      "se captura por botón en el micrositio, no por NLU.",
    schema: z.object({
      messageText: z.string().describe("Texto exacto del comprador a clasificar."),
    }),
    func: async ({ messageText }) => {
      const result = await classifyBuyerFeedback({
        messageText,
        buyerPhone: ctx.buyerWaId,
        demandId: ctx.demandId,
        selectionProperties: ctx.properties,
        conversationHistory: ctx.conversationHistory,
      });
      return JSON.stringify(result);
    },
  });

  const emitSelectionFeedbackTool = new DynamicStructuredTool({
    name: "emit_selection_feedback",
    description:
      "Registra el RECHAZO del comprador sobre una propiedad específica (NO_ME_ENCAJA). " +
      "El interés positivo (ME_INTERESA) se captura SOLO por el botón 'Me encaja' del micrositio.",
    schema: z.object({
      propertyId: z.string().describe("ID de la propiedad en el microsite."),
      decision: z.literal("NO_ME_ENCAJA").describe("Único valor permitido: rechazo."),
      nluIntention: z.enum(["NO_ME_ENCAJA", "BUSCO_DIFERENTE", "OTRO"]).describe("Intención global NLU."),
      confidence: z.number().describe("Confianza del NLU (0-1)."),
    }),
    func: async ({ propertyId, decision }) => {
      const eventId = nextMockEventId();
      return JSON.stringify({ eventId, propertyId, decision, _mock: true });
    },
  });

  const updateDemandTool = new DynamicStructuredTool({
    name: "update_demand",
    description:
      "Actualiza la demanda del comprador con nuevas variables detectadas. " +
      "IMPORTANTE: esta tool YA dispara automáticamente la generación de una nueva selección. " +
      "No llames también request_more_options en el mismo turno.",
    schema: z.object({
      variables: z.object({
        precioMin: z.number().optional(),
        precioMax: z.number().optional(),
        metrosMin: z.number().optional(),
        metrosMax: z.number().optional(),
        habitacionesMin: z.number().optional(),
        ciudad: z.string().optional(),
        zonas: z.array(z.string()).optional(),
        tipos: z.array(z.string()).optional(),
        extras: z.array(z.string()).optional(),
        extrasNoDeseados: z.array(z.string()).optional(),
      }).describe("Variables de demanda extraídas del mensaje."),
      intention: z.enum(["NO_ME_ENCAJA", "BUSCO_DIFERENTE", "OTRO"]),
      confidence: z.number(),
      rawText: z.string().describe("Texto original del comprador."),
    }),
    func: async ({ variables }) => {
      const eventId = nextMockEventId();
      const compat = analyzeCompatibility(ctx.properties, {
        priceMax: variables.precioMax,
        priceMin: variables.precioMin,
        habitacionesMin: variables.habitacionesMin,
        metrosMin: variables.metrosMin,
      });
      return JSON.stringify({
        eventId,
        updatedVariables: variables,
        triggersNewSelection: true,
        humanValidationRequired: true,
        estimatedHandoffMinutes: MICROSITE_HANDOFF_ETA_MINUTES,
        currentSelectionCompatibleCount: compat.compatibleCount,
        currentSelectionTotal: compat.total,
        message: MICROSITE_HANDOFF_STANDARD_MESSAGE,
        agentGuidance:
          "NO llames request_more_options ni update_demand otra vez en este turno: la nueva selección " +
          "ya se genera automáticamente. Confirma al comprador el ajuste entendido + validación humana + " +
          `plazo ~${MICROSITE_HANDOFF_ETA_MINUTES} min.` +
          (compat.compatibleCount === 0
            ? " Con los nuevos criterios ninguna de las opciones actuales encaja, dilo."
            : ""),
        _mock: true,
      });
    },
  });

  const requestMoreOptionsTool = new DynamicStructuredTool({
    name: "request_more_options",
    description:
      "Solicita una nueva selección de propiedades. Usar SOLO cuando el comprador pide más opciones " +
      "SIN haber cambiado criterios en este turno. Si ajustó presupuesto/zona/metros, usa update_demand " +
      "(que ya dispara la nueva selección) y NO llames también a esta tool.",
    schema: z.object({
      reason: z.string().describe("Razón breve de por qué se necesitan más opciones."),
      newConstraints: z
        .object({
          priceMax: z.number().optional(),
          priceMin: z.number().optional(),
          habitacionesMin: z.number().optional(),
          metrosMin: z.number().optional(),
          zonas: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Restricciones efectivas que debe respetar la nueva selección."),
    }),
    func: async ({ newConstraints }) => {
      const jobId = nextMockJobId();
      const compat = analyzeCompatibility(ctx.properties, newConstraints);
      return JSON.stringify({
        status: "queued_for_validation",
        jobId,
        type: "GENERATE_MICROSITE",
        humanValidationRequired: true,
        estimatedHandoffMinutes: MICROSITE_HANDOFF_ETA_MINUTES,
        currentSelectionCompatibleCount: compat.compatibleCount,
        currentSelectionTotal: compat.total,
        message: MICROSITE_HANDOFF_STANDARD_MESSAGE,
        agentGuidance:
          "Responde al comprador reconociendo lo pedido + validación humana + " +
          `plazo ~${MICROSITE_HANDOFF_ETA_MINUTES} min.` +
          (compat.compatibleCount === 0
            ? " Con las restricciones indicadas ninguna de las opciones actuales encaja, dilo."
            : "") +
          " NO invoques esta tool ni update_demand otra vez salvo que el comprador cambie de criterio.",
        _mock: true,
      });
    },
  });

  const initiateVisitTool = new DynamicStructuredTool({
    name: "initiate_visit",
    description:
      "Inicia el flujo de agendamiento de visita para una propiedad.",
    schema: z.object({
      propertyId: z.string().describe("ID de la propiedad que quiere visitar."),
    }),
    func: async ({ propertyId }) => {
      return JSON.stringify({
        status: "initiated",
        sessionId: `mock-visit-session-${propertyId}`,
        message: "Visita iniciada. El comprador recibirá propuestas de horario.",
        _mock: true,
      });
    },
  });

  const getPropertyDetailsTool = new DynamicStructuredTool({
    name: "get_property_details",
    description:
      "Obtiene detalles de una propiedad del microsite por su ID.",
    schema: z.object({
      propertyId: z.string().describe("ID de la propiedad a consultar."),
    }),
    func: async ({ propertyId }) => {
      const property = ctx.properties.find((p) => p.propertyId === propertyId);
      if (!property) {
        return JSON.stringify({ error: "Propiedad no encontrada en el microsite actual." });
      }
      return JSON.stringify(property);
    },
  });

  const escalateToHumanTool = new DynamicStructuredTool({
    name: "escalate_to_human",
    description:
      "Marca la conversación para revisión manual del comercial.",
    schema: z.object({
      reason: z.string().describe("Motivo del escalado."),
    }),
    func: async ({ reason }) => {
      const eventId = nextMockEventId();
      return JSON.stringify({
        status: "escalated",
        eventId,
        message: "Conversación marcada para revisión del comercial.",
        reason,
        _mock: true,
      });
    },
  });

  return [
    classifyFeedbackTool,
    emitSelectionFeedbackTool,
    updateDemandTool,
    requestMoreOptionsTool,
    initiateVisitTool,
    getPropertyDetailsTool,
    escalateToHumanTool,
  ];
}
