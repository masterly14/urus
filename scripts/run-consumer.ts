/**
 * Consumer entrypoint — soporta dos modos:
 *
 *  1. CLI / one-shot (default).
 *     Comportamiento histórico: ejecuta `runConsumerLoop` una vez con
 *     `ALL_CONSUMER_JOB_TYPES`. Termina cuando la cola está vacía durante
 *     varios ciclos consecutivos (red de seguridad para invocaciones cron y
 *     desarrollo local). `npm run consumer`.
 *
 *  2. Always-on (Railway).
 *     Activado con `CONSUMER_ALWAYS_ON=true`. Reinicia `runConsumerLoop`
 *     indefinidamente con un breve sleep entre arranques, levanta un mini
 *     servidor HTTP en `:PORT` con `GET /internal/health` y maneja
 *     SIGTERM/SIGINT para drenado limpio.
 *
 *     Modos:
 *       - `CONSUMER_RAILWAY_MODE=true`: usa `RAILWAY_CONSUMER_JOB_TYPES`
 *         (negocio general; excluye image-worker y pipeline market dedicado).
 *       - `CONSUMER_MARKET_MODE=true`: usa `MARKET_CONSUMER_JOB_TYPES`
 *         (post-crawl de Market). En este modo SOLO se carga
 *         `market-job-handlers`, evitando importar agentes LLM y otras
 *         dependencias que el worker Market no necesita.
 *
 * Variables de entorno:
 *   CONSUMER_ALWAYS_ON         (default false) — modo Railway 24/7.
 *   CONSUMER_RAILWAY_MODE      (default false) — usa subset Railway de tipos.
 *   CONSUMER_MARKET_MODE       (default false) — usa subset Market de tipos.
 *   CONSUMER_MAX_CYCLES        (default 600)   — ciclos por loop interno.
 *   CONSUMER_IDLE_MS           (default 1000)  — sleep entre loops always-on.
 *   CONSUMER_POLL_INTERVAL_MS  (default 500)   — pausa entre `dequeueJob` cuando no hay trabajo (always-on).
 *   PORT                       (default 8080)  — health server (solo always-on).
 */

import "dotenv/config";
import { randomUUID } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { JobType } from "@prisma/client";
import { runConsumerLoop } from "../lib/workers/consumer/consumer";
import {
  ALL_CONSUMER_JOB_TYPES,
  MARKET_CONSUMER_JOB_TYPES,
  RAILWAY_CONSUMER_JOB_TYPES,
} from "../lib/workers/consumer/types";

const DEFAULT_MAX_CYCLES = 600;
const DEFAULT_IDLE_MS = 1_000;
const DEFAULT_POLL_INTERVAL_MS_ALWAYS_ON = 500;
const DEFAULT_POLL_INTERVAL_MS_CLI = 1_000;
const DEFAULT_HEALTH_PORT = 8080;
const SHUTDOWN_TIMEOUT_MS = 15_000;

const cliArgs = process.argv.slice(2);
const ALWAYS_ON =
  process.env.CONSUMER_ALWAYS_ON === "true" || cliArgs.includes("--always-on");
const RAILWAY_MODE =
  process.env.CONSUMER_RAILWAY_MODE === "true" || cliArgs.includes("--railway-mode");
const MARKET_MODE =
  process.env.CONSUMER_MARKET_MODE === "true" || cliArgs.includes("--market-mode");

type ConsumerMode = "default" | "railway" | "market";

interface HealthState {
  startedAt: number;
  lastLoopFinishedAt: number | null;
  totalProcessed: number;
  totalFailed: number;
  loopsRun: number;
  currentlyRunning: boolean;
}

const healthState: HealthState = {
  startedAt: Date.now(),
  lastLoopFinishedAt: null,
  totalProcessed: 0,
  totalFailed: 0,
  loopsRun: 0,
  currentlyRunning: false,
};

let healthServer: ReturnType<typeof createServer> | null = null;
let shuttingDown = false;

function selectJobTypes(): JobType[] {
  if (MARKET_MODE) return MARKET_CONSUMER_JOB_TYPES;
  return RAILWAY_MODE ? RAILWAY_CONSUMER_JOB_TYPES : ALL_CONSUMER_JOB_TYPES;
}

function resolveConsumerMode(): ConsumerMode {
  if (MARKET_MODE && RAILWAY_MODE) {
    throw new Error("CONSUMER_MARKET_MODE y CONSUMER_RAILWAY_MODE no pueden estar activos a la vez.");
  }
  if (MARKET_MODE) return "market";
  if (RAILWAY_MODE) return "railway";
  return "default";
}

/**
 * Carga y registra los handlers correctos para el modo activo.
 *
 * En modo `market` se importa SOLO `market-job-handlers`, evitando arrastrar
 * agentes LLM, WhatsApp, contratos, etc. Esto permite que el proceso arranque
 * sin las env vars del consumer general (OPENAI_API_KEY, BETTER_AUTH_SECRET,
 * ...) y reduce significativamente la superficie cargada en memoria.
 *
 * En el resto de modos se importa el barrel completo, que mantiene el
 * comportamiento histórico (todos los handlers registrados al cargar).
 */
async function loadHandlers(mode: ConsumerMode): Promise<void> {
  if (mode === "market") {
    const { registerMarketJobHandlers } = await import(
      "../lib/workers/consumer/market-job-handlers"
    );
    registerMarketJobHandlers();
    return;
  }

  // Modo general/railway: dispara los side effects de registro completo.
  await import("../lib/workers/consumer");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startHealthServer(port: number): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/internal/health") {
      const body = JSON.stringify({
        status: shuttingDown ? "shutting_down" : "ok",
        railwayMode: RAILWAY_MODE,
        uptimeMs: Date.now() - healthState.startedAt,
        lastLoopFinishedAt: healthState.lastLoopFinishedAt
          ? new Date(healthState.lastLoopFinishedAt).toISOString()
          : null,
        totalProcessed: healthState.totalProcessed,
        totalFailed: healthState.totalFailed,
        loopsRun: healthState.loopsRun,
        currentlyRunning: healthState.currentlyRunning,
        mode: resolveConsumerMode(),
        jobTypes: selectJobTypes().length,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Length", Buffer.byteLength(body).toString());
      res.end(body);
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(port, () => {
    console.log(`[run-consumer] health server escuchando en :${port}`);
  });

  return server;
}

async function runOneLoop(workerId: string, maxCycles: number, pollIntervalMs: number): Promise<void> {
  healthState.currentlyRunning = true;
  try {
    const result = await runConsumerLoop({
      workerId,
      maxCycles,
      batchSize: maxCycles,
      pollIntervalMs,
      types: selectJobTypes(),
    });
    healthState.totalProcessed += result.totalProcessed;
    healthState.totalFailed += result.totalFailed;
    healthState.loopsRun += 1;
    healthState.lastLoopFinishedAt = Date.now();
  } finally {
    healthState.currentlyRunning = false;
  }
}

async function runAlwaysOn(mode: ConsumerMode): Promise<void> {
  const workerId = `${mode}-consumer-${randomUUID().slice(0, 8)}`;
  const maxCycles = Number(process.env.CONSUMER_MAX_CYCLES) || DEFAULT_MAX_CYCLES;
  const idleMs = Number(process.env.CONSUMER_IDLE_MS) || DEFAULT_IDLE_MS;
  const pollIntervalMs =
    Number(process.env.CONSUMER_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS_ALWAYS_ON;
  const port = Number(process.env.PORT) || DEFAULT_HEALTH_PORT;

  healthServer = startHealthServer(port);

  console.log(
    `[run-consumer] Always-on iniciado workerId=${workerId} mode=${mode} maxCycles=${maxCycles} idleMs=${idleMs} pollIntervalMs=${pollIntervalMs} types=${selectJobTypes().length}`,
  );

  while (!shuttingDown) {
    try {
      await runOneLoop(workerId, maxCycles, pollIntervalMs);
    } catch (err) {
      console.error(
        "[run-consumer] Excepcion en loop:",
        err instanceof Error ? err.message : err,
      );
    }
    if (shuttingDown) break;
    await delay(idleMs);
  }

  console.log(
    `[run-consumer] Always-on terminado loops=${healthState.loopsRun} processed=${healthState.totalProcessed} failed=${healthState.totalFailed}`,
  );
}

async function runCliOnce(mode: ConsumerMode): Promise<void> {
  const maxCycles = Number(process.env.CONSUMER_MAX_CYCLES) || DEFAULT_MAX_CYCLES;
  const workerId = `cli-consumer-${randomUUID().slice(0, 8)}`;

  console.log(
    `[run-consumer] Iniciando consumer workerId=${workerId} mode=${mode} maxCycles=${maxCycles} types=${selectJobTypes().length}\n`,
  );

  const result = await runConsumerLoop({
    workerId,
    maxCycles,
    batchSize: maxCycles,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS_CLI,
    types: selectJobTypes(),
  });

  console.log("\n=== Resultado del consumer ===");
  console.log(`  Ciclos         : ${result.cycles}`);
  console.log(`  Procesados     : ${result.totalProcessed}`);
  console.log(`  Fallidos       : ${result.totalFailed}`);
  console.log("==============================\n");
}

function shutdown(signal: string): void {
  if (shuttingDown) {
    console.log(`[run-consumer] ${signal} recibida durante shutdown — ignorada`);
    return;
  }
  console.log(`[run-consumer] recibida ${signal}, iniciando shutdown limpio...`);
  shuttingDown = true;

  if (healthServer) {
    healthServer.close(() => {
      console.log("[run-consumer] health server cerrado");
    });
  }

  setTimeout(() => {
    console.error(
      `[run-consumer] Timeout shutdown ${SHUTDOWN_TIMEOUT_MS}ms — forzando exit(1)`,
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main(): Promise<void> {
  const mode = resolveConsumerMode();
  await loadHandlers(mode);

  if (ALWAYS_ON) {
    await runAlwaysOn(mode);
  } else {
    await runCliOnce(mode);
  }
}

main().catch((err) => {
  console.error(
    "[run-consumer] Error fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
