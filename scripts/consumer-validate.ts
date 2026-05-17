/**
 * Precheck local del consumer Railway.
 *
 * Verifica los prerequisitos antes de subir el servicio a Railway. No
 * modifica datos. Pensado para correr en local (`npm run consumer:validate`)
 * con el `.env` de producción cargado.
 *
 * Comprobaciones:
 *   1. Variables de entorno críticas (con flag bloqueante/warning).
 *   2. Conexión a Neon (`SELECT 1` con timeout 5s).
 *   3. Stats de la cola `job_queue` agrupadas por tipo y status (lectura pura).
 *   4. Coherencia handler ↔ tipos: confirma que cada tipo de
 *      `RAILWAY_CONSUMER_JOB_TYPES` tiene handler registrado.
 *
 * Códigos de salida:
 *   0 — Todos los checks bloqueantes pasan (puede haber WARN).
 *   1 — Al menos un FAIL (no se debería desplegar a Railway).
 *   2 — Excepción inesperada durante la ejecución.
 */

import "dotenv/config";
import type { JobType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  ALL_CONSUMER_JOB_TYPES,
  RAILWAY_CONSUMER_JOB_TYPES,
  getJobHandler,
  getRegisteredTypes,
} from "../lib/workers/consumer";

interface EnvCheck {
  name: string;
  description: string;
  optional?: boolean;
}

const ENV_CHECKS: EnvCheck[] = [
  { name: "DATABASE_URL", description: "Conexión a Neon (cola, eventos, proyecciones)" },
  { name: "WHATSAPP_ACCESS_TOKEN", description: "Token Cloud API Meta" },
  { name: "WHATSAPP_PHONE_NUMBER_ID", description: "Phone Number ID Meta" },
  { name: "OPENAI_API_KEY", description: "OpenAI (NLU, pricing recommendation)" },
  { name: "INMOVILLA_API_TOKEN", description: "Token API REST Inmovilla (egestión)" },
  { name: "STATEFOX_BEARER_TOKEN", description: "Token API Statefox (pricing/microsite)" },
  { name: "CLOUDINARY_CLOUD_NAME", description: "Cloudinary cloud name" },
  { name: "CLOUDINARY_API_KEY", description: "Cloudinary API key" },
  { name: "CLOUDINARY_API_SECRET", description: "Cloudinary API secret" },
  { name: "NEXT_PUBLIC_APP_URL", description: "URL absoluta de la app (links WhatsApp)" },
  { name: "CRON_SECRET", description: "Auth de endpoints internos", optional: true },
  { name: "PORT", description: "Puerto del health server (default 8080)", optional: true },
];

const infos: string[] = [];
const warns: string[] = [];
const fails: string[] = [];

function logInfo(msg: string) {
  infos.push(msg);
}

function logWarn(msg: string) {
  warns.push(msg);
}

function logFail(msg: string) {
  fails.push(msg);
}

function checkEnvVars(): void {
  console.log("\n[1/4] Variables de entorno...");
  for (const check of ENV_CHECKS) {
    const value = process.env[check.name];
    const present = typeof value === "string" && value.trim().length > 0;
    if (present) {
      logInfo(`${check.name} OK`);
    } else if (check.optional) {
      logWarn(`${check.name} no definida (${check.description})`);
    } else {
      logFail(`${check.name} ausente o vacía (${check.description})`);
    }
  }
}

async function checkNeon(): Promise<void> {
  console.log("\n[2/4] Conexión Neon...");
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout 5s en SELECT 1")), 5_000),
  );
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    logInfo("Neon SELECT 1 OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logFail(`Neon: ${msg}`);
  }
}

async function checkQueueStats(): Promise<void> {
  console.log("\n[3/4] Stats de la cola job_queue (lectura pura)...");
  try {
    const rows = await prisma.jobQueue.groupBy({
      by: ["type", "status"],
      _count: { _all: true },
    });

    if (rows.length === 0) {
      logInfo("Cola vacía (0 jobs en job_queue)");
      return;
    }

    const railwaySet = new Set<JobType>(RAILWAY_CONSUMER_JOB_TYPES);
    const allTypesSet = new Set<JobType>(ALL_CONSUMER_JOB_TYPES);
    const pendingByType = new Map<JobType, number>();
    const totalsByStatus = new Map<string, number>();

    for (const row of rows) {
      const count = row._count._all;
      totalsByStatus.set(row.status, (totalsByStatus.get(row.status) ?? 0) + count);
      if (row.status === "PENDING") {
        pendingByType.set(row.type, (pendingByType.get(row.type) ?? 0) + count);
      }
    }

    const totalsParts = [...totalsByStatus.entries()]
      .map(([status, count]) => `${status}=${count}`)
      .join(" ");
    logInfo(`Totales por status: ${totalsParts}`);

    if (pendingByType.size === 0) {
      logInfo("Sin jobs PENDING actualmente");
    } else {
      logInfo(`Jobs PENDING por tipo (${pendingByType.size} tipos):`);
      for (const [type, count] of pendingByType) {
        const tag = railwaySet.has(type)
          ? "[Railway]"
          : "[NO Railway, lo procesa Vercel/cron dedicado]";
        logInfo(`    ${type}: ${count} ${tag}`);
      }
    }

    for (const [type] of pendingByType) {
      if (!allTypesSet.has(type)) {
        logWarn(
          `Tipo PENDING desconocido en ALL_CONSUMER_JOB_TYPES: ${type} (revisar lib/workers/consumer/types.ts)`,
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logFail(`Stats cola: ${msg}`);
  }
}

async function checkHandlerCoverage(): Promise<void> {
  console.log("\n[4/4] Coherencia handler ↔ tipos Railway...");

  await import("../lib/workers/consumer/handlers");
  await import("../lib/workers/consumer/job-handlers");

  const eventTypes = getRegisteredTypes();
  if (eventTypes.length === 0) {
    logFail(
      "No hay event handlers registrados — PROCESS_EVENT no procesará ningún evento",
    );
  } else {
    logInfo(`Event handlers registrados: ${eventTypes.length}`);
  }

  const missing: JobType[] = [];
  for (const type of RAILWAY_CONSUMER_JOB_TYPES) {
    if (type === "PROCESS_EVENT") continue;
    if (!getJobHandler(type)) {
      missing.push(type);
    }
  }

  if (missing.length > 0) {
    logFail(
      `Tipos en RAILWAY_CONSUMER_JOB_TYPES sin job handler registrado: ${missing.join(", ")}`,
    );
  } else {
    logInfo(
      `Todos los tipos Railway (${RAILWAY_CONSUMER_JOB_TYPES.length}) tienen handler directo o delegan a PROCESS_EVENT`,
    );
  }

  logInfo(`Excluidos del subset Railway: IMPORT_STATEFOX_PORTAL_IMAGES, MARKET_*`);
}

function printResults(): boolean {
  console.log("\n===========================================");
  console.log(" Consumer Railway — resultado de validación");
  console.log("===========================================");

  if (infos.length > 0) {
    console.log("\nOK:");
    for (const i of infos) console.log(`  - ${i}`);
  }
  if (warns.length > 0) {
    console.log("\nWARN:");
    for (const w of warns) console.log(`  - ${w}`);
  }
  if (fails.length > 0) {
    console.log("\nFAIL:");
    for (const f of fails) console.log(`  - ${f}`);
  }

  const ok = fails.length === 0;
  console.log(`\nResultado final: ${ok ? "OK" : "FAIL"}`);
  console.log(
    `(${infos.length} OK · ${warns.length} WARN · ${fails.length} FAIL)`,
  );
  return ok;
}

async function main(): Promise<void> {
  console.log("=== Consumer Railway — precheck local ===");

  checkEnvVars();
  await checkNeon();
  await checkQueueStats();
  await checkHandlerCoverage();

  const ok = printResults();
  process.exit(ok ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(
      "\n[consumer-validate] Error fatal:",
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
