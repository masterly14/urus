import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { ScoringInput } from "@/lib/scoring/types";
import type { AgentProfile, RoutingInput } from "@/lib/routing/types";
import type { HandlerResult } from "./types";
import { calculateScore } from "@/lib/scoring";
import { assignSla } from "@/lib/sla";
import { selectBestAgent } from "@/lib/routing";
import {
  getActiveAgentsByCity,
  incrementAgentLoad,
} from "@/lib/routing/agent-repo";
import { upsertCommercialLeadFactFromLeadIngestedEvent } from "@/lib/dashboard/comercial/facts";

export type AgentFetcher = (ciudad: string) => Promise<AgentProfile[]>;
export type LoadIncrementer = (agentId: string) => Promise<void>;

/**
 * Builds a ScoringInput from the raw event payload.
 */
export function buildScoringInput(
  payload: Record<string, unknown>,
): ScoringInput {
  const tipo = payload.tipo === "propietario" ? "propietario" : "comprador";

  return {
    tipo,
    preaprobacionHipotecaria: Boolean(payload.preaprobacionHipotecaria),
    presupuestoDefinido: Boolean(payload.presupuestoDefinido),
    plazoDias:
      typeof payload.plazoDias === "number" ? payload.plazoDias : undefined,
    mensajeConDetalles: Boolean(payload.mensajeConDetalles),
    referido: Boolean(payload.referido),
    soloMirando: Boolean(payload.soloMirando),
    urgenciaVenta: Boolean(payload.urgenciaVenta),
    precioCercanoMercado: Boolean(payload.precioCercanoMercado),
    exclusivaAceptable: Boolean(payload.exclusivaAceptable),
    documentacionDisponible: Boolean(payload.documentacionDisponible),
    probarSinAgencia: Boolean(payload.probarSinAgencia),
  };
}

export function buildRoutingInput(
  payload: Record<string, unknown>,
): RoutingInput {
  return {
    ciudad: typeof payload.ciudad === "string" ? payload.ciudad : "",
    especialidad:
      typeof payload.especialidad === "string"
        ? payload.especialidad
        : undefined,
  };
}

export interface LeadHandlerDeps {
  fetchAgents?: AgentFetcher;
  incrementLoad?: LoadIncrementer;
}

/**
 * Core handler: scoring → SLA → routing → incrementar carga → jobs.
 * Acepta dependencias opcionales para testabilidad (defaults a DB real).
 */
export async function handleLeadIngestadoCore(
  event: Event,
  deps: LeadHandlerDeps = {},
): Promise<HandlerResult> {
  const fetchAgents = deps.fetchAgents ?? getActiveAgentsByCity;
  const incrementLoad = deps.incrementLoad ?? incrementAgentLoad;

  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const scoringInput = buildScoringInput(payload);
  const scoringResult = calculateScore(scoringInput);
  const slaResult = assignSla(scoringResult.score);

  const routingInput = buildRoutingInput(payload);
  let routingResult = { assigned: false, agent: null as AgentProfile | null, reason: "" };

  if (routingInput.ciudad) {
    const agents = await fetchAgents(routingInput.ciudad);
    routingResult = selectBestAgent(agents, routingInput);
  } else {
    routingResult.reason = "Sin ciudad en el payload del lead";
  }

  if (routingResult.assigned && routingResult.agent) {
    try {
      await incrementLoad(routingResult.agent.id);
    } catch (err) {
      console.error(
        `[consumer] Error al incrementar carga de ${routingResult.agent.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `[consumer] LEAD_INGESTADO aggregateId=${event.aggregateId} score=${scoringResult.score} sla=${slaResult.sla.level} agent=${routingResult.agent?.nombre ?? "none"}`,
  );

  const followUpJobs: EnqueueJobInput[] = [];

  if (slaResult.notifyImmediately) {
    followUpJobs.push({
      type: "NOTIFY_LEAD_WHATSAPP",
      payload: {
        leadAggregateId: event.aggregateId,
        score: scoringResult.score,
        slaLevel: slaResult.sla.level,
        maxResponseMs: slaResult.sla.maxResponseMs,
        reasons: scoringResult.reasons,
        assignedAgentId: routingResult.agent?.id ?? null,
        assignedAgentNombre: routingResult.agent?.nombre ?? null,
        assignedAgentTelefono: routingResult.agent?.telefono ?? null,
        routingReason: routingResult.reason,
      },
      priority: priorityFromSla(slaResult.sla.level),
      idempotencyKey: `notify_lead:${event.id}`,
      sourceEventId: event.id,
    });
  }

  if (slaResult.followUpCadence) {
    const now = event.occurredAt ?? new Date();
    for (const step of slaResult.followUpCadence) {
      followUpJobs.push({
        type: "FOLLOW_UP_LEAD",
        payload: {
          leadAggregateId: event.aggregateId,
          step: step.label,
          score: scoringResult.score,
          assignedAgentId: routingResult.agent?.id ?? null,
        },
        availableAt: new Date(now.getTime() + step.delayMs),
        idempotencyKey: `follow_up:${event.aggregateId}:${step.label}`,
        sourceEventId: event.id,
      });
    }
  }

  return {
    success: true,
    followUpJobs,
    scoredPayload: {
      score: scoringResult.score,
      pclose: scoringResult.pclose,
      value: scoringResult.value,
      urgency: scoringResult.urgency,
      reasons: scoringResult.reasons,
      slaLevel: slaResult.sla.level,
      slaMaxResponseMs: slaResult.sla.maxResponseMs,
      slaDescription: slaResult.sla.description,
      assignedAgentId: routingResult.agent?.id ?? null,
      assignedAgentNombre: routingResult.agent?.nombre ?? null,
      routingAssigned: routingResult.assigned,
      routingReason: routingResult.reason,
    },
  };
}

/**
 * Public handler registered in the consumer.
 * Uses the real DB-backed agent fetcher.
 */
export async function handleLeadIngestado(
  event: Event,
): Promise<HandlerResult> {
  const result = await handleLeadIngestadoCore(event);

  if (result.success) {
    try {
      const scored = result.scoredPayload ?? {};
      await upsertCommercialLeadFactFromLeadIngestedEvent({
        event,
        scoredPayload: {
          score: typeof scored["score"] === "number" ? scored["score"] : undefined,
          slaLevel: typeof scored["slaLevel"] === "string" ? scored["slaLevel"] : undefined,
          assignedAgentId:
            typeof scored["assignedAgentId"] === "string" ? scored["assignedAgentId"] : null,
          assignedAgentNombre:
            typeof scored["assignedAgentNombre"] === "string"
              ? scored["assignedAgentNombre"]
              : null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[analytics] No se pudo upsert CommercialLeadFact para ${event.aggregateId}: ${message}`,
      );
    }
  }

  return result;
}

function priorityFromSla(level: string): number {
  switch (level) {
    case "CRITICAL":
      return 10;
    case "HIGH":
      return 50;
    case "MEDIUM":
      return 100;
    default:
      return 200;
  }
}
