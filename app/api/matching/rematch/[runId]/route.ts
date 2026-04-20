/**
 * GET /api/matching/rematch/[runId]
 *
 * Devuelve el estado de un RematchRun para el contador en vivo de la UI.
 * Solo CEO.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { failStaleRematchRunIfNeeded } from "@/lib/matching/rematch-stale";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

const BATCH_DELAY_MS = 30_000;

const getHandler = async (
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "ceo") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { runId } = await params;

  let run = await prisma.rematchRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      totalDemands: true,
      totalBatches: true,
      currentBatch: true,
      demandsProcessed: true,
      matchesEmitted: true,
      matchesSkipped: true,
      errorMessage: true,
      startedAt: true,
      updatedAt: true,
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run no encontrado" }, { status: 404 });
  }

  if (await failStaleRematchRunIfNeeded(run)) {
    const refreshed = await prisma.rematchRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        totalDemands: true,
        totalBatches: true,
        currentBatch: true,
        demandsProcessed: true,
        matchesEmitted: true,
        matchesSkipped: true,
        errorMessage: true,
        startedAt: true,
        updatedAt: true,
      },
    });
    if (refreshed) run = refreshed;
  }

  let estimatedEtaMs: number | null = null;

  if (run.status === "RUNNING" && run.demandsProcessed > 0) {
    const elapsedMs = Date.now() - run.startedAt.getTime();
    const msPerDemand = elapsedMs / run.demandsProcessed;
    const remaining = run.totalDemands - run.demandsProcessed;
    const batchesRemaining = run.totalBatches - run.currentBatch - 1;
    estimatedEtaMs = Math.round(
      remaining * msPerDemand + batchesRemaining * BATCH_DELAY_MS,
    );
  }

  return NextResponse.json({
    ...run,
    startedAt: run.startedAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    estimatedEtaMs,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/matching/rematch/[runId]" },
  getHandler,
);
