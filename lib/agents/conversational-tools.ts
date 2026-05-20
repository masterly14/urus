/**
 * Tools del agente conversacional.
 *
 * Cada tool envuelve lógica existente del sistema (NLU, eventos, jobs, visitas)
 * y expone un schema JSON que el LLM puede invocar durante el ReAct loop.
 * Las tools NO envían mensajes al comprador; solo ejecutan side-effects y retornan
 * datos para que el agente construya su respuesta conversacional.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { classifyBuyerFeedback } from "./nlu-graph";
import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue/job-queue";
import { initiateVisitScheduling, getActiveSessionForBuyer } from "@/lib/visit-scheduling";
import type { JsonValue } from "@/lib/event-store/types";
import type { PropertySummaryForNLU, ConversationTurn } from "./types";
import {
  MICROSITE_DELIVERY_ETA_MINUTES,
  MICROSITE_DELIVERY_STANDARD_MESSAGE,
} from "./conversational-operational-constants";

/**
 * Evalúa cuántas propiedades de la selección actual son compatibles con los
 * nuevos criterios (tope de precio, habitaciones mínimas, metros mínimos).
 * Devuelve `null` cuando no se han proporcionado restricciones suficientes
 * para opinar, para que el agente no afirme nada falso.
 */
function analyzeCompatibilityWithCurrentSelection(
  properties: PropertySummaryForNLU[],
  constraints: {
    priceMax?: number;
    priceMin?: number;
    habitacionesMin?: number;
    metrosMin?: number;
  } | undefined,
): { compatibleCount: number | null; total: number } {
  if (!constraints || properties.length === 0) {
    return { compatibleCount: null, total: properties.length };
  }
  const hasAnyConstraint =
    constraints.priceMax != null ||
    constraints.priceMin != null ||
    constraints.habitacionesMin != null ||
    constraints.metrosMin != null;
  if (!hasAnyConstraint) {
    return { compatibleCount: null, total: properties.length };
  }

  const compatible = properties.filter((p) => {
    if (constraints.priceMax != null && p.price != null && p.price > constraints.priceMax) return false;
    if (constraints.priceMin != null && p.price != null && p.price < constraints.priceMin) return false;
    if (constraints.habitacionesMin != null && p.rooms != null && p.rooms < constraints.habitacionesMin) return false;
    if (constraints.metrosMin != null && p.metersBuilt != null && p.metersBuilt < constraints.metrosMin) return false;
    return true;
  }).length;

  return { compatibleCount: compatible, total: properties.length };
}

// ── Contexto compartido entre tools de una ejecución ────────────────────────

export interface ToolExecutionContext {
  buyerWaId: string;
  demandId: string;
  selectionId: string | null;
  properties: PropertySummaryForNLU[];
  conversationHistory: ConversationTurn[];
  eventId?: string;
  correlationId?: string;
}

// ── Factory: crea tools enlazados a un contexto de ejecución ────────────────

export function createConversationalTools(ctx: ToolExecutionContext): StructuredToolInterface[] {
  const classifyFeedbackTool = new DynamicStructuredTool({
    name: "classify_feedback",
    description:
      "Analiza el mensaje del comprador para clasificar su intención (NO_ME_ENCAJA, BUSCO_DIFERENTE u OTRO), " +
      "detectar feedback negativo por propiedad y extraer variables de demanda. " +
      "IMPORTANTE: el interés positivo (ME_INTERESA) NO se infiere por NLU — " +
      "se captura SOLO por el botón 'Me encaja' del micrositio. Si el comprador " +
      "expresa interés positivo en texto libre, redirígele al botón.",
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
      "Llamar una vez por cada propiedad que el comprador rechaza. " +
      "NO usar para registrar interés positivo: el botón 'Me encaja' del micrositio " +
      "es el ÚNICO canal canónico para ME_INTERESA. Si el comprador expresa interés " +
      "positivo en texto libre, no llames a esta tool — redirígele al botón en tu respuesta.",
    schema: z.object({
      propertyId: z.string().describe("ID de la propiedad en el microsite."),
      decision: z.literal("NO_ME_ENCAJA").describe("Único valor permitido: rechazo del comprador."),
      nluIntention: z.enum(["NO_ME_ENCAJA", "BUSCO_DIFERENTE", "OTRO"]).describe("Intención global NLU."),
      confidence: z.number().describe("Confianza del NLU (0-1)."),
    }),
    func: async ({ propertyId, decision, nluIntention, confidence }) => {
      const event = await appendEvent({
        type: "SELECCION_COMPRADOR",
        aggregateType: "DEMAND",
        aggregateId: ctx.demandId,
        payload: {
          demandId: ctx.demandId,
          selectionId: ctx.selectionId,
          propertyId,
          decision,
          source: {
            channel: "conversational_agent",
            waId: ctx.buyerWaId,
            eventId: ctx.eventId ?? null,
          },
          nlu: { intention: nluIntention, confidence },
          respondedAt: new Date().toISOString(),
        } as unknown as JsonValue,
        correlationId: ctx.correlationId,
        causationId: ctx.eventId,
      });

      await enqueueJob({
        type: "PROCESS_EVENT",
        payload: { eventId: event.id, eventType: event.type },
        sourceEventId: event.id,
        idempotencyKey: `process-event:${event.id}`,
      });

      return JSON.stringify({ eventId: event.id, propertyId, decision });
    },
  });

  const updateDemandTool = new DynamicStructuredTool({
    name: "update_demand",
    description:
      "Actualiza la demanda del comprador con nuevas variables detectadas (presupuesto, zona, metros, etc.). " +
      "Usar cuando el comprador expresa preferencias nuevas o ajusta su búsqueda. " +
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
      policyMetadata: z.object({
        mode: z.literal("hybrid").optional(),
        ruleApplied: z.enum(["auto_hard_rule", "buyer_confirmed"]).optional(),
        conflictResolvedBy: z.literal("buyer_priority").optional(),
        source: z.enum(["post_visit_context", "whatsapp_feedback", "conversational_agent"]).optional(),
      }).optional().describe("Metadata de política cuando el update viene de reperfilado post-visita."),
    }),
    func: async ({ variables, intention, confidence, rawText, policyMetadata }) => {
      const event = await appendEvent({
        type: "DEMANDA_ACTUALIZADA",
        aggregateType: "DEMAND",
        aggregateId: ctx.demandId,
        payload: {
          source: {
            channel: policyMetadata?.source ?? "conversational_agent",
            waId: ctx.buyerWaId,
            selectionId: ctx.selectionId,
            eventId: ctx.eventId ?? null,
          },
          nlu: { intention, confidence },
          variables: variables as unknown as JsonValue,
          rawText,
          policy: policyMetadata
            ? {
                mode: policyMetadata.mode ?? "hybrid",
                ruleApplied: policyMetadata.ruleApplied ?? "buyer_confirmed",
                conflictResolvedBy: policyMetadata.conflictResolvedBy ?? "buyer_priority",
              }
            : undefined,
          detectedAt: new Date().toISOString(),
        } as unknown as JsonValue,
        correlationId: ctx.correlationId,
        causationId: ctx.eventId,
      });

      await enqueueJob({
        type: "PROCESS_EVENT",
        payload: { eventId: event.id, eventType: event.type },
        sourceEventId: event.id,
        idempotencyKey: `process-event:${event.id}`,
      });

      const compat = analyzeCompatibilityWithCurrentSelection(ctx.properties, {
        priceMax: variables.precioMax,
        priceMin: variables.precioMin,
        habitacionesMin: variables.habitacionesMin,
        metrosMin: variables.metrosMin,
      });

      return JSON.stringify({
        eventId: event.id,
        updatedVariables: variables,
        triggersNewSelection: true,
        autoApprovedByAI: true,
        estimatedDeliveryMinutes: MICROSITE_DELIVERY_ETA_MINUTES,
        currentSelectionCompatibleCount: compat.compatibleCount,
        currentSelectionTotal: compat.total,
        message: MICROSITE_DELIVERY_STANDARD_MESSAGE,
        agentGuidance:
          "NO vuelvas a llamar request_more_options ni update_demand en este turno: la nueva selección " +
          "ya se está generando automáticamente y llegará al comprador por WhatsApp sin pasos humanos. " +
          "En tu respuesta al comprador: (1) reconoce con sus palabras lo que has entendido " +
          "(tope, zona, prioridad…), (2) habla en primera persona como su agente (\"te las busco\", " +
          "\"te las preparo\"), (3) anúnciale que se las pasas aquí mismo en unos minutos " +
          `(~${MICROSITE_DELIVERY_ETA_MINUTES} min). ` +
          "PROHIBIDO mencionar que un compañero / persona del equipo / el equipo lo revisa o valida. " +
          (compat.compatibleCount === 0
            ? "Aviso: con los nuevos criterios, ninguna de las opciones actuales encaja — dilo con claridad."
            : ""),
      });
    },
  });

  const requestMoreOptionsTool = new DynamicStructuredTool({
    name: "request_more_options",
    description:
      "Solicita una nueva selección de propiedades para el comprador. " +
      "Usar SOLO cuando el comprador pide más opciones SIN haber cambiado criterios en este turno. " +
      "Si el comprador ha ajustado presupuesto, zona o metros en este turno, usa update_demand (que ya " +
      "dispara una nueva selección) y NO llames además a esta tool. Llamar ambas en el mismo turno crea " +
      "selecciones duplicadas para validar.",
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
        .describe(
          "Restricciones efectivas que debe respetar la nueva selección (aunque ya se hayan registrado " +
            "antes con update_demand). Sirve para que el agente pueda verbalizarlas al comprador con precisión.",
        ),
    }),
    func: async ({ reason, newConstraints }) => {
      const job = await enqueueJob({
        type: "GENERATE_MICROSITE",
        payload: {
          demandId: ctx.demandId,
          comercialId: "system",
          sourceEventId: ctx.eventId ?? null,
          reason,
        },
        idempotencyKey: `generate_microsite:conv_agent:${ctx.eventId ?? Date.now()}`,
        sourceEventId: ctx.eventId,
      });

      const compat = analyzeCompatibilityWithCurrentSelection(ctx.properties, newConstraints);

      return JSON.stringify({
        status: "queued_for_delivery",
        jobId: job.id,
        type: "GENERATE_MICROSITE",
        autoApprovedByAI: true,
        estimatedDeliveryMinutes: MICROSITE_DELIVERY_ETA_MINUTES,
        currentSelectionCompatibleCount: compat.compatibleCount,
        currentSelectionTotal: compat.total,
        message: MICROSITE_DELIVERY_STANDARD_MESSAGE,
        agentGuidance:
          "La selección se genera, enriquece con IA y envía al comprador por WhatsApp automáticamente; " +
          "no hay revisión humana intermedia. En tu respuesta al comprador: (1) reconoce lo que ha pedido " +
          "con sus palabras, (2) anuncia en PRIMERA PERSONA que tú vas a buscarle las opciones " +
          "(\"te las busco\", \"te las preparo\", \"te las paso aquí mismo\"), (3) dale un plazo concreto " +
          `de unos minutos (~${MICROSITE_DELIVERY_ETA_MINUTES} min) usando lenguaje natural. ` +
          "PROHIBIDO mencionar que un compañero / persona del equipo / el equipo revisa o valida la selección. " +
          (compat.compatibleCount === 0
            ? "Aviso: con las restricciones indicadas, ninguna de las opciones actuales encaja — dilo explícitamente. "
            : "") +
          "NO vuelvas a invocar esta tool ni update_demand en los próximos turnos salvo que el comprador cambie de criterio.",
      });
    },
  });

  const initiateVisitTool = new DynamicStructuredTool({
    name: "initiate_visit",
    description:
      "Inicia el flujo de agendamiento de visita para una propiedad. " +
      "Usar SOLO cuando el comprador muestre interés firme y concreto en visitar una propiedad específica.",
    schema: z.object({
      propertyId: z.string().describe("ID de la propiedad que quiere visitar."),
    }),
    func: async ({ propertyId }) => {
      const existingSession = await getActiveSessionForBuyer(ctx.buyerWaId, propertyId);
      if (existingSession) {
        return JSON.stringify({
          status: "already_active",
          sessionId: existingSession.id,
          message: "Ya hay una visita activa para esta propiedad.",
        });
      }

      try {
        const session = await initiateVisitScheduling(
          ctx.demandId,
          propertyId,
          ctx.buyerWaId,
          ctx.correlationId,
        );

        if (!session) {
          return JSON.stringify({
            status: "no_commercial",
            message: "No se pudo iniciar: comercial sin configurar para esta propiedad.",
          });
        }

        return JSON.stringify({
          status: "initiated",
          sessionId: session.id,
          message: "Visita iniciada. El comprador recibirá propuestas de horario.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ status: "error", message: msg });
      }
    },
  });

  const getPropertyDetailsTool = new DynamicStructuredTool({
    name: "get_property_details",
    description:
      "Obtiene detalles de una propiedad del microsite por su ID. " +
      "Usar para responder preguntas específicas del comprador sobre una propiedad.",
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
      "Marca la conversación para revisión manual del comercial. " +
      "Usar cuando el comprador pide hablar con una persona, hay un problema que no puedes resolver, " +
      "o la situación requiere intervención humana.",
    schema: z.object({
      reason: z.string().describe("Motivo del escalado."),
    }),
    func: async ({ reason }) => {
      const event = await appendEvent({
        type: "WHATSAPP_ENVIADO",
        aggregateType: "WHATSAPP_CONVERSATION",
        aggregateId: ctx.buyerWaId,
        payload: {
          // Evento técnico de auditoría: no representa un envío WhatsApp real.
          type: "escalation_requested",
          kind: "escalation_requested",
          source: "conversational_agent",
          body: "Conversación marcada para revisión manual del comercial.",
          reason,
          demandId: ctx.demandId,
          requestedAt: new Date().toISOString(),
        } as unknown as JsonValue,
        correlationId: ctx.correlationId,
        causationId: ctx.eventId,
      });

      return JSON.stringify({
        status: "escalated",
        eventId: event.id,
        message: "Conversación marcada para revisión del comercial.",
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
