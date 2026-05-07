/**
 * POST /api/market/crawls/trigger
 *
 * Dispara manualmente un MARKET_CRAWL_SEED para un seed concreto.
 * Util para QA y para forzar re-captura sin esperar al cron.
 *
 * Body: { seedId: string }
 *
 * Crea MarketCrawlRun (RUNNING) y encola el job con `idempotencyKey =
 * market:crawl:manual:{seedId}:{minuteBucket}`. Si ya hay un trigger en
 * el mismo minuto, se rechaza con 409.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getActiveSourcesV1 } from "@/lib/market/source-mapping";

const bodySchema = z.object({
  seedId: z.string().min(1),
});

const postHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Body invalido: seedId requerido" },
      { status: 400 },
    );
  }

  const seed = await prisma.marketSeed.findUnique({
    where: { id: parsed.data.seedId },
  });
  if (!seed) {
    return NextResponse.json(
      { ok: false, error: "MarketSeed no encontrado" },
      { status: 404 },
    );
  }
  if (!seed.active) {
    return NextResponse.json(
      { ok: false, error: "MarketSeed esta marcado como inactivo" },
      { status: 422 },
    );
  }
  const activeSources = getActiveSourcesV1();
  if (!activeSources.includes(seed.source)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `source ${seed.source} no esta activo. Activos ahora: ${activeSources.join(", ")}` +
          (seed.source === "source_d"
            ? ". Activa MARKET_IDEALISTA_ENABLED=true para Idealista."
            : ""),
      },
      { status: 422 },
    );
  }

  const correlationId = randomUUID();
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `market:crawl:manual:${seed.id}:${minuteBucket}`;

  const run = await prisma.marketCrawlRun.create({
    data: {
      seedId: seed.id,
      source: seed.source,
      status: "RUNNING",
      budgetMs: 60_000,
      budgetRequests: 50,
      cursorIn: seed.lastCursor,
      correlationId,
    },
  });

  try {
    await enqueueJob({
      type: "MARKET_CRAWL_SEED",
      payload: {
        runId: run.id,
        seedId: seed.id,
        source: seed.source,
        operation: seed.operation,
        url: seed.url,
        cursor: seed.lastCursor,
        budgetMs: 60_000,
        budgetRequests: 50,
        traceId: correlationId,
      },
      idempotencyKey,
      priority: Math.max(seed.priority, 200),
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      seedId: seed.id,
      idempotencyKey,
      correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Unique constraint|P2002/i.test(message)) {
      // Ya hay trigger en este minuto. Limpiamos el run huerfano.
      await prisma.marketCrawlRun
        .delete({ where: { id: run.id } })
        .catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Ya hay un trigger manual encolado en el mismo minuto para este seed",
        },
        { status: 409 },
      );
    }
    await prisma.marketCrawlRun
      .update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorCode: "ENQUEUE_ERROR",
          errorMessage: message.slice(0, 2000),
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/crawls/trigger" },
  postHandler,
);

export const dynamic = "force-dynamic";
