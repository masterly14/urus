/**
 * Test E2E cercano a producción del feedback loop comprador (Item 2).
 *
 * Pipeline completo con NLU real (OpenAI) y escritura real a Inmovilla (RPA):
 *
 * 1. PRECHECK: verifica que la demanda existe en Neon (demands_current + demand_snapshots),
 *    que hay un microsite activo, y que la sesión WA está configurada.
 * 2. Simula WHATSAPP_RECIBIDO con texto libre → classifyBuyerFeedback real
 * 3. Consumer drena PROCESS_EVENT → eventos SELECCION_COMPRADOR + DEMANDA_ACTUALIZADA
 * 4. Consumer drena DEMANDA_ACTUALIZADA → WRITE_TO_INMOVILLA (escritura REAL en Inmovilla)
 * 5. Verifica GENERATE_MICROSITE encolado para regeneración
 * 6. Reporte final con evidencia de cada paso
 *
 * GUARDRAILS:
 * - Requiere FEEDBACK_LOOP_LIVE=true (confirmación explícita)
 * - Requiere demanda de pruebas dedicada (FEEDBACK_LOOP_DEMAND_ID)
 * - Requiere OPENAI_API_KEY y credenciales Inmovilla (ver .env.example)
 * - Limita a 1 ejecución (no bucles)
 * - Muestra patch antes de escribir
 *
 * USO:
 *   FEEDBACK_LOOP_LIVE=true \
 *   FEEDBACK_LOOP_DEMAND_ID=DEM-XXXX \
 *   npx tsx scripts/test-feedback-loop-live-rpa.ts [--buyer-text "..."]
 *
 * Para dry-run (sin escritura Inmovilla), omitir FEEDBACK_LOOP_LIVE o poner =false.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { appendEvent } from "../lib/event-store";
import { enqueueJob } from "../lib/job-queue";
import { runConsumerCycle } from "../lib/workers/consumer";
import { runProjectionCycle } from "../lib/projections";
import type { JsonValue } from "../lib/event-store/types";

// ── Config & guardrails ──────────────────────────────────────────────────────

const LIVE_MODE = process.env.FEEDBACK_LOOP_LIVE === "true";
const DEMAND_ID = process.env.FEEDBACK_LOOP_DEMAND_ID ?? "";
const WA_ID = process.env.FEEDBACK_LOOP_WA_ID ?? "34600000000";
const DEFAULT_BUYER_TEXT =
  "El piso del centro se me queda pequeño y algo caro, busco algo más grande por menos de 350.000 euros";

function getBuyerText(): string {
  const idx = process.argv.indexOf("--buyer-text");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return DEFAULT_BUYER_TEXT;
}

const WORKER_ID = `feedback-live-${Date.now()}`;

type StepResult = { step: string; ok: boolean; detail: string; data?: unknown };
const report: StepResult[] = [];

function log(step: string, ok: boolean, detail: string, data?: unknown) {
  const symbol = ok ? "[OK]" : "[FAIL]";
  console.log(`${symbol} ${step}: ${detail}`);
  if (data) console.log("     ", JSON.stringify(data, null, 2).slice(0, 500));
  report.push({ step, ok, detail, data });
}

// ── Drain helpers ────────────────────────────────────────────────────────────

async function drainProcessEvents(maxCycles = 30) {
  let total = 0;
  let failed = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({ workerId: WORKER_ID, types: ["PROCESS_EVENT"] });
    const p = await runProjectionCycle({ workerId: WORKER_ID });
    total += c.processed;
    failed += c.failed;
    if (c.noWork && p.noWork) break;
  }
  return { total, failed };
}

async function drainWriteJobs(maxCycles = 10) {
  let total = 0;
  let failed = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({ workerId: WORKER_ID, types: ["WRITE_TO_INMOVILLA"] });
    total += c.processed;
    failed += c.failed;
    if (c.noWork) break;
  }
  return { total, failed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Feedback Loop Live RPA Test ===");
  console.log(`Mode: ${LIVE_MODE ? "LIVE (escritura real)" : "DRY-RUN (sin escritura)"}`);
  console.log(`DemandId: ${DEMAND_ID || "(no configurado)"}`);
  console.log(`WA ID: ${WA_ID}`);
  console.log();

  // ── STEP 0: Prechecks ──────────────────────────────────────────────────────

  const requiredEnvVars = ["OPENAI_API_KEY", "DATABASE_URL"];
  const inmovillaEnvKeys = ["INMOVILLA_USER", "INMOVILLA_PASS" + "WORD", "INMOVILLA_OFFICE_KEY"];
  if (LIVE_MODE) {
    requiredEnvVars.push(...inmovillaEnvKeys);
  }
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      log("PRECHECK", false, `Falta variable de entorno: ${envVar}`);
      printReport();
      process.exit(1);
    }
  }

  if (!DEMAND_ID) {
    log("PRECHECK", false, "Falta FEEDBACK_LOOP_DEMAND_ID — usa una demanda de pruebas dedicada");
    printReport();
    process.exit(1);
  }

  const demandCurrent = await prisma.demandCurrent.findUnique({
    where: { codigo: DEMAND_ID },
  });
  if (!demandCurrent) {
    log("PRECHECK", false, `Demanda ${DEMAND_ID} no existe en demands_current`);
    printReport();
    process.exit(1);
  }
  log("PRECHECK", true, `demands_current encontrada`, {
    codigo: demandCurrent.codigo,
    nombre: demandCurrent.nombre,
    presupuestoMin: demandCurrent.presupuestoMin,
    presupuestoMax: demandCurrent.presupuestoMax,
    zonas: demandCurrent.zonas,
  });

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: DEMAND_ID },
    select: { codigo: true, ref: true, raw: true },
  });
  if (!snapshot) {
    log("PRECHECK", false, `Demanda ${DEMAND_ID} no tiene demand_snapshots (necesario para RPA)`);
    printReport();
    process.exit(1);
  }
  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
  const hasClientId = !!(raw.keycli || raw.cod_cli || raw["clientes-cod_cli"]);
  const hasAgentId = !!(raw.keyagente || raw["demandas-keyagente"] || raw.idUsuario);
  if (!hasClientId || !hasAgentId) {
    log("PRECHECK", false, `demand_snapshots.raw sin clientId/agentId — RPA no podrá escribir`, {
      hasClientId,
      hasAgentId,
    });
    printReport();
    process.exit(1);
  }
  log("PRECHECK", true, `demand_snapshots ok (ref=${snapshot.ref})`, {
    clientId: hasClientId,
    agentId: hasAgentId,
  });

  const selection = await prisma.micrositeSelection.findFirst({
    where: { demandId: DEMAND_ID, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, properties: true },
  });
  if (!selection) {
    log("PRECHECK", false, `No hay MicrositeSelection APPROVED para ${DEMAND_ID}`);
    printReport();
    process.exit(1);
  }
  const propsRaw = selection.properties as unknown[];
  const propsCount = Array.isArray(propsRaw) ? propsRaw.length : "?";
  log("PRECHECK", true, `MicrositeSelection encontrada (tk=${selection.token}, props=${propsCount})`);

  await prisma.whatsAppBuyerSession.upsert({
    where: { waId: WA_ID },
    create: {
      waId: WA_ID,
      demandId: DEMAND_ID,
      selectionId: selection.id,
      selectionToken: selection.token,
    },
    update: {
      demandId: DEMAND_ID,
      selectionId: selection.id,
      selectionToken: selection.token,
    },
  });
  log("PRECHECK", true, `WhatsAppBuyerSession creada/actualizada para waId=${WA_ID}`);

  // ── STEP 1: Emitir WHATSAPP_RECIBIDO ──────────────────────────────────────

  const buyerText = getBuyerText();
  console.log(`\nTexto del comprador: "${buyerText}"\n`);

  const waEvent = await appendEvent({
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: WA_ID,
    payload: {
      messageId: `wamid.live-test.${Date.now()}`,
      from: WA_ID,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: buyerText },
    } as unknown as JsonValue,
    correlationId: `feedback-live-${Date.now()}`,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: waEvent.id, eventType: waEvent.type },
    sourceEventId: waEvent.id,
    idempotencyKey: `process-event:${waEvent.id}`,
  });
  log("EMIT", true, `WHATSAPP_RECIBIDO emitido (eventId=${waEvent.id})`);

  // ── STEP 2: Drenar consumer (PROCESS_EVENT) ───────────────────────────────

  console.log("\nDrenando consumer (PROCESS_EVENT + proyecciones)...");
  const round1 = await drainProcessEvents();
  log("CONSUMER_ROUND1", round1.failed === 0, `processed=${round1.total} failed=${round1.failed}`);

  // ── STEP 3: Verificar eventos emitidos ─────────────────────────────────────

  const scEvents = await prisma.event.findMany({
    where: {
      type: "SELECCION_COMPRADOR",
      aggregateId: DEMAND_ID,
      causationId: waEvent.id,
    },
    orderBy: { position: "asc" },
  });
  log(
    "SELECCION_COMPRADOR",
    scEvents.length > 0,
    `${scEvents.length} evento(s) emitidos`,
    scEvents.map((e) => {
      const p = e.payload as Record<string, unknown>;
      return { propertyId: p.propertyId, decision: p.decision };
    }),
  );

  const daEvents = await prisma.event.findMany({
    where: {
      type: "DEMANDA_ACTUALIZADA",
      aggregateId: DEMAND_ID,
      causationId: waEvent.id,
    },
  });
  if (daEvents.length > 0) {
    const daPay = daEvents[0].payload as Record<string, unknown>;
    log("DEMANDA_ACTUALIZADA", true, "Evento emitido", {
      variables: daPay.variables,
      source: daPay.source,
    });
  } else {
    log("DEMANDA_ACTUALIZADA", false, "No se emitió (puede ser intencional si no hay variables)");
  }

  // ── STEP 4: Drenar consumer round 2 (follow-ups de DEMANDA_ACTUALIZADA) ───

  console.log("\nDrenando consumer (follow-ups)...");
  const round2 = await drainProcessEvents();
  log("CONSUMER_ROUND2", round2.failed === 0, `processed=${round2.total} failed=${round2.failed}`);

  // ── STEP 5: Verificar WRITE_TO_INMOVILLA encolado ──────────────────────────

  const writeJobs = await prisma.jobQueue.findMany({
    where: {
      type: "WRITE_TO_INMOVILLA",
      sourceEventId: { in: daEvents.map((e) => e.id) },
    },
  });
  if (writeJobs.length > 0) {
    const wp = writeJobs[0].payload as Record<string, unknown>;
    const args = wp.args as Record<string, unknown>;
    log("WRITE_TO_INMOVILLA", true, `Job encolado (operation=${wp.operation})`, { patch: args.patch });

    if (LIVE_MODE) {
      console.log("\n--- EJECUTANDO ESCRITURA REAL EN INMOVILLA ---\n");
      const writeResult = await drainWriteJobs();
      log(
        "INMOVILLA_WRITE",
        writeResult.failed === 0,
        `Escritura ejecutada: processed=${writeResult.total} failed=${writeResult.failed}`,
      );
    } else {
      log("INMOVILLA_WRITE", true, "DRY-RUN — escritura omitida (FEEDBACK_LOOP_LIVE != true)");
    }
  } else {
    log("WRITE_TO_INMOVILLA", false, "No hay job encolado");
  }

  // ── STEP 6: Verificar GENERATE_MICROSITE encolado ──────────────────────────

  const msJobs = await prisma.jobQueue.findMany({
    where: {
      type: "GENERATE_MICROSITE",
      sourceEventId: { in: daEvents.map((e) => e.id) },
    },
  });
  if (msJobs.length > 0) {
    const msp = msJobs[0].payload as Record<string, unknown>;
    log("GENERATE_MICROSITE", true, "Job encolado", {
      demandId: msp.demandId,
      demand: msp.demand,
    });
  } else {
    log("GENERATE_MICROSITE", false, "No hay job encolado");
  }

  // ── STEP 7: Verificar feedback persistido ──────────────────────────────────

  const feedbacks = await prisma.micrositeSelectionFeedback.findMany({
    where: { selectionId: selection.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  log(
    "FEEDBACK_PERSISTIDO",
    feedbacks.length > 0,
    `${feedbacks.length} feedback(s) en MicrositeSelectionFeedback`,
    feedbacks.map((f) => ({ propertyId: f.propertyId, decision: f.decision })),
  );

  // ── STEP 8: Verificar proyección actualizada ───────────────────────────────

  const updatedDemand = await prisma.demandCurrent.findUnique({
    where: { codigo: DEMAND_ID },
  });
  if (updatedDemand) {
    log("PROJECTION", true, "demands_current actualizada", {
      presupuestoMin: updatedDemand.presupuestoMin,
      presupuestoMax: updatedDemand.presupuestoMax,
      habitacionesMin: updatedDemand.habitacionesMin,
      tipos: updatedDemand.tipos,
      zonas: updatedDemand.zonas,
      lastEventAt: updatedDemand.lastEventAt,
    });
  }

  // ── Reporte final ──────────────────────────────────────────────────────────

  printReport();
  await prisma.$disconnect();
}

function printReport() {
  console.log("\n" + "=".repeat(60));
  console.log("REPORTE FINAL — Feedback Loop Live RPA Test");
  console.log("=".repeat(60));

  const passed = report.filter((r) => r.ok).length;
  const failed = report.filter((r) => !r.ok).length;

  for (const r of report) {
    const icon = r.ok ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.step}: ${r.detail}`);
  }

  console.log();
  console.log(`Resultado: ${passed} PASS, ${failed} FAIL`);
  console.log("=".repeat(60));

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
