import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching/match-demands";

const envBatch = process.env.MATCHING_COVERAGE_CRON_BATCH;
const BATCH_SIZE =
  envBatch && !isNaN(Number(envBatch)) ? Number(envBatch) : 200;

/**
 * Cron diario de cobertura de demandas.
 *
 * Recorre demandas activas y encola EVALUATE_DEMAND_COVERAGE por cada una.
 * Idempotency key por día + demandId para evitar duplicados si el cron se
 * ejecuta más de una vez en el mismo día.
 *
 * Cadencia recomendada: diaria (0 6 * * *)
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const demands = await prisma.demandCurrent.findMany({
      where: { estadoId: { in: ACTIVE_DEMAND_STATES } },
      select: { codigo: true },
      take: BATCH_SIZE,
    });

    let enqueued = 0;

    for (const d of demands) {
      await enqueueJob({
        type: "EVALUATE_DEMAND_COVERAGE",
        payload: { demandId: d.codigo, sourceEventId: null },
        idempotencyKey: `evaluate_coverage:cron:${today}:${d.codigo}`,
      });
      enqueued++;
    }

    console.log(
      `[cron/matching-coverage-scan] ${enqueued}/${demands.length} demandas encoladas para evaluación de cobertura`,
    );

    return NextResponse.json({
      demandsScanned: demands.length,
      enqueued,
      date: today,
    });
  } catch (err) {
    console.error(
      "[cron/matching-coverage-scan] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al escanear cobertura de demandas" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/matching-coverage-scan" },
  postHandler,
);

export const maxDuration = 120;
