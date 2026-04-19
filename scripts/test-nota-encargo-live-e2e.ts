/**
 * Flujo live E2E de Nota de Encargo — desde la búsqueda en Inmovilla.
 *
 * Recorre:
 *  1. Login a Inmovilla + fetch tareas pendientes.
 *  2. Filtra captación → fetch detalle → valida → parsea ref + phone.
 *  3. Ingestión: crea TaskSnapshot + NotaEncargoSession + evento + job (instantáneo).
 *  4. Ejecuta job NOTA_ENCARGO_RECORDATORIO → envía WhatsApp real.
 *  5. Simula confirmación del propietario (button_reply "nota_encargo_confirmo").
 *  6. Ejecuta job NOTA_ENCARGO_ENVIAR_FORMULARIO → envía WhatsApp Flow real.
 *  7. Relleno del Flow (live webhook o simulated).
 *  8. Verifica: PDF generado, Cloudinary upload, SignatureRequest, LegalDocument.
 *  9. Procesa FIRMA_ENVIADA → envía link de firma por WhatsApp real.
 * 10. (Opcional) Espera firma humana en /firma/{token}.
 * 11. FIRMA_COMPLETADA → documento firmado enviado al propietario.
 *
 * Uso:
 *   npx tsx scripts/test-nota-encargo-live-e2e.ts --check-env
 *   npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live
 *   npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --no-wait
 *   npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --simulate-form
 *   npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --phone 573113541077
 *   npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --task-id 123456
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { runConsumerCycle } from "@/lib/workers/consumer";
import {
  handleNotaEncargoButtonReply,
  handleNotaEncargoNfmReply,
} from "@/lib/nota-encargo";
import {
  setTestSendInterceptor,
  type TestSendInterceptor,
} from "@/lib/whatsapp/send";
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { fetchTaskList, fetchTaskDetail } from "@/lib/workers/ingestion/tasks/tasks-fetcher";
import {
  isCaptacionTask,
  isValidCaptacionDetail,
  parseNotaEncargoDescrip,
  extractPropertyDataFromRaw,
  type RawTask,
  type TaskDetail,
} from "@/lib/workers/ingestion/tasks/tasks-parser";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type StepStatus = "PASS" | "FAIL" | "SKIP" | "WAIT";

interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  durationMs: number;
  detail: string;
}

interface CliOptions {
  confirmLive: boolean;
  checkEnv: boolean;
  noWait: boolean;
  liveForm: boolean;
  phone: string;
  taskId: string | null;
  timeoutMinutes: number;
}

const RUN_ID = `ne-live-${Date.now()}`;
const WORKER_ID = `ne-live-worker-${randomUUID().slice(0, 8)}`;
const DEFAULT_PHONE = "573113541077";
const DEFAULT_TIMEOUT_MINUTES = 15;
const POLL_MS = 10_000;
const PROCESS_EVENT_MAX_CYCLES = 20;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

const results: StepResult[] = [];
const sentMessages: Array<{ to: string; type: string; payload: unknown }> = [];

// Track created resources for cleanup
let createdSessionId: string | null = null;
let createdTaskSnapshotId: string | null = null;
let usedPropertyCode: string | null = null;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    confirmLive:
      argv.includes("--confirm-live") ||
      process.env.NE_LIVE_E2E_CONFIRM === "true",
    checkEnv: argv.includes("--check-env"),
    noWait: argv.includes("--no-wait"),
    liveForm:
      !argv.includes("--simulate-form") &&
      (argv.includes("--confirm-live") ||
        process.env.NE_LIVE_E2E_CONFIRM === "true"),
    phone: process.env.NE_LIVE_E2E_PHONE?.trim() || DEFAULT_PHONE,
    taskId: null,
    timeoutMinutes:
      Number(process.env.NE_LIVE_E2E_TIMEOUT_MINUTES) ||
      DEFAULT_TIMEOUT_MINUTES,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--phone" && next) options.phone = next.replace(/\D/g, "");
    if (arg === "--task-id" && next) options.taskId = next.trim();
    if (arg === "--timeout-minutes" && next)
      options.timeoutMinutes = Number(next);
  }

  return options;
}

function printUsage() {
  console.log(`
Uso:
  npx tsx scripts/test-nota-encargo-live-e2e.ts --check-env
  npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live
  npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --no-wait
  npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --simulate-form
  npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --phone 573113541077
  npx tsx scripts/test-nota-encargo-live-e2e.ts --confirm-live --task-id 123456

Flags:
  --confirm-live      Ejecuta side effects reales (WhatsApp, Cloudinary, Neon)
  --check-env         Solo valida prerequisitos
  --no-wait           No espera firma humana; imprime signingUrl y termina
  --simulate-form     Simula el relleno del Flow con datos falsos
  --phone <number>    Teléfono para enviar mensajes WhatsApp (default: ${DEFAULT_PHONE})
  --task-id <id>      Código de tarea Inmovilla específica (default: primera captación válida)
  --timeout-minutes N Tiempo máximo de espera para firma humana (default: ${DEFAULT_TIMEOUT_MINUTES})
`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reportStep(
  step: number,
  name: string,
  status: StepStatus,
  durationMs: number,
  detail: string,
) {
  results.push({ step, name, status, durationMs, detail });
  const icon =
    status === "PASS"
      ? "✓"
      : status === "FAIL"
        ? "✗"
        : status === "WAIT"
          ? "…"
          : "○";
  console.log(
    `[${icon}] Paso ${step}: ${name} — ${status} (${durationMs}ms)${detail ? ` — ${detail}` : ""}`,
  );
}

function printSummary() {
  console.log("\n" + "=".repeat(90));
  console.log("NOTA DE ENCARGO LIVE E2E — RESUMEN");
  console.log("=".repeat(90));
  for (const r of results) {
    console.log(
      `${String(r.step).padEnd(4)}${r.name.padEnd(42)}${r.status.padEnd(8)}${String(r.durationMs).padEnd(8)}${r.detail}`,
    );
  }
  console.log("=".repeat(90) + "\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

async function flushOrphanedJobs() {
  const result = await prisma.jobQueue.updateMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      type: {
        in: [
          "NOTA_ENCARGO_RECORDATORIO",
          "NOTA_ENCARGO_CHECK_CONFIRMACION",
          "NOTA_ENCARGO_ENVIAR_FORMULARIO",
          "CREAR_PROSPECTO_INMOVILLA",
        ],
      },
      createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: "DEAD_LETTER", lastError: "Flushed by E2E test — orphaned job" },
  });
  if (result.count > 0) {
    console.log(`  [cleanup] Flushed ${result.count} orphaned nota-encargo jobs`);
  }
}

/**
 * Wipes all test artifacts linked to a given Inmovilla task code and/or
 * property code so that a re-run never hits unique-constraint errors.
 * Real PropertyCurrent / PropertySnapshot rows are NOT touched.
 */
async function cleanupPreviousTestRun(
  inmovillaTaskId: string,
  propertyCode?: string,
) {
  let totalDeleted = 0;

  // 1. Find all sessions linked to this task
  const oldSnapshots = await prisma.taskSnapshot.findMany({
    where: { inmovillaTaskId },
    select: { id: true },
  });
  const snapshotIds = oldSnapshots.map((s) => s.id);

  const oldSessions = await prisma.notaEncargoSession.findMany({
    where: {
      OR: [
        ...(snapshotIds.length ? [{ taskSnapshotId: { in: snapshotIds } }] : []),
        ...(propertyCode ? [{ propertyCode }] : []),
      ],
    },
    select: { id: true, signatureRequestId: true },
  });

  const signatureRequestIds = oldSessions
    .map((s) => s.signatureRequestId)
    .filter((id): id is string => !!id);

  // 2. Delete legal artifacts (parties → documents → request)
  if (signatureRequestIds.length) {
    const docsFromSig = await prisma.legalDocument.findMany({
      where: { signatureRequestId: { in: signatureRequestIds } },
      select: { id: true },
    });
    if (docsFromSig.length) {
      const d1 = await prisma.legalDocumentParty.deleteMany({
        where: { legalDocumentId: { in: docsFromSig.map((d) => d.id) } },
      });
      totalDeleted += d1.count;
      const d2 = await prisma.legalDocument.deleteMany({
        where: { id: { in: docsFromSig.map((d) => d.id) } },
      });
      totalDeleted += d2.count;
    }
    const d3 = await prisma.signatureRequest.deleteMany({
      where: { id: { in: signatureRequestIds } },
    });
    totalDeleted += d3.count;
  }

  // 3. Also clean LegalDocuments linked by operationId (propertyCode) + NOTA_ENCARGO
  //    (these can be orphaned when the session was already deleted but the document wasn't)
  if (propertyCode) {
    const docsFromOp = await prisma.legalDocument.findMany({
      where: { operationId: propertyCode, documentKind: "NOTA_ENCARGO" },
      select: { id: true },
    });
    if (docsFromOp.length) {
      const d4 = await prisma.legalDocumentParty.deleteMany({
        where: { legalDocumentId: { in: docsFromOp.map((d) => d.id) } },
      });
      totalDeleted += d4.count;
      const d5 = await prisma.legalDocument.deleteMany({
        where: { id: { in: docsFromOp.map((d) => d.id) } },
      });
      totalDeleted += d5.count;
    }
  }

  // 4. Delete sessions
  if (oldSessions.length) {
    const d6 = await prisma.notaEncargoSession.deleteMany({
      where: { id: { in: oldSessions.map((s) => s.id) } },
    });
    totalDeleted += d6.count;
  }

  // 5. Delete task snapshots
  if (snapshotIds.length) {
    const d7 = await prisma.taskSnapshot.deleteMany({
      where: { id: { in: snapshotIds } },
    });
    totalDeleted += d7.count;
  }

  if (totalDeleted > 0) {
    console.log(
      `  [cleanup] Eliminados ${totalDeleted} registros de ejecuciones anteriores (task=${inmovillaTaskId})`,
    );
  }
}

async function processEvents(label: string, extraTypes: string[] = []) {
  const types = [
    "PROCESS_EVENT",
    "NOTA_ENCARGO_RECORDATORIO",
    "NOTA_ENCARGO_CHECK_CONFIRMACION",
    "NOTA_ENCARGO_ENVIAR_FORMULARIO",
    "SEND_SIGNATURE_REQUEST",
    "CREAR_PROSPECTO_INMOVILLA",
    ...extraTypes,
  ] as import("@/app/generated/prisma/client").JobType[];
  for (let i = 0; i < PROCESS_EVENT_MAX_CYCLES; i++) {
    const cycle = await runConsumerCycle({
      workerId: WORKER_ID,
      batchSize: 10,
      types,
    });
    if (cycle.noWork) break;
    console.log(
      `  [consumer:${label}] cycle ${i + 1}: ${cycle.processed} processed, ${cycle.failed} failed`,
    );
    await sleep(500);
  }
}

function parseVisitDateTime(fecha: string, hora: string): Date {
  const [year, month, day] = fecha.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, 0);
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv);

  if (!options.confirmLive && !options.checkEnv) {
    printUsage();
    return;
  }

  console.log("\n" + "=".repeat(90));
  console.log("NOTA DE ENCARGO LIVE E2E — desde Inmovilla");
  console.log("=".repeat(90));
  console.log(`Run ID        : ${RUN_ID}`);
  console.log(`Phone override: ${options.phone}`);
  console.log(`Task ID filter: ${options.taskId ?? "(primera captación válida)"}`);
  console.log(`Live mode     : ${options.confirmLive}`);
  console.log(`Wait for firma: ${!options.noWait}`);
  console.log("=".repeat(90) + "\n");

  // --- Step 0: Check environment ---
  let t = Date.now();
  try {
    requireEnv("DATABASE_URL");
    requireEnv("WHATSAPP_ACCESS_TOKEN");
    requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    requireEnv("CLOUDINARY_CLOUD_NAME");
    requireEnv("FIRMA_TOKEN_SECRET");
    requireEnv("INMOVILLA_USER");
    requireEnv("INMOVILLA_PASSWORD");
    requireEnv("INMOVILLA_OFFICE_KEY");
    reportStep(
      0,
      "Check environment",
      "PASS",
      Date.now() - t,
      "All env vars present (incl. Inmovilla)",
    );
  } catch (err) {
    reportStep(0, "Check environment", "FAIL", Date.now() - t, String(err));
    printSummary();
    return;
  }

  if (options.checkEnv) {
    printSummary();
    return;
  }

  if (!options.confirmLive) {
    setTestSendInterceptor((msg) => {
      sentMessages.push(msg);
      console.log(`  [intercepted WA] to=${msg.to} type=${msg.type}`);
    });
  }

  // Flush orphaned jobs from previous test runs to avoid consumer contention
  await flushOrphanedJobs();

  // --- Step 1: Login to Inmovilla + fetch task list ---
  t = Date.now();
  let allTasks: RawTask[];
  try {
    console.log("  [inmovilla] Logging in (headless, persist session)...");
    const inmoSession = await loginToInmovilla({
      headless: true,
      persistSession: true,
    });
    console.log("  [inmovilla] Sesión obtenida — listando tareas...");

    allTasks = await fetchTaskList(inmoSession);
    const captacion = allTasks.filter(isCaptacionTask);

    reportStep(
      1,
      "Inmovilla login + task list",
      "PASS",
      Date.now() - t,
      `${allTasks.length} total, ${captacion.length} captación`,
    );

    // Store inmovilla session for step 2
    (globalThis as Record<string, unknown>).__inmoSession = inmoSession;
  } catch (err) {
    reportStep(
      1,
      "Inmovilla login + task list",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 2: Find valid captación task + fetch detail ---
  t = Date.now();
  let selectedTask: RawTask | null = null;
  let taskDetail: TaskDetail | null = null;
  let parsedDescrip: { ref: string; phone: string } | null = null;
  try {
    const inmoSession = (globalThis as Record<string, unknown>)
      .__inmoSession as Awaited<ReturnType<typeof loginToInmovilla>>;

    const captacionTasks = allTasks!.filter(isCaptacionTask);

    if (captacionTasks.length === 0) {
      throw new Error("No hay tareas de captación en Inmovilla");
    }

    // If user supplied --task-id, find that specific task
    const candidates = options.taskId
      ? captacionTasks.filter((t) => t.codigo === options.taskId)
      : captacionTasks;

    if (candidates.length === 0) {
      throw new Error(
        options.taskId
          ? `Tarea ${options.taskId} no encontrada entre las captaciones`
          : "No hay candidatas",
      );
    }

    // Try each candidate until one passes detail validation
    for (const candidate of candidates) {
      console.log(
        `  [inmovilla] Fetching detail for task ${candidate.codigo} (${candidate.nombreSeguimiento})...`,
      );
      const detail = await fetchTaskDetail(inmoSession, candidate.codigo);

      if (!isValidCaptacionDetail(detail)) {
        console.log(
          `  [inmovilla] Task ${candidate.codigo}: detalle no válido (asunto="${detail.asunto}", cerrada=${detail.tareacerrada}) — skipping`,
        );
        continue;
      }

      const parsed = parseNotaEncargoDescrip(detail.descrip);
      if (!parsed) {
        console.log(
          `  [inmovilla] Task ${candidate.codigo}: descrip parse failed — skipping`,
        );
        continue;
      }

      selectedTask = candidate;
      taskDetail = detail;
      parsedDescrip = parsed;
      break;
    }

    if (!selectedTask || !taskDetail || !parsedDescrip) {
      throw new Error(
        `Ninguna tarea de captación pasa la validación de detalle (${candidates.length} candidatas probadas)`,
      );
    }

    console.log(
      `  [inmovilla] Tarea seleccionada: ${selectedTask.codigo}`,
    );
    console.log(
      `  [inmovilla]   Ref: ${parsedDescrip.ref} | Phone (original): ${parsedDescrip.phone}`,
    );
    console.log(
      `  [inmovilla]   Fecha: ${selectedTask.fecha} Hora: ${selectedTask.hora}`,
    );
    console.log(
      `  [inmovilla]   Agente: ${taskDetail.keyagente_nombre} ${taskDetail.keyagente_apellidos}`,
    );

    reportStep(
      2,
      "Find valid captación task",
      "PASS",
      Date.now() - t,
      `task=${selectedTask.codigo}, ref=${parsedDescrip.ref}`,
    );
  } catch (err) {
    reportStep(
      2,
      "Find valid captación task",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 3: Ingest task → create session + enqueue RECORDATORIO ---
  // Replicate what the tasks-worker does, but force all job availableAt = now
  t = Date.now();
  let sessionId: string;
  let propertyCode: string;
  try {
    const propertyCurrent = await prisma.propertyCurrent.findFirst({
      where: { ref: parsedDescrip!.ref },
    });

    if (!propertyCurrent) {
      throw new Error(
        `PropertyCurrent no encontrada para ref=${parsedDescrip!.ref} — ` +
          `asegúrate de que la propiedad existe en la BD (el properties ingestion debe haberla importado)`,
      );
    }

    propertyCode = propertyCurrent.codigo;
    usedPropertyCode = propertyCode;

    const propertySnapshot = await prisma.propertySnapshot.findUnique({
      where: { codigo: propertyCode },
    });

    const raw = (propertySnapshot?.raw ?? {}) as Record<string, unknown>;
    const propertyData = extractPropertyDataFromRaw(raw, {
      ciudad: propertyCurrent.ciudad,
      zona: propertyCurrent.zona,
    });

    const visitDateTime = parseVisitDateTime(
      selectedTask!.fecha,
      selectedTask!.hora,
    );

    // Always wipe any leftover data from previous runs for this task
    await cleanupPreviousTestRun(selectedTask!.codigo, propertyCode);

    const taskSnapshot = await prisma.taskSnapshot.create({
      data: {
        inmovillaTaskId: selectedTask!.codigo,
        tipo: selectedTask!.nombreSeguimiento,
        asunto: taskDetail!.asunto,
        observaciones: taskDetail!.descrip,
        agenteId: String(taskDetail!.keyagente),
        fechaAgendar: visitDateTime,
        fechaCreacion: new Date(taskDetail!.fechaalta),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw: taskDetail as any,
      },
    });
    createdTaskSnapshotId = taskSnapshot.id;

    // Override phone to test phone for live testing
    const targetPhone = options.phone;
    console.log(
      `  [ingest] Phone override: ${parsedDescrip!.phone} → ${targetPhone}`,
    );

    const notaSession = await prisma.notaEncargoSession.create({
      data: {
        taskSnapshotId: taskSnapshot.id,
        propertyCode,
        propertyRef: parsedDescrip!.ref,
        comercialId:
          propertyCurrent.comercialId ?? String(taskDetail!.keyagente),
        propietarioPhone: targetPhone,
        visitDateTime,
        direccion: propertyData.direccion,
        tipoOperacion: propertyData.tipoOperacion,
        precio: propertyData.precio,
      },
    });
    createdSessionId = notaSession.id;
    sessionId = notaSession.id;

    await appendEvent({
      type: "NOTA_ENCARGO_DETECTADA",
      aggregateType: "PROPERTY",
      aggregateId: propertyCode,
      payload: {
        sessionId: notaSession.id,
        taskId: selectedTask!.codigo,
        propertyRef: parsedDescrip!.ref,
        propietarioPhone: targetPhone,
        visitDateTime: visitDateTime.toISOString(),
      },
    });

    // Enqueue RECORDATORIO immediately for testing
    await enqueueJob({
      type: "NOTA_ENCARGO_RECORDATORIO",
      payload: { sessionId: notaSession.id },
      availableAt: new Date(),
      idempotencyKey: `nota_encargo_recordatorio:${notaSession.id}`,
    });

    console.log(
      `  [ingest] Session creada: ${notaSession.id}`,
    );
    console.log(
      `  [ingest] Dirección: ${propertyData.direccion || "(vacía)"}`,
    );
    console.log(
      `  [ingest] Operación: ${propertyData.tipoOperacion} — Precio: ${propertyData.precio}`,
    );

    reportStep(
      3,
      "Ingest task → session + job",
      "PASS",
      Date.now() - t,
      `session=${notaSession.id}, property=${propertyCode}`,
    );
  } catch (err) {
    reportStep(
      3,
      "Ingest task → session + job",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 4: Process RECORDATORIO ---
  t = Date.now();
  try {
    await processEvents("recordatorio");

    const updated = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (updated.state !== "RECORDATORIO_ENVIADO") {
      throw new Error(`Expected RECORDATORIO_ENVIADO, got ${updated.state}`);
    }

    reportStep(
      4,
      "RECORDATORIO sent",
      "PASS",
      Date.now() - t,
      `state=${updated.state}`,
    );
  } catch (err) {
    reportStep(
      4,
      "RECORDATORIO sent",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 5: Simulate owner confirmation (button reply) ---
  t = Date.now();
  try {
    const handled = await handleNotaEncargoButtonReply(
      options.phone,
      "nota_encargo_confirmo",
    );

    if (!handled) throw new Error("Button reply handler returned false");

    // The confirmation enqueues NOTA_ENCARGO_ENVIAR_FORMULARIO with
    // availableAt = visitDateTime.  Override to now for instant processing.
    const pending = await prisma.jobQueue.findFirst({
      where: {
        type: "NOTA_ENCARGO_ENVIAR_FORMULARIO",
        payload: { path: ["sessionId"], equals: sessionId },
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    if (pending) {
      await prisma.jobQueue.update({
        where: { id: pending.id },
        data: { availableAt: new Date() },
      });
      console.log(
        `  [override] ENVIAR_FORMULARIO job ${pending.id} availableAt → now`,
      );
    }

    // Also override CHECK_CONFIRMACION to now so it processes
    const checkJob = await prisma.jobQueue.findFirst({
      where: {
        type: "NOTA_ENCARGO_CHECK_CONFIRMACION",
        payload: { path: ["sessionId"], equals: sessionId },
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
    if (checkJob) {
      await prisma.jobQueue.update({
        where: { id: checkJob.id },
        data: { availableAt: new Date() },
      });
    }

    const confirmed = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (confirmed.state !== "CONFIRMADA") {
      throw new Error(`Expected CONFIRMADA, got ${confirmed.state}`);
    }

    reportStep(
      5,
      "Owner confirmed",
      "PASS",
      Date.now() - t,
      `state=${confirmed.state}`,
    );
  } catch (err) {
    reportStep(
      5,
      "Owner confirmed",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 6: Process ENVIAR_FORMULARIO ---
  t = Date.now();
  try {
    await processEvents("formulario");

    const sent = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    if (sent.state !== "FORMULARIO_ENVIADO") {
      throw new Error(`Expected FORMULARIO_ENVIADO, got ${sent.state}`);
    }

    reportStep(
      6,
      "Flow sent",
      "PASS",
      Date.now() - t,
      `state=${sent.state}`,
    );
  } catch (err) {
    reportStep(6, "Flow sent", "FAIL", Date.now() - t, String(err));
    printSummary();
    return;
  }

  // --- Step 7: Flow completion — wait for real webhook OR simulate ---
  t = Date.now();
  try {
    if (options.liveForm) {
      console.log(
        `\n  [wait] Rellena el formulario en WhatsApp (${options.timeoutMinutes} min max)...\n`,
      );
      const deadline = Date.now() + options.timeoutMinutes * 60 * 1000;
      let completed = await prisma.notaEncargoSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const waitStates = new Set(["FORMULARIO_ENVIADO", "FORMULARIO_COMPLETADO"]);
      while (
        waitStates.has(completed.state) &&
        Date.now() < deadline
      ) {
        await sleep(POLL_MS);
        process.stdout.write(
          `\r  [wait] Esperando respuesta del formulario... ${Math.ceil((deadline - Date.now()) / 60_000)} min restantes  `,
        );
        completed = await prisma.notaEncargoSession.findUniqueOrThrow({
          where: { id: sessionId },
        });
      }
      process.stdout.write("\n");
      if (completed.state !== "FIRMA_ENVIADA") {
        throw new Error(
          waitStates.has(completed.state)
            ? `Timeout: formulario/firma no completado en ${options.timeoutMinutes} min (state=${completed.state})`
            : `Estado inesperado: ${completed.state}`,
        );
      }
      if (!completed.signatureRequestId)
        throw new Error("signatureRequestId is null");
      if (!completed.documentUrl) throw new Error("documentUrl is null");
      reportStep(
        7,
        "Flow completed + PDF + Signature",
        "PASS",
        Date.now() - t,
        `sigReqId=${completed.signatureRequestId}`,
      );
    } else {
      const formData = {
        flow_token: sessionId,
        nombre_completo: "Juan García López E2E",
        dni: "12345678Z",
        telefono: options.phone,
        domicilio_fiscal: "Calle Mayor 1, 14001 Córdoba",
        duracion_meses: 6,
        tipo_nota: "N2",
        acepta_lopd: true,
      };
      const handled = await handleNotaEncargoNfmReply(
        options.phone,
        JSON.stringify(formData),
      );
      if (!handled) throw new Error("nfm_reply handler returned false");
      const completed = await prisma.notaEncargoSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      if (completed.state !== "FIRMA_ENVIADA") {
        throw new Error(`Expected FIRMA_ENVIADA, got ${completed.state}`);
      }
      if (!completed.signatureRequestId)
        throw new Error("signatureRequestId is null");
      if (!completed.documentUrl) throw new Error("documentUrl is null");
      reportStep(
        7,
        "Flow completed + PDF + Signature",
        "PASS",
        Date.now() - t,
        `sigReqId=${completed.signatureRequestId}`,
      );
    }
  } catch (err) {
    reportStep(
      7,
      "Flow completed + PDF + Signature",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 8: Process FIRMA_ENVIADA event ---
  t = Date.now();
  try {
    await processEvents("firma-enviada");
    reportStep(
      8,
      "FIRMA_ENVIADA processed",
      "PASS",
      Date.now() - t,
      "WhatsApp signing link sent",
    );
  } catch (err) {
    reportStep(
      8,
      "FIRMA_ENVIADA processed",
      "FAIL",
      Date.now() - t,
      String(err),
    );
  }

  // --- Step 9: Verify final state ---
  t = Date.now();
  try {
    const finalSession = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const sigReq = await prisma.signatureRequest.findUnique({
      where: { id: finalSession.signatureRequestId! },
    });

    const legalDoc = await prisma.legalDocument.findUnique({
      where: { signatureRequestId: finalSession.signatureRequestId! },
    });

    const party = legalDoc
      ? await prisma.legalDocumentParty.findFirst({
          where: { legalDocumentId: legalDoc.id },
        })
      : null;

    const checks = [
      ["Session state", finalSession.state === "FIRMA_ENVIADA"],
      ["Session has propietarioNombre", !!finalSession.propietarioNombre],
      ["Session has propietarioDni", !!finalSession.propietarioDni],
      ["Session has documentUrl", !!finalSession.documentUrl],
      ["Session has direccion", !!finalSession.direccion],
      ["SignatureRequest exists", !!sigReq],
      ["SignatureRequest status SENT", sigReq?.status === "SENT"],
      [
        "SignatureRequest documentKind",
        sigReq?.documentKind === "NOTA_ENCARGO",
      ],
      ["SignatureRequest has signingToken", !!sigReq?.signingToken],
      ["LegalDocument exists", !!legalDoc],
      [
        "LegalDocument status SENT_TO_SIGNATURE",
        legalDoc?.status === "SENT_TO_SIGNATURE",
      ],
      ["LegalDocumentParty exists", !!party],
      ["Party role PROPIETARIO", party?.role === "PROPIETARIO"],
      ...(options.liveForm
        ? []
        : [
            [
              "Party fullName matches",
              party?.fullName === "Juan García López E2E",
            ] as const,
          ]),
    ] as const;

    const failed = checks.filter(([, ok]) => !ok);

    if (failed.length > 0) {
      const failedNames = failed.map(([name]) => name).join(", ");
      reportStep(
        9,
        "Verify artifacts",
        "FAIL",
        Date.now() - t,
        `Failed: ${failedNames}`,
      );
    } else {
      const signingUrl = sigReq?.signingUrl ?? "N/A";
      reportStep(
        9,
        "Verify artifacts",
        "PASS",
        Date.now() - t,
        `All ${checks.length} checks passed`,
      );
      console.log(`\n  Signing URL: ${signingUrl}\n`);
    }

    // --- Step 10: Wait for human signature ---
    if (!options.noWait && sigReq?.signingToken) {
      const signingUrl = `${APP_URL}/firma/${sigReq.signingToken}`;
      console.log(
        `\n  Abrir en navegador para firmar:\n  ${signingUrl}\n`,
      );

      const deadline = Date.now() + options.timeoutMinutes * 60 * 1000;
      let signed = false;
      const tFirma = Date.now();

      while (Date.now() < deadline) {
        const current = await prisma.signatureRequest.findUnique({
          where: { id: sigReq.id },
          select: { status: true },
        });

        if (
          current?.status === "SIGNED" ||
          current?.status === "COMPLETED"
        ) {
          signed = true;
          break;
        }

        const remaining = Math.ceil((deadline - Date.now()) / 60_000);
        process.stdout.write(
          `\r  Esperando firma... ${remaining} min restantes  `,
        );
        await sleep(POLL_MS);
      }
      process.stdout.write("\n");

      if (signed) {
        reportStep(
          10,
          "Human signature",
          "PASS",
          Date.now() - tFirma,
          "Firma completada",
        );

        // --- Step 11: FIRMA_COMPLETADA → documento firmado enviado ---
        const tDoc = Date.now();
        try {
          await processEvents("firma-completada");

          const afterFirma =
            await prisma.notaEncargoSession.findUniqueOrThrow({
              where: { id: sessionId },
            });

          const docChecks = [
            [
              "Session state DOCUMENTO_ENVIADO",
              afterFirma.state === "DOCUMENTO_ENVIADO",
            ],
            [
              "Session has signedDocumentUrl",
              !!afterFirma.signedDocumentUrl,
            ],
          ] as const;

          const docFailed = docChecks.filter(([, ok]) => !ok);
          if (docFailed.length > 0) {
            reportStep(
              11,
              "Signed doc sent to owner",
              "FAIL",
              Date.now() - tDoc,
              `Failed: ${docFailed.map(([n]) => n).join(", ")}`,
            );
          } else {
            reportStep(
              11,
              "Signed doc sent to owner",
              "PASS",
              Date.now() - tDoc,
              "PDF firmado enviado por WhatsApp al propietario",
            );
          }

          // --- Step 12: CREAR_PROSPECTO_INMOVILLA ---
          const tProsp = Date.now();
          try {
            await processEvents("crear-prospecto");

            const afterProspecto =
              await prisma.notaEncargoSession.findUniqueOrThrow({
                where: { id: sessionId },
              });

            const prospChecks = [
              [
                "Session state PROSPECTO_CREADO",
                afterProspecto.state === "PROSPECTO_CREADO",
              ],
              [
                "Session has inmovillaCodOfer",
                afterProspecto.inmovillaCodOfer != null,
              ],
            ] as const;

            const prospFailed = prospChecks.filter(([, ok]) => !ok);
            if (prospFailed.length > 0) {
              reportStep(
                12,
                "Prospecto created in Inmovilla",
                "FAIL",
                Date.now() - tProsp,
                `Failed: ${prospFailed.map(([n]) => n).join(", ")}`,
              );
            } else {
              reportStep(
                12,
                "Prospecto created in Inmovilla",
                "PASS",
                Date.now() - tProsp,
                `cod_ofer=${afterProspecto.inmovillaCodOfer}, catastral=${afterProspecto.refCatastral ?? "N/A"}`,
              );
            }
          } catch (err) {
            reportStep(
              12,
              "Prospecto created in Inmovilla",
              "FAIL",
              Date.now() - tProsp,
              String(err),
            );
          }
        } catch (err) {
          reportStep(
            11,
            "Signed doc sent to owner",
            "FAIL",
            Date.now() - tDoc,
            String(err),
          );
        }
      } else {
        reportStep(
          10,
          "Human signature",
          "WAIT",
          Date.now() - tFirma,
          "Timeout — firma pendiente",
        );
        reportStep(
          11,
          "Signed doc sent to owner",
          "SKIP",
          0,
          "Firma no completada",
        );
        reportStep(12, "Prospecto created in Inmovilla", "SKIP", 0, "Firma no completada");
      }
    } else {
      reportStep(
        10,
        "Human signature",
        "SKIP",
        0,
        options.noWait ? "--no-wait" : "No signingToken",
      );
      reportStep(
        11,
        "Signed doc sent to owner",
        "SKIP",
        0,
        "Firma no completada",
      );
      reportStep(12, "Prospecto created in Inmovilla", "SKIP", 0, "Firma no completada");
    }
  } catch (err) {
    reportStep(9, "Verify artifacts", "FAIL", Date.now() - t, String(err));
  }

  if (!options.confirmLive) {
    setTestSendInterceptor(null);
    console.log(
      `\n  Intercepted ${sentMessages.length} WhatsApp messages (dry-run mode)`,
    );
    for (const msg of sentMessages) {
      console.log(`    → ${msg.type} to ${msg.to}`);
    }
  }

  printSummary();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main()
  .catch((error) => {
    console.error(
      "\nFalló Nota de Encargo live E2E:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    // Cleanup test data — only what we created, not real property data
    try {
      if (createdSessionId || createdTaskSnapshotId) {
        // Re-use the same cascade delete we call at the start of each run.
        // We need the inmovillaTaskId — recover it from the snapshot we created.
        let taskCodigo: string | undefined;
        if (createdTaskSnapshotId) {
          const snap = await prisma.taskSnapshot.findUnique({
            where: { id: createdTaskSnapshotId },
            select: { inmovillaTaskId: true },
          });
          taskCodigo = snap?.inmovillaTaskId ?? undefined;
        }
        if (taskCodigo) {
          await cleanupPreviousTestRun(taskCodigo, usedPropertyCode ?? undefined);
        } else if (createdSessionId) {
          // Fallback: delete just by session id
          const session = await prisma.notaEncargoSession.findUnique({
            where: { id: createdSessionId },
            select: { signatureRequestId: true },
          });
          if (session?.signatureRequestId) {
            const docs = await prisma.legalDocument.findMany({
              where: { signatureRequestId: session.signatureRequestId },
              select: { id: true },
            });
            if (docs.length) {
              await prisma.legalDocumentParty.deleteMany({
                where: { legalDocumentId: { in: docs.map((d) => d.id) } },
              });
              await prisma.legalDocument.deleteMany({
                where: { id: { in: docs.map((d) => d.id) } },
              });
            }
            await prisma.signatureRequest.deleteMany({
              where: { id: session.signatureRequestId },
            });
          }
          await prisma.notaEncargoSession.deleteMany({
            where: { id: createdSessionId },
          });
        }
        console.log("[cleanup] Datos de test eliminados (propiedad real intacta)");
      }
    } catch (err) {
      console.warn("[cleanup] Error limpiando:", err);
    }

    await prisma.$disconnect();
  });
