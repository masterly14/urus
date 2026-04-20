/**
 * Handler del job REBUILD_MATCHES_FOR_DEMAND.
 *
 * Payload: { demandId, runId, batchIndex, isLastInBatch }.
 *
 * 1. Carga la demanda desde demands_current (valida activa + tipoOperacion).
 * 2. Ejecuta matchPropertiesToDemand(demand).
 * 3. Por cada match top-20:
 *    - Busca el último MATCH_GENERADO con aggregateId = "${demandId}:${propertyId}".
 *    - Si no existe → emite MATCH_GENERADO + encola PROCESS_EVENT (flujo completo con notificaciones).
 *    - Si existe y |Δscore| ≥ 5 → emite (score cambió).
 *    - Si existe y delta < 5 → salta.
 * 4. Actualiza contadores del RematchRun atómicamente.
 * 5. Si isLastInBatch=true, lee demandIdsList del run y encola el siguiente lote
 *    con scheduledFor = now + 30s.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { JsonValue } from "@/lib/event-store/types";
import { prisma } from "@/lib/prisma";
import { matchPropertiesToDemand } from "@/lib/matching/match-properties";
import { appendEvent } from "@/lib/event-store";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching/match-demands";
import type { DemandForMatching } from "@/lib/matching";

const SCORE_DELTA_THRESHOLD = 5;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 30_000;

interface RebuildPayload {
  demandId: string;
  runId: string;
  batchIndex: number;
  isLastInBatch: boolean;
}

function parsePayload(raw: unknown): RebuildPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.demandId !== "string" || typeof p.runId !== "string") return null;
  return {
    demandId: p.demandId,
    runId: p.runId,
    batchIndex: typeof p.batchIndex === "number" ? p.batchIndex : 0,
    isLastInBatch: p.isLastInBatch === true,
  };
}

export async function handleRebuildMatchesForDemand(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "REBUILD_MATCHES_FOR_DEMAND: payload inválido",
      permanent: true,
    };
  }

  const { demandId, runId, isLastInBatch, batchIndex } = payload;

  const run = await prisma.rematchRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  if (!run || run.status !== "RUNNING") {
    console.log(
      `[rematch] RunId=${runId} no está en RUNNING (${run?.status ?? "no encontrado"}), skip`,
    );
    return { success: true };
  }

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
    console.warn(`[rematch] Demanda ${demandId} no encontrada, skip`);
    await incrementRunCounters(runId, 1, 0, 0);
    return {
      success: true,
      followUpJobs: isLastInBatch
        ? await buildNextBatchJobs(runId, batchIndex)
        : [],
    };
  }

  if (!ACTIVE_DEMAND_STATES.includes(demandRow.estadoId)) {
    console.log(`[rematch] Demanda ${demandId} no activa (estado=${demandRow.estadoId}), skip`);
    await incrementRunCounters(runId, 1, 0, 0);
    return {
      success: true,
      followUpJobs: isLastInBatch
        ? await buildNextBatchJobs(runId, batchIndex)
        : [],
    };
  }

  if (!demandRow.tipoOperacion) {
    console.log(`[rematch] Demanda ${demandId} sin tipoOperacion, skip`);
    await incrementRunCounters(runId, 1, 0, 0);
    return {
      success: true,
      followUpJobs: isLastInBatch
        ? await buildNextBatchJobs(runId, batchIndex)
        : [],
    };
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

  for (const match of result.matches) {
    const aggregateId = `${match.demandId}:${match.propertyId}`;

    const lastMatch = await prisma.event.findFirst({
      where: {
        type: "MATCH_GENERADO",
        aggregateId,
      },
      orderBy: { position: "desc" },
      select: { payload: true },
    });

    if (lastMatch) {
      const prevPayload = lastMatch.payload as Record<string, unknown> | null;
      const prevScore = typeof prevPayload?.totalScore === "number" ? prevPayload.totalScore : 0;
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
        source: "rematch_manual",
        runId,
      } as unknown as JsonValue,
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
    `[rematch] Demanda ${demandId}: ${emitted} emitidos, ${skipped} saltados (Δ<${SCORE_DELTA_THRESHOLD}), ` +
    `${result.filteredOut} filtrados de ${result.totalProperties} propiedades (${result.executionMs}ms)`,
  );

  await incrementRunCounters(runId, 1, emitted, skipped);

  if (isLastInBatch) {
    const nextBatchJobs = await buildNextBatchJobs(runId, batchIndex);
    followUpJobs.push(...nextBatchJobs);
  }

  return { success: true, followUpJobs };
}

async function incrementRunCounters(
  runId: string,
  demandsIncrement: number,
  matchesIncrement: number,
  skippedIncrement: number,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "rematch_runs"
      SET
        "demandsProcessed" = "demandsProcessed" + ${demandsIncrement},
        "matchesEmitted" = "matchesEmitted" + ${matchesIncrement},
        "matchesSkipped" = "matchesSkipped" + ${skippedIncrement},
        "updatedAt" = NOW()
      WHERE "id" = ${runId}
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[rematch] Error actualizando contadores de run ${runId}: ${msg}`);
  }
}

/**
 * Lee demandIdsList del run, extrae el lote siguiente,
 * y genera los jobs con scheduledFor = now + 30s.
 * Si no quedan más lotes, marca el run como COMPLETED.
 */
async function buildNextBatchJobs(
  runId: string,
  currentBatchIndex: number,
): Promise<EnqueueJobInput[]> {
  const run = await prisma.rematchRun.findUnique({
    where: { id: runId },
    select: { demandIdsList: true, totalBatches: true },
  });
  if (!run) return [];

  const allIds = run.demandIdsList as string[];
  const nextBatchIndex = currentBatchIndex + 1;
  const start = nextBatchIndex * BATCH_SIZE;
  const nextBatch = allIds.slice(start, start + BATCH_SIZE);

  if (nextBatch.length === 0) {
    await prisma.rematchRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", currentBatch: currentBatchIndex },
    });
    console.log(`[rematch] Run ${runId} completado`);
    return [];
  }

  await prisma.$executeRaw`
    UPDATE "rematch_runs"
    SET "currentBatch" = ${nextBatchIndex}, "updatedAt" = NOW()
    WHERE "id" = ${runId}
  `;

  const scheduledFor = new Date(Date.now() + BATCH_DELAY_MS);

  return nextBatch.map((demandId, idx) => ({
    type: "REBUILD_MATCHES_FOR_DEMAND" as const,
    payload: {
      demandId,
      runId,
      batchIndex: nextBatchIndex,
      isLastInBatch: idx === nextBatch.length - 1,
    },
    priority: 50,
    availableAt: scheduledFor,
    idempotencyKey: `rebuild_match:${runId}:${demandId}`,
  }));
}
