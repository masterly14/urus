/**
 * POST /api/matching/rematch
 *
 * Dispara un rematch masivo por demanda. Solo CEO.
 *
 * Body:
 *   { demandIds: string[] }  → demandas concretas
 *   { demandIds: "all" }     → todas las demandas activas
 *
 * Crea un RematchRun con la lista completa, encola el primer lote de 10
 * REBUILD_MATCHES_FOR_DEMAND jobs, y devuelve { runId, totalDemands, totalBatches }.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching";

const BATCH_SIZE = 10;

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Solo el CEO puede disparar un rematch masivo" },
      { status: 403 },
    );
  }

  const existing = await prisma.rematchRun.findFirst({
    where: { status: "RUNNING" },
    select: { id: true, startedAt: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya hay un rematch en curso", runId: existing.id },
      { status: 409 },
    );
  }

  const body = await request.json() as { demandIds: string[] | "all" };

  let demandIds: string[];

  if (body.demandIds === "all") {
    const demands = await prisma.demandCurrent.findMany({
      where: {
        estadoId: { in: ACTIVE_DEMAND_STATES },
        tipoOperacion: { not: "" },
      },
      select: { codigo: true },
      orderBy: { codigo: "asc" },
    });
    demandIds = demands.map((d) => d.codigo);
  } else if (Array.isArray(body.demandIds)) {
    demandIds = body.demandIds;
  } else {
    return NextResponse.json(
      { error: "demandIds debe ser 'all' o un array de IDs" },
      { status: 400 },
    );
  }

  if (demandIds.length === 0) {
    return NextResponse.json(
      { error: "No hay demandas activas elegibles para rematch" },
      { status: 404 },
    );
  }

  const totalBatches = Math.ceil(demandIds.length / BATCH_SIZE);

  const run = await prisma.rematchRun.create({
    data: {
      demandIdsList: demandIds,
      totalDemands: demandIds.length,
      totalBatches,
      triggeredByUserId: session.userId,
    },
  });

  const firstBatch = demandIds.slice(0, BATCH_SIZE);

  for (let i = 0; i < firstBatch.length; i++) {
    const isLast = i === firstBatch.length - 1;
    await enqueueJob({
      type: "REBUILD_MATCHES_FOR_DEMAND",
      payload: {
        demandId: firstBatch[i],
        runId: run.id,
        batchIndex: 0,
        isLastInBatch: isLast,
      },
      priority: 50,
      idempotencyKey: `rebuild_match:${run.id}:${firstBatch[i]}`,
    });
  }

  return NextResponse.json({
    runId: run.id,
    totalDemands: demandIds.length,
    totalBatches,
    message: `Rematch iniciado: ${demandIds.length} demandas en ${totalBatches} lotes de ${BATCH_SIZE}`,
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/matching/rematch" },
  postHandler,
);
