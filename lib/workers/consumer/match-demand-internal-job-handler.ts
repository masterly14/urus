/**
 * Handler del job MATCH_DEMAND_AGAINST_INTERNAL.
 *
 * Disparado por:
 * - DEMANDA_CREADA (siempre).
 * - DEMANDA_MODIFICADA cuando los `changedFields` intersectan
 *   `MATCHING_RELEVANT_DEMAND_FIELDS` (presupuesto, zonas, tipos,
 *   habitaciones, metros, tipoOperacion).
 *
 * Pipeline (espejo simplificado de rebuild-matches-handler.ts, sin RematchRun):
 *  1. Respeta `isMatchingPaused()`.
 *  2. Lee la demanda de `demand_current` (ya consistente por la proyección
 *     inline previa).
 *  3. Valida `leadStatus` activo (`ACTIVE_DEMAND_STATES`) y `tipoOperacion`.
 *  4. Ejecuta `matchPropertiesToDemand(demand)` y obtiene top-N (max 20).
 *  5. Para cada match aplica dedup `|Δscore| < SCORE_DELTA_THRESHOLD (5)` vs
 *     último `MATCH_GENERADO` con aggregateId = `${demandId}:${propertyId}`.
 *  6. Emite `MATCH_GENERADO` con `payload.source` ("auto_demand_creada" |
 *     "auto_demand_modificada") y `payload.causationId` del evento original.
 *     Encola `PROCESS_EVENT` para activar `handleMatchGenerado` (notificación
 *     al comercial). El WhatsApp directo al comprador queda suprimido por
 *     `match-generado-handler.ts` cuando el source es `auto_demand_*`.
 *  7. Encola `EVALUATE_DEMAND_COVERAGE` con `bestScoreOverride` para que el
 *     coverage handler no recompute el cruce.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import type { JsonValue } from "@/lib/event-store/types";
import { prisma } from "@/lib/prisma";
import { matchPropertiesToDemand } from "@/lib/matching/match-properties";
import { appendEvent } from "@/lib/event-store";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching/match-demands";
import type { DemandForMatching } from "@/lib/matching";
import { isMatchingPaused, MATCHING_PAUSED_REASON } from "@/lib/matching/pause";

const SCORE_DELTA_THRESHOLD = 5;

type MatchInternalSource = "auto_demand_creada" | "auto_demand_modificada";

function parseSource(value: unknown): MatchInternalSource {
  if (value === "auto_demand_modificada") return "auto_demand_modificada";
  return "auto_demand_creada";
}

export async function handleMatchDemandAgainstInternal(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const demandId = typeof payload.demandId === "string" ? payload.demandId : "";

  if (!demandId) {
    return {
      success: false,
      error: "MATCH_DEMAND_AGAINST_INTERNAL sin payload.demandId",
      permanent: true,
    };
  }

  if (isMatchingPaused()) {
    console.warn(
      `[match-internal] job ${job.id} demandId=${demandId} — matching pausado: ${MATCHING_PAUSED_REASON}`,
    );
    return { success: true };
  }

  const source = parseSource(payload.source);
  const sourceEventId =
    typeof payload.sourceEventId === "string"
      ? payload.sourceEventId
      : job.sourceEventId ?? null;
  const causationId =
    typeof payload.causationId === "string"
      ? payload.causationId
      : sourceEventId;
  const correlationId =
    typeof payload.correlationId === "string" ? payload.correlationId : null;

  const demandRow = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: {
      codigo: true,
      ref: true,
      nombre: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
      tipos: true,
      zonas: true,
      metrosMin: true,
      metrosMax: true,
      tipoOperacion: true,
      estadoId: true,
    },
  });

  if (!demandRow) {
    console.log(
      `[match-internal] job ${job.id} demandId=${demandId} — demanda no encontrada en demand_current, skip`,
    );
    return { success: true };
  }

  if (!ACTIVE_DEMAND_STATES.includes(demandRow.estadoId)) {
    console.log(
      `[match-internal] job ${job.id} demandId=${demandId} — estado no activo (estadoId=${demandRow.estadoId}), skip`,
    );
    return { success: true };
  }

  if (!demandRow.tipoOperacion) {
    console.log(
      `[match-internal] job ${job.id} demandId=${demandId} — sin tipoOperacion, skip`,
    );
    return { success: true };
  }

  const demand: DemandForMatching = {
    codigo: demandRow.codigo,
    ref: demandRow.ref,
    nombre: demandRow.nombre,
    presupuestoMin: demandRow.presupuestoMin,
    presupuestoMax: demandRow.presupuestoMax,
    habitacionesMin: demandRow.habitacionesMin,
    tipos: demandRow.tipos,
    zonas: demandRow.zonas,
    ...(demandRow.metrosMin != null ? { metrosMin: demandRow.metrosMin } : {}),
    ...(demandRow.metrosMax != null ? { metrosMax: demandRow.metrosMax } : {}),
    ...(demandRow.tipoOperacion ? { tipoOperacion: demandRow.tipoOperacion } : {}),
  };

  const result = await matchPropertiesToDemand(demand);

  const followUpJobs: EnqueueJobInput[] = [];
  let emitted = 0;
  let skipped = 0;
  let bestScore = 0;

  for (const match of result.matches) {
    if (match.totalScore > bestScore) bestScore = match.totalScore;

    const aggregateId = `${match.demandId}:${match.propertyId}`;

    const lastMatch = await prisma.event.findFirst({
      where: { type: "MATCH_GENERADO", aggregateId },
      orderBy: { position: "desc" },
      select: { payload: true },
    });

    if (lastMatch) {
      const prevPayload = lastMatch.payload as Record<string, unknown> | null;
      const prevScore =
        typeof prevPayload?.totalScore === "number" ? prevPayload.totalScore : 0;
      const delta = Math.abs(match.totalScore - prevScore);
      if (delta < SCORE_DELTA_THRESHOLD) {
        skipped++;
        continue;
      }
    }

    const matchEvent = await appendEvent({
      type: "MATCH_GENERADO",
      aggregateType: "MATCH",
      aggregateId,
      payload: {
        demandId: match.demandId,
        demandRef: match.demandRef,
        demandNombre: match.demandNombre,
        propertyId: match.propertyId,
        propertyRef: match.propertyRef,
        totalScore: match.totalScore,
        matchScore: JSON.parse(JSON.stringify(match.matchScore)),
        source,
        sourceEventId,
        causationId,
      } as unknown as JsonValue,
      correlationId: correlationId ?? undefined,
      causationId: causationId ?? undefined,
    });

    followUpJobs.push({
      type: "PROCESS_EVENT",
      payload: { eventId: matchEvent.id },
      idempotencyKey: `process_event:${matchEvent.id}`,
      sourceEventId: matchEvent.id,
    });

    emitted++;
  }

  console.log(
    `[match-internal] job ${job.id} demandId=${demandId} source=${source} — ` +
      `${emitted} emitidos, ${skipped} saltados (Δ<${SCORE_DELTA_THRESHOLD}), ` +
      `bestScore=${bestScore}, ${result.filteredOut} filtrados, ` +
      `${result.geographicallyRejected} geo rechazadas de ${result.totalProperties} propiedades (${result.executionMs}ms)`,
  );

  followUpJobs.push({
    type: "EVALUATE_DEMAND_COVERAGE",
    payload: {
      demandId,
      sourceEventId,
      bestScoreOverride: bestScore,
      matchesEmitted: emitted,
    } as unknown as JsonValue,
    idempotencyKey: sourceEventId
      ? `evaluate_coverage:demand:${sourceEventId}`
      : `evaluate_coverage:demand:${job.id}`,
    sourceEventId: sourceEventId ?? undefined,
  });

  return { success: true, followUpJobs };
}
