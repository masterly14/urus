/**
 * Activa los seeds de Idealista para Cordoba y encola un MARKET_CRAWL_SEED
 * por cada uno. Sirve como bootstrap inmediato para poblar el pipeline
 * (raw -> normalized -> advertiser) sin esperar al scheduler ni depender
 * de MARKET_IDEALISTA_ENABLED en runtime.
 *
 * Pasos:
 *  1. Si no hay seeds Idealista para Cordoba, primero crea los seeds via
 *     `seed-market-idealista-cordoba.ts` (el que ya existe).
 *  2. Activa los seeds (active=true) en una sola operacion.
 *  3. Para cada seed: crea `MarketCrawlRun` (RUNNING) y encola un
 *     `MARKET_CRAWL_SEED` con `idempotencyKey` por minuto.
 *  4. Imprime resumen + recordatorio sobre el Market Worker.
 *
 * Uso:
 *   npx tsx scripts/run-idealista-cordoba-crawl.ts            # ejecuta
 *   npx tsx scripts/run-idealista-cordoba-crawl.ts --dry-run  # solo simula
 *
 * Importante: este script asume que el Market Worker server esta corriendo
 * (MARKET_WORKER_BASE_URL apuntando a un Fastify alcanzable) y que el
 * consumer esta drenando `MARKET_CRAWL_SEED`. Si no, los jobs quedan en
 * cola hasta que esos procesos arranquen.
 *
 * Idempotente: re-ejecutar dentro del mismo minuto no duplica jobs (P2002
 * sobre idempotencyKey).
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

interface RunResult {
  seedsScanned: number;
  seedsActivated: number;
  jobsEnqueued: number;
  duplicates: number;
  failures: number;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    console.log(
      `[run-ide-cordoba] modo=${DRY_RUN ? "DRY-RUN" : "EXECUTE"}`,
    );

    const seeds = await prisma.marketSeed.findMany({
      where: {
        source: "source_d",
        city: "cordoba",
      },
      orderBy: { createdAt: "asc" },
    });

    if (seeds.length === 0) {
      console.error(
        "[run-ide-cordoba] No hay seeds source_d/cordoba en DB. Corre primero:",
      );
      console.error(
        "  npx tsx scripts/seed-market-idealista-cordoba.ts",
      );
      process.exit(2);
    }

    console.log(`[run-ide-cordoba] encontrados=${seeds.length} seeds`);

    const result: RunResult = {
      seedsScanned: seeds.length,
      seedsActivated: 0,
      jobsEnqueued: 0,
      duplicates: 0,
      failures: 0,
    };

    if (!DRY_RUN) {
      const updated = await prisma.marketSeed.updateMany({
        where: {
          id: { in: seeds.map((s) => s.id) },
          active: false,
        },
        data: { active: true },
      });
      result.seedsActivated = updated.count;
      console.log(
        `[run-ide-cordoba] activados=${result.seedsActivated} seeds (los ya activos no se tocaron)`,
      );
    }

    const minuteBucket = Math.floor(Date.now() / 60_000);
    const { enqueueJob } = await import("../lib/job-queue");

    for (const seed of seeds) {
      const correlationId = randomUUID();
      const idempotencyKey = `market:crawl:bootstrap:${seed.id}:${minuteBucket}`;

      if (DRY_RUN) {
        console.log(
          `[run-ide-cordoba] DRY-RUN seedId=${seed.id} url=${seed.url}`,
        );
        continue;
      }

      let runId: string | null = null;
      try {
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
        runId = run.id;

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

        result.jobsEnqueued++;
        console.log(
          `[run-ide-cordoba] ENQUEUED runId=${run.id} url=${seed.url}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/Unique constraint|P2002/i.test(message)) {
          if (runId) {
            await prisma.marketCrawlRun
              .delete({ where: { id: runId } })
              .catch(() => undefined);
          }
          result.duplicates++;
          console.log(
            `[run-ide-cordoba] DUPLICATE (mismo minuto) seedId=${seed.id}`,
          );
        } else {
          if (runId) {
            await prisma.marketCrawlRun
              .update({
                where: { id: runId },
                data: {
                  status: "FAILED",
                  errorCode: "ENQUEUE_ERROR",
                  errorMessage: message.slice(0, 2000),
                  finishedAt: new Date(),
                },
              })
              .catch(() => undefined);
          }
          result.failures++;
          console.error(
            `[run-ide-cordoba] FAIL seedId=${seed.id} error=${message}`,
          );
        }
      }
    }

    console.log("");
    console.log(
      `[run-ide-cordoba] RESUMEN scanned=${result.seedsScanned} activated=${result.seedsActivated} enqueued=${result.jobsEnqueued} duplicates=${result.duplicates} failures=${result.failures}`,
    );

    if (!DRY_RUN && result.jobsEnqueued > 0) {
      console.log("");
      console.log("[run-ide-cordoba] Proximos pasos:");
      console.log(
        "  1. Asegurate de que el Market Worker (Fastify) esta corriendo (Railway o local).",
      );
      console.log(
        "  2. Asegurate de que el consumer drena MARKET_CRAWL_SEED (cron crawl-tick o npm run consumer).",
      );
      console.log(
        "  3. Tras 5-10 min: revisa MarketRawListing, MarketListing y MarketAdvertiser para source_d.",
      );
      console.log(
        "  4. Visita /platform/captacion/oportunidades para ver publicantes reales.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[run-ide-cordoba] fallo fatal:", err);
  process.exit(1);
});
