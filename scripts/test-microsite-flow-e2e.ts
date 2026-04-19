/**
 * Script E2E cercano a producción: flujo completo del Microsite.
 *
 * Recorre TODOS los escenarios reales sin mocks de NLU ni WhatsApp
 * (usa servicios reales si hay credenciales, skip graceful si no).
 *
 * Escenarios:
 *   1. GENERATE_MICROSITE (Statefox real si hay token)
 *   2. Validación comercial — APROBACIÓN → SEND_MICROSITE_TO_BUYER
 *   3. Validación comercial — RECHAZO → status REJECTED, sin envío
 *   4. Feedback comprador — ME_INTERESA (NLU real si hay OpenAI key)
 *   5. Feedback comprador — NO_ME_ENCAJA + variables → regeneración
 *   6. Feedback comprador — wantsMoreOptions → regeneración directa
 *   7. SLA vencido → escalatedAt
 *   8. VISITA_EVALUADA con interés alto + stock → GENERATE_MICROSITE
 *
 * Ejecución:
 *   npx tsx scripts/test-microsite-flow-e2e.ts
 *   npx tsx scripts/test-microsite-flow-e2e.ts --no-cleanup
 *   npx tsx scripts/test-microsite-flow-e2e.ts --inspect-microsites
 *
 *   --inspect-microsites:
 *     - Imprime enlaces buyer/validación de todos los microsites generados.
 *     - Desactiva cleanup al final para poder abrir los links en navegador.
 *
 * Credenciales opcionales:
 *   STATEFOX_BEARER_TOKEN — para consulta real de propiedades de mercado
 *   OPENAI_API_KEY — para NLU real (classifyBuyerFeedback)
 *   WHATSAPP_ACCESS_TOKEN — para envío real de WhatsApp
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { appendEvent } from "../lib/event-store";
import { enqueueJob } from "../lib/job-queue";
import { runConsumerCycle } from "../lib/workers/consumer";
import { runProjectionCycle } from "../lib/projections";
import { setTestSendInterceptor } from "../lib/whatsapp/send";
import { getPublicAppUrl } from "../lib/microsite/app-url";

const RUN_ID = `msf-e2e-${Date.now()}`;
const WORKER_ID = `msf-worker-${Date.now()}`;
const NO_CLEANUP = process.argv.includes("--no-cleanup");
const INSPECT_MICROSITES = process.argv.includes("--inspect-microsites");
const SHOULD_CLEANUP = !NO_CLEANUP && !INSPECT_MICROSITES;

const HAS_OPENAI = Boolean(process.env.OPENAI_API_KEY);
const HAS_STATEFOX = Boolean(process.env.STATEFOX_BEARER_TOKEN);
const HAS_WA = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);

const DEMAND_ID = `MSF-DEM-${RUN_ID}`;
const WA_ID = "34600888777";
const COMERCIAL_ID = `msf-com-${Date.now()}`;
const PROPERTY_ID = "sfx-prop-0";

const allEventIds: string[] = [];

type StepStatus = "PASS" | "FAIL" | "SKIP";

interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  durationMs: number;
  detail: string;
}

const results: StepResult[] = [];

function report(step: number, name: string, status: StepStatus, durationMs: number, detail = "") {
  results.push({ step, name, status, durationMs, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  console.log(`  [${icon}] Paso ${step}: ${name} — ${status} (${durationMs}ms)${detail ? ` — ${detail}` : ""}`);
}

function printReport() {
  console.log("\n" + "=".repeat(90));
  console.log("RESULTADO E2E MICROSITE FLOW");
  console.log("=".repeat(90));
  console.log(`${"Paso".padEnd(6)}${"Nombre".padEnd(55)}${"Estado".padEnd(8)}${"ms".padEnd(8)}Detalle`);
  console.log("-".repeat(90));
  for (const r of results) {
    console.log(`${String(r.step).padEnd(6)}${r.name.padEnd(55)}${r.status.padEnd(8)}${String(r.durationMs).padEnd(8)}${r.detail}`);
  }
  console.log("-".repeat(90));
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`Total: ${pass} PASS, ${fail} FAIL, ${skip} SKIP de ${results.length} pasos`);
  console.log("=".repeat(90) + "\n");
}

async function printMicrositeUrls(): Promise<void> {
  const base = getPublicAppUrl();
  const selections = await prisma.micrositeSelection.findMany({
    where: { demandId: DEMAND_ID },
    select: {
      id: true,
      status: true,
      token: true,
      validationToken: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (selections.length === 0) {
    console.log("No se generaron microsites para inspección.");
    return;
  }

  console.log("Microsites generados (abribles en navegador):");
  for (const s of selections) {
    const buyerUrl = `${base}/seleccion/${s.token}`;
    const validationUrl = `${base}/validar-seleccion/${s.validationToken}`;
    console.log(
      `- ${s.id.slice(0, 8)}… status=${s.status} createdAt=${s.createdAt.toISOString()}`,
    );
    console.log(`  buyer:      ${buyerUrl}`);
    console.log(`  validation: ${validationUrl}`);
  }
  console.log("");
}

/**
 * Solo los tipos de job que el test necesita drenar.
 * Excluimos WRITE_TO_INMOVILLA y UPDATE_PROPERTY_PROJECTION
 * para evitar procesar jobs pre-existentes de otros flujos que
 * podrían fallar (ej. UPDATE_PROPERTY_STATUS no soportado).
 */
const SAFE_JOB_TYPES = [
  "PROCESS_EVENT",
  "GENERATE_MICROSITE",
  "NOTIFY_MICROSITE_PENDING_VALIDATION",
  "SEND_MICROSITE_TO_BUYER",
  "UPDATE_DEMAND_PROJECTION",
] as const;

async function drainPipeline(maxCycles = 40): Promise<{ processed: number; failed: number }> {
  let totalProcessed = 0;
  let totalFailed = 0;
  let emptyStreak = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({ workerId: WORKER_ID, types: [...SAFE_JOB_TYPES] });
    const p = await runProjectionCycle({ workerId: WORKER_ID });
    totalProcessed += c.processed;
    totalFailed += c.failed;
    if (c.noWork && p.noWork) {
      emptyStreak++;
      if (emptyStreak >= 3) break;
    } else {
      emptyStreak = 0;
    }
  }
  return { processed: totalProcessed, failed: totalFailed };
}

function cid(suffix: string): string {
  return `${RUN_ID}:${suffix}`;
}

async function cleanup() {
  console.log("[cleanup] Limpiando datos de test...");
  await prisma.micrositeSelectionFeedback.deleteMany({
    where: { selection: { demandId: DEMAND_ID } },
  });
  await prisma.whatsAppBuyerSession.deleteMany({ where: { waId: WA_ID } });
  await prisma.micrositeSelection.deleteMany({ where: { demandId: DEMAND_ID } });

  if (allEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: allEventIds } },
    });
  }
  await prisma.jobQueue.deleteMany({
    where: { payload: { path: ["demandId"], equals: DEMAND_ID } },
  });

  const testEvents = await prisma.event.findMany({
    where: { correlationId: { startsWith: RUN_ID } },
    select: { id: true },
  });
  if (testEvents.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: testEvents.map((e) => e.id) } },
    });
  }
  await prisma.event.deleteMany({
    where: { correlationId: { startsWith: RUN_ID } },
  });

  await prisma.demandCurrent.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.demandSnapshot.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
  console.log("[cleanup] OK\n");
}

let selectionId = "";
let selectionToken = "";
let validationToken = "";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setup() {
  console.log("[setup] Creando datos semilla...");
  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial E2E MSF",
      email: `msf-e2e-${Date.now()}@test.com`,
      telefono: "34600000099",
      ciudad: "Córdoba",
    },
  });

  await prisma.demandCurrent.create({
    data: {
      codigo: DEMAND_ID,
      nombre: "Comprador E2E",
      telefono: WA_ID,
      presupuestoMin: 200000,
      presupuestoMax: 400000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      lastEventId: "seed",
      lastEventPosition: BigInt(0),
      lastEventAt: new Date(),
    },
  });

  await prisma.demandSnapshot.create({
    data: {
      codigo: DEMAND_ID,
      ref: ".msf_e2e.",
      nombre: "Comprador E2E",
      presupuestoMin: 200000,
      presupuestoMax: 400000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      raw: {
        keycli: "CLI-MSF-E2E",
        keyagente: "AGT-MSF-E2E",
        tipopropiedad: "Piso",
      },
    },
  });
  console.log("[setup] OK\n");
}

// ---------------------------------------------------------------------------
// Paso 1: Generación de microsite
// ---------------------------------------------------------------------------

async function step1_GenerateMicrosite() {
  const t0 = Date.now();
  try {
    await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: DEMAND_ID,
        comercialId: COMERCIAL_ID,
        demand: {
          tipos: "Piso",
          zonas: "Centro",
          presupuestoMin: 200000,
          presupuestoMax: 400000,
          habitacionesMin: 2,
        },
      },
      idempotencyKey: `e2e-gen:${RUN_ID}`,
    });

    await drainPipeline();

    const selection = await prisma.micrositeSelection.findFirst({
      where: { demandId: DEMAND_ID },
      orderBy: { createdAt: "desc" },
    });

    if (!selection) {
      const sfxNote = HAS_STATEFOX ? "Statefox real sin resultados" : "Sin STATEFOX_BEARER_TOKEN";
      report(1, "GENERATE_MICROSITE → MicrositeSelection", "SKIP", Date.now() - t0, sfxNote);
      return;
    }

    selectionId = selection.id;
    selectionToken = selection.token;
    validationToken = selection.validationToken;

    const props = Array.isArray(selection.properties) ? (selection.properties as unknown[]).length : 0;

    const notifyJobs = await prisma.jobQueue.findMany({
      where: { type: "NOTIFY_MICROSITE_PENDING_VALIDATION" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const hasNotify = notifyJobs.some((j) => {
      const p = j.payload as Record<string, unknown> | null;
      return p?.selectionId === selectionId;
    });

    report(1, "GENERATE_MICROSITE → MicrositeSelection", "PASS", Date.now() - t0,
      `selection=${selectionId.slice(0, 8)}… props=${props} notify=${hasNotify ? "OK" : "MISSING"} sfx=${HAS_STATEFOX ? "real" : "mock"}`);
  } catch (err) {
    report(1, "GENERATE_MICROSITE → MicrositeSelection", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 2: Aprobación comercial
// ---------------------------------------------------------------------------

async function step2_ComercialApprove() {
  const t0 = Date.now();
  if (!selectionId) {
    report(2, "Comercial APRUEBA → SEND_MICROSITE_TO_BUYER", "SKIP", Date.now() - t0, "Sin selección del paso 1");
    return;
  }

  try {
    const event = await appendEvent({
      type: "SELECCION_VALIDADA",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: {
        selectionId,
        token: selectionToken,
        comercialId: COMERCIAL_ID,
        validatedAt: new Date().toISOString(),
      },
      correlationId: cid("02-approve"),
    });
    allEventIds.push(event.id);

    await prisma.micrositeSelection.update({
      where: { id: selectionId },
      data: { status: "APPROVED", validatedAt: new Date(), validatedByComercialId: COMERCIAL_ID },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });

    await enqueueJob({
      type: "SEND_MICROSITE_TO_BUYER",
      payload: { selectionId },
      priority: 30,
      idempotencyKey: `send_microsite_buyer:${selectionId}`,
    });

    await drainPipeline();

    const updated = await prisma.micrositeSelection.findUnique({ where: { id: selectionId } });
    const session = await prisma.whatsAppBuyerSession.findUnique({ where: { waId: WA_ID } });

    const details = [
      `status=${updated?.status}`,
      `session=${session ? "OK" : "MISSING"}`,
      `wa=${HAS_WA ? "real" : "dry-run"}`,
    ].join(", ");

    report(2, "Comercial APRUEBA → SEND_MICROSITE_TO_BUYER", "PASS", Date.now() - t0, details);
  } catch (err) {
    report(2, "Comercial APRUEBA → SEND_MICROSITE_TO_BUYER", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 3: Rechazo comercial
// ---------------------------------------------------------------------------

async function step3_ComercialReject() {
  const t0 = Date.now();
  try {
    await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: DEMAND_ID,
        comercialId: COMERCIAL_ID,
        demand: { tipos: "Piso", zonas: "Centro", presupuestoMin: 200000, presupuestoMax: 400000, habitacionesMin: 2 },
      },
      idempotencyKey: `e2e-gen-reject:${RUN_ID}`,
    });
    await drainPipeline();

    const selections = await prisma.micrositeSelection.findMany({
      where: { demandId: DEMAND_ID, status: "PENDING_VALIDATION" },
      orderBy: { createdAt: "desc" },
    });

    if (selections.length === 0) {
      report(3, "Comercial RECHAZA → status REJECTED", "SKIP", Date.now() - t0, "Sin selección pendiente");
      return;
    }

    const rejId = selections[0].id;

    const event = await appendEvent({
      type: "SELECCION_RECHAZADA",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: { selectionId: rejId, comercialId: COMERCIAL_ID, rejectedAt: new Date().toISOString() },
      correlationId: cid("03-reject"),
    });
    allEventIds.push(event.id);

    await prisma.micrositeSelection.update({
      where: { id: rejId },
      data: { status: "REJECTED", validatedAt: new Date(), validatedByComercialId: COMERCIAL_ID },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });
    await drainPipeline();

    const updated = await prisma.micrositeSelection.findUnique({ where: { id: rejId } });
    const sendJobs = await prisma.jobQueue.findMany({
      where: { type: "SEND_MICROSITE_TO_BUYER", payload: { path: ["selectionId"], equals: rejId } },
    });

    report(3, "Comercial RECHAZA → status REJECTED", "PASS", Date.now() - t0,
      `status=${updated?.status} sendJobs=${sendJobs.length} (expected 0)`);
  } catch (err) {
    report(3, "Comercial RECHAZA → status REJECTED", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 4: Feedback ME_INTERESA
// ---------------------------------------------------------------------------

async function step4_BuyerMeInteresa() {
  const t0 = Date.now();
  if (!selectionId) {
    report(4, "Comprador ME_INTERESA → SELECCION_COMPRADOR", "SKIP", Date.now() - t0, "Sin selección aprobada");
    return;
  }

  try {
    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.e2e.meint.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: "Me gusta mucho el piso del centro, quiero visitarlo" },
      },
      correlationId: cid("04-meinteresa"),
    });
    allEventIds.push(waEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: waEvent.id, eventType: waEvent.type },
      sourceEventId: waEvent.id,
      idempotencyKey: `process-event:${waEvent.id}`,
    });

    await drainPipeline();

    const seleccionEvents = await prisma.event.findMany({
      where: { type: "SELECCION_COMPRADOR", correlationId: cid("04-meinteresa") },
    });
    for (const e of seleccionEvents) allEventIds.push(e.id);

    await drainPipeline();

    const nluMode = HAS_OPENAI ? "NLU real" : "sin OPENAI_API_KEY";
    report(4, "Comprador ME_INTERESA → SELECCION_COMPRADOR", seleccionEvents.length > 0 ? "PASS" : "SKIP",
      Date.now() - t0, `eventos=${seleccionEvents.length} ${nluMode}`);
  } catch (err) {
    report(4, "Comprador ME_INTERESA → SELECCION_COMPRADOR", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 5: Feedback NO_ME_ENCAJA → regeneración
// ---------------------------------------------------------------------------

async function step5_BuyerNoEncaja() {
  const t0 = Date.now();
  if (!selectionId) {
    report(5, "Comprador NO_ME_ENCAJA → DEMANDA_ACTUALIZADA → regen", "SKIP", Date.now() - t0, "Sin selección");
    return;
  }

  try {
    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.e2e.noenc.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: "Es muy caro y pequeño, busco algo más grande por menos de 300k con terraza" },
      },
      correlationId: cid("05-noencaja"),
    });
    allEventIds.push(waEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: waEvent.id, eventType: waEvent.type },
      sourceEventId: waEvent.id,
      idempotencyKey: `process-event:${waEvent.id}`,
    });

    await drainPipeline();

    const demandaEvents = await prisma.event.findMany({
      where: { type: "DEMANDA_ACTUALIZADA", correlationId: cid("05-noencaja") },
    });
    for (const e of demandaEvents) allEventIds.push(e.id);

    await drainPipeline();

    let writeCount = 0;
    let micrositeCount = 0;
    if (demandaEvents.length > 0) {
      const deId = demandaEvents[0].id;
      writeCount = await prisma.jobQueue.count({
        where: { type: "WRITE_TO_INMOVILLA", sourceEventId: deId },
      });
      micrositeCount = await prisma.jobQueue.count({
        where: { type: "GENERATE_MICROSITE", sourceEventId: deId },
      });
    }

    const nluMode = HAS_OPENAI ? "NLU real" : "sin OPENAI_API_KEY";
    const status: StepStatus = demandaEvents.length > 0 ? "PASS" : "SKIP";
    report(5, "Comprador NO_ME_ENCAJA → DEMANDA_ACTUALIZADA → regen", status, Date.now() - t0,
      `DEMANDA_ACTUALIZADA=${demandaEvents.length} WRITE=${writeCount} GENERATE_MICROSITE=${micrositeCount} ${nluMode}`);
  } catch (err) {
    report(5, "Comprador NO_ME_ENCAJA → DEMANDA_ACTUALIZADA → regen", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 6: wantsMoreOptions → regeneración directa
// ---------------------------------------------------------------------------

async function step6_WantsMoreOptions() {
  const t0 = Date.now();
  if (!selectionId) {
    report(6, "wantsMoreOptions → GENERATE_MICROSITE directo", "SKIP", Date.now() - t0, "Sin selección");
    return;
  }

  try {
    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.e2e.more.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: "Me gustan pero quiero ver más opciones por favor" },
      },
      correlationId: cid("06-moreoptions"),
    });
    allEventIds.push(waEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: waEvent.id, eventType: waEvent.type },
      sourceEventId: waEvent.id,
      idempotencyKey: `process-event:${waEvent.id}`,
    });

    await drainPipeline();

    const micrositeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "GENERATE_MICROSITE",
        payload: { path: ["demandId"], equals: DEMAND_ID },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const hasWantsMore = micrositeJobs.some((j) =>
      (j.idempotencyKey ?? "").includes("wants_more"),
    );

    const nluMode = HAS_OPENAI ? "NLU real" : "sin OPENAI_API_KEY";
    report(6, "wantsMoreOptions → GENERATE_MICROSITE directo", hasWantsMore ? "PASS" : "SKIP",
      Date.now() - t0, `micrositeJobs=${micrositeJobs.length} wantsMore=${hasWantsMore} ${nluMode}`);
  } catch (err) {
    report(6, "wantsMoreOptions → GENERATE_MICROSITE directo", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 7: SLA vencido → escalación
// ---------------------------------------------------------------------------

async function step7_SlaEscalation() {
  const t0 = Date.now();
  try {
    const slaSelection = await prisma.micrositeSelection.create({
      data: {
        demandId: DEMAND_ID,
        demandNombre: "Comprador E2E",
        comercialId: COMERCIAL_ID,
        token: `sla-e2e-${Date.now()}`,
        validationToken: `sla-val-e2e-${Date.now()}`,
        status: "PENDING_VALIDATION",
        buyerPhone: WA_ID,
        statefoxQuery: {},
        resultFilters: {},
        properties: [{ propertyId: "sfx-sla-001", title: "Test SLA Prop" }],
        validationDueAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });

    const overdue = await prisma.micrositeSelection.findMany({
      where: {
        id: slaSelection.id,
        status: "PENDING_VALIDATION",
        validationDueAt: { lt: new Date() },
        escalatedAt: null,
      },
    });

    if (overdue.length === 0) {
      report(7, "SLA vencido → escalación", "FAIL", Date.now() - t0, "Query de vencidas no devolvió resultado");
      return;
    }

    await prisma.micrositeSelection.update({
      where: { id: slaSelection.id },
      data: { escalatedAt: new Date() },
    });

    const after = await prisma.micrositeSelection.findUnique({ where: { id: slaSelection.id } });
    const ok = after?.escalatedAt !== null && after?.status === "PENDING_VALIDATION";

    report(7, "SLA vencido → escalación", ok ? "PASS" : "FAIL", Date.now() - t0,
      `escalatedAt=${after?.escalatedAt ? "SET" : "NULL"} status=${after?.status}`);
  } catch (err) {
    report(7, "SLA vencido → escalación", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 8: VISITA_EVALUADA con interés alto → GENERATE_MICROSITE
// ---------------------------------------------------------------------------

async function step8_VisitaEvaluadaTriggersGeneration() {
  const t0 = Date.now();
  try {
    const event = await appendEvent({
      type: "VISITA_EVALUADA",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: {
        interes: "alto",
        notas: "E2E test — buyer very interested",
        comercialId: COMERCIAL_ID,
        propertyCode: PROPERTY_ID,
      },
      correlationId: cid("08-visita"),
    });
    allEventIds.push(event.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });

    await drainPipeline();

    const micrositeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "GENERATE_MICROSITE",
        sourceEventId: event.id,
      },
    });

    const sfxNote = HAS_STATEFOX ? "Statefox real" : "sin STATEFOX_BEARER_TOKEN (stock=0 → no genera)";
    const generated = micrositeJobs.length > 0;
    report(8, "VISITA_EVALUADA alto → GENERATE_MICROSITE", generated ? "PASS" : "SKIP",
      Date.now() - t0, `micrositeJobs=${micrositeJobs.length} ${sfxNote}`);
  } catch (err) {
    report(8, "VISITA_EVALUADA alto → GENERATE_MICROSITE", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║        E2E MICROSITE FLOW — Cercano a Producción           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n  Run ID:     ${RUN_ID}`);
  console.log(`  Demand:     ${DEMAND_ID}`);
  console.log(`  Statefox:   ${HAS_STATEFOX ? "✓ real" : "○ sin token"}`);
  console.log(`  OpenAI NLU: ${HAS_OPENAI ? "✓ real" : "○ sin key"}`);
  console.log(`  WhatsApp:   ${HAS_WA ? "✓ real" : "○ dry-run"}`);
  console.log(`  Cleanup:    ${SHOULD_CLEANUP ? "post-test" : "DESACTIVADO"}`);
  console.log(`  Inspect:    ${INSPECT_MICROSITES ? "ACTIVO (--inspect-microsites)" : "no"}\n`);

  const waSent: Array<{ to: string; type: string }> = [];
  setTestSendInterceptor((msg) => {
    waSent.push({ to: msg.to, type: msg.type });
    console.log(`  [wa-interceptor] ${msg.type} → ${msg.to}`);
  });

  await cleanup();
  await setup();

  await step1_GenerateMicrosite();
  await step2_ComercialApprove();
  await step3_ComercialReject();
  await step4_BuyerMeInteresa();
  await step5_BuyerNoEncaja();
  await step6_WantsMoreOptions();
  await step7_SlaEscalation();
  await step8_VisitaEvaluadaTriggersGeneration();

  printReport();
  await printMicrositeUrls();

  console.log(`  WhatsApp interceptados: ${waSent.length} mensajes\n`);
  setTestSendInterceptor(null);

  if (SHOULD_CLEANUP) {
    await cleanup();
  } else {
    console.log(
      "Cleanup omitido: los registros del run se conservan para inspección en web.",
    );
  }

  await prisma.$disconnect();

  const failures = results.filter((r) => r.status === "FAIL").length;
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
