import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { ScoringInput } from "@/lib/scoring/types";
import type { AgentProfile, RoutingInput } from "@/lib/routing/types";
import type { HandlerResult } from "./types";
import type { AIScoringGraphInput, AIScoringResult, HistoricalStats } from "@/lib/scoring/ai-types";
import { calculateScore, getActiveWeights } from "@/lib/scoring";
import { blendScores } from "@/lib/scoring/blend-scores";
import { assignSla } from "@/lib/sla";
import { selectBestAgent } from "@/lib/routing";
import {
  getActiveAgentsByCity,
  incrementAgentLoad,
} from "@/lib/routing/agent-repo";
import { upsertCommercialLeadFactFromLeadIngestedEvent } from "@/lib/dashboard/comercial/facts";
import { fetchHistoricalStats } from "@/lib/scoring/historical-stats";

const AI_ENABLED = process.env.SCORING_AI_ENABLED === "true";

export type AgentFetcher = (ciudad: string) => Promise<AgentProfile[]>;
export type LoadIncrementer = (agentId: string) => Promise<void>;

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
  aiEnabled?: boolean;
  scoreWithAI?: (input: AIScoringGraphInput) => Promise<AIScoringResult>;
}

/**
 * Core handler: scoring → (optional AI blend) → SLA → routing → jobs.
 */
export async function handleLeadIngestadoCore(
  event: Event,
  deps: LeadHandlerDeps = {},
): Promise<HandlerResult> {
  const fetchAgents = deps.fetchAgents ?? getActiveAgentsByCity;
  const incrementLoad = deps.incrementLoad ?? incrementAgentLoad;
  const aiEnabled = deps.aiEnabled ?? AI_ENABLED;

  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const scoringInput = buildScoringInput(payload);
  let scoringResult = await calculateScore(scoringInput);

  let aiScoringUsed = false;
  let aiConfidence: number | null = null;

  if (aiEnabled) {
    try {
      const scoreWithAI = deps.scoreWithAI ?? (await loadScoreWithAI());
      const weights = await getActiveWeights();
      const ciudad = typeof payload.ciudad === "string" ? payload.ciudad : "";
      const source = typeof payload.source === "string" ? payload.source : "";
      const mensajeRaw = typeof payload.mensajeRaw === "string" ? payload.mensajeRaw : null;

      const historicalStats = await fetchHistoricalStats();

      const aiInput: AIScoringGraphInput = {
        leadData: scoringInput,
        mensajeRaw,
        ciudad,
        source,
        historicalStats,
        currentWeights: weights,
        ruleSubScores: {
          pclose: scoringResult.pclose,
          value: scoringResult.value,
          urgency: scoringResult.urgency,
        },
      };

      const aiResult = await scoreWithAI(aiInput);
      scoringResult = blendScores(scoringResult, aiResult, weights);
      aiScoringUsed = true;
      aiConfidence = aiResult.confidence;

      console.log(
        `[consumer] AI scoring applied: confidence=${aiResult.confidence.toFixed(2)} adjustments=pclose:${aiResult.pcloseAdjustment} value:${aiResult.valueAdjustment} urgency:${aiResult.urgencyAdjustment}`,
      );
    } catch (err) {
      console.warn(
        `[consumer] AI scoring failed, using rules only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

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
    `[consumer] LEAD_INGESTADO aggregateId=${event.aggregateId} score=${scoringResult.score} sla=${slaResult.sla.level} agent=${routingResult.agent?.nombre ?? "none"} ai=${aiScoringUsed}`,
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
      weightsVersion: scoringResult.weightsVersion,
      aiScoringUsed,
      aiConfidence,
    },
  };
}

/**
 * Public handler registered in the consumer.
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
          scoringModelVersion:
            typeof scored["weightsVersion"] === "number" ? scored["weightsVersion"] : undefined,
          aiScoringUsed:
            typeof scored["aiScoringUsed"] === "boolean" ? scored["aiScoringUsed"] : false,
          aiConfidence:
            typeof scored["aiConfidence"] === "number" ? scored["aiConfidence"] : undefined,
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

/** Lazy-load AI graph to avoid importing LangGraph when AI is disabled. */
async function loadScoreWithAI() {
  const { scoreLeadWithAI } = await import("@/lib/agents/lead-scoring-graph");
  return scoreLeadWithAI;
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
