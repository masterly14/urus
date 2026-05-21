/**
 * Market Crawl Dispatcher (always-on)
 *
 * Drena continuamente jobs `MARKET_CRAWL_SEED` usando `runCrawlTick` para
 * evitar depender solo del cron `/api/cron/market/crawl-tick`.
 *
 * Variables:
 * - PORT (default 8081)
 * - MARKET_CRAWL_DISPATCHER_BATCH_SIZE (default 5)
 * - MARKET_CRAWL_DISPATCHER_POLL_MS (default 1500)
 * - MARKET_CRAWL_DISPATCHER_IDLE_MS (default 1000)
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runCrawlTick } from "@/lib/market/scheduler";

const PORT = Number(process.env.PORT ?? 8081);
const BATCH_SIZE = Number(process.env.MARKET_CRAWL_DISPATCHER_BATCH_SIZE ?? 5);
const POLL_MS = Number(process.env.MARKET_CRAWL_DISPATCHER_POLL_MS ?? 1500);
const IDLE_MS = Number(process.env.MARKET_CRAWL_DISPATCHER_IDLE_MS ?? 1000);
const SHUTDOWN_TIMEOUT_MS = 15_000;

interface HealthState {
  startedAt: number;
  loopsRun: number;
  lastTickAt: number | null;
  currentlyRunning: boolean;
  totalProcessed: number;
  totalAccepted: number;
  totalBlocked: number;
  totalFailed: number;
  consecutiveNoWork: number;
}

const healthState: HealthState = {
  startedAt: Date.now(),
  loopsRun: 0,
  lastTickAt: null,
  currentlyRunning: false,
  totalProcessed: 0,
  totalAccepted: 0,
  totalBlocked: 0,
  totalFailed: 0,
  consecutiveNoWork: 0,
};

let shuttingDown = false;
let server: ReturnType<typeof createServer> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(payload).toString());
  res.end(payload);
}

function startHealthServer(port: number): ReturnType<typeof createServer> {
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/internal/health") {
      jsonResponse(res, 200, {
        status: shuttingDown ? "shutting_down" : "ok",
        uptimeMs: Date.now() - healthState.startedAt,
        loopsRun: healthState.loopsRun,
        lastTickAt: healthState.lastTickAt
          ? new Date(healthState.lastTickAt).toISOString()
          : null,
        currentlyRunning: healthState.currentlyRunning,
        batchSize: BATCH_SIZE,
        pollMs: POLL_MS,
        idleMs: IDLE_MS,
        totalProcessed: healthState.totalProcessed,
        totalAccepted: healthState.totalAccepted,
        totalBlocked: healthState.totalBlocked,
        totalFailed: healthState.totalFailed,
        consecutiveNoWork: healthState.consecutiveNoWork,
      });
      return;
    }

    jsonResponse(res, 404, { error: "Not Found" });
  });

  httpServer.listen(port, () => {
    console.log(
      `[market-crawl-dispatcher] health server escuchando en :${port}`,
    );
  });

  return httpServer;
}

async function runLoop(): Promise<void> {
  const workerId = `market-dispatcher-${randomUUID().slice(0, 8)}`;
  console.log(
    `[market-crawl-dispatcher] iniciado workerId=${workerId} batchSize=${BATCH_SIZE} pollMs=${POLL_MS} idleMs=${IDLE_MS}`,
  );

  while (!shuttingDown) {
    healthState.currentlyRunning = true;
    try {
      const result = await runCrawlTick({
        workerId,
        batchSize: BATCH_SIZE,
      });
      healthState.loopsRun += 1;
      healthState.lastTickAt = Date.now();
      healthState.totalProcessed += result.processed;
      healthState.totalAccepted += result.accepted;
      healthState.totalBlocked += result.blocked;
      healthState.totalFailed += result.failed;
      healthState.consecutiveNoWork = result.noWork
        ? healthState.consecutiveNoWork + 1
        : 0;

      if (result.noWork) {
        await delay(IDLE_MS);
      } else {
        await delay(POLL_MS);
      }
    } catch (err) {
      console.error(
        `[market-crawl-dispatcher] error loop: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await delay(Math.max(POLL_MS, 1_500));
    } finally {
      healthState.currentlyRunning = false;
    }
  }

  console.log(
    `[market-crawl-dispatcher] detenido loops=${healthState.loopsRun} processed=${healthState.totalProcessed} accepted=${healthState.totalAccepted} blocked=${healthState.totalBlocked} failed=${healthState.totalFailed}`,
  );
}

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[market-crawl-dispatcher] recibida ${signal}, cerrando...`);
  if (server) {
    server.close(() => {
      console.log("[market-crawl-dispatcher] health server cerrado");
    });
  }
  setTimeout(() => {
    console.error(
      `[market-crawl-dispatcher] timeout ${SHUTDOWN_TIMEOUT_MS}ms, forzando exit(1)`,
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main(): Promise<void> {
  server = startHealthServer(PORT);
  await runLoop();
}

main().catch((err) => {
  console.error(
    "[market-crawl-dispatcher] fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
