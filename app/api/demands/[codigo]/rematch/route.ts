/**
 * POST /api/demands/[codigo]/rematch
 *
 * Fuerza el cruce (matching) para una demanda específica sin crear un
 * RematchRun completo. Ejecuta inline: carga la demanda, corre el motor
 * de scoring contra propiedades elegibles, y emite eventos MATCH_GENERADO
 * para los nuevos matches o cambios significativos de score (Δ ≥ 5).
 *
 * Acceso: CEO o Admin.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized, forbidden, isCeoOrAdmin } from "@/lib/auth/session";
import { matchPropertiesToDemand } from "@/lib/matching/match-properties";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching/match-demands";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { DemandForMatching } from "@/lib/matching";
import type { JsonValue } from "@/lib/event-store/types";

const SCORE_DELTA_THRESHOLD = 5;

const postHandler = async (
  request: Request,
  { params }: { params: Promise<{ codigo: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) {
    return forbidden();
  }

  const { codigo } = await params;

  const demandRow = await prisma.demandCurrent.findUnique({
    where: { codigo },
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
    return NextResponse.json(
      { error: "Demanda no encontrada" },
      { status: 404 },
    );
  }

  if (!ACTIVE_DEMAND_STATES.includes(demandRow.estadoId)) {
    return NextResponse.json(
      { error: `Demanda no activa (estado: ${demandRow.estadoId})` },
      { status: 422 },
    );
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

  let emitted = 0;
  let skipped = 0;
  let firstEmittedMatchId: string | null = null;

  for (const match of result.matches) {
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
      if (Math.abs(match.totalScore - prevScore) < SCORE_DELTA_THRESHOLD) {
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
        source: "rematch_inline",
        triggeredBy: session.userId,
      } as unknown as JsonValue,
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: matchEvent.id },
      idempotencyKey: `process_event:${matchEvent.id}`,
      sourceEventId: matchEvent.id,
    });

    if (!firstEmittedMatchId) {
      firstEmittedMatchId = matchEvent.id;
    }
    emitted++;
  }

  return NextResponse.json({
    ok: true,
    demandId: codigo,
    totalProperties: result.totalProperties,
    filteredOut: result.filteredOut,
    matchesEmitted: emitted,
    matchesSkipped: skipped,
    firstEmittedMatchId,
    executionMs: result.executionMs,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/demands/[codigo]/rematch" },
  postHandler,
);
