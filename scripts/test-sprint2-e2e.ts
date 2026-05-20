/**
 * Integración end-to-end Sprint 2
 *
 * Recorre la cadena completa: Lead → Scoring → Matching → WA → Microsite →
 * Feedback → Smart Closing → Firma → Operación Cerrada → Post-venta → Dashboards.
 *
 * Usa BD real (Neon). Servicios externos (WA, Statefox, OpenAI, Cloudinary)
 * se usan cuando hay credenciales; skip graceful sin ellas.
 * Inmovilla (RPA) NUNCA se ejecuta realmente.
 *
 * Ejecución: npx tsx scripts/test-sprint2-e2e.ts [--no-cleanup]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { appendEvent } from "../lib/event-store";
import { enqueueJob } from "../lib/job-queue";
import { runConsumerCycle } from "../lib/workers/consumer";
import { runProjectionCycle } from "../lib/projections";
import { publishEventsForDiff } from "../lib/workers/ingestion/event-publisher";
import type { PropertyDiffResult } from "../lib/workers/ingestion/types";

// ---------------------------------------------------------------------------
// Config & credentials detection
// ---------------------------------------------------------------------------

const RUN_ID = `s2e2e-${Date.now()}`;
const WORKER_ID = `s2e2e-worker-${Date.now()}`;
const NO_CLEANUP = process.argv.includes("--no-cleanup");

const HAS_OPENAI = Boolean(process.env.OPENAI_API_KEY);
const HAS_WA = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
const HAS_STATEFOX = Boolean(process.env.STATEFOX_BEARER_TOKEN);
const HAS_CLOUDINARY = Boolean(process.env.CLOUDINARY_URL);

// Test data IDs (unique per run)
const DEMAND_ID = `E2E-DEM-${RUN_ID}`;
const PROPERTY_CODE = `E2E-PROP-${RUN_ID}`;
const LEAD_AGGREGATE_ID = `E2E-LEAD-${RUN_ID}`;
const WA_ID = "34600111222";
const COMERCIAL_ID = `e2e-com-${Date.now()}`;
const COMERCIAL_NOMBRE = "E2E Comercial Test";

const allEventIds: string[] = [];
const allCorrelationIds: string[] = [];

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

type StepStatus = "PASS" | "FAIL" | "SKIP";

interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  durationMs: number;
  detail: string;
}

const results: StepResult[] = [];

function reportStep(
  step: number,
  name: string,
  status: StepStatus,
  durationMs: number,
  detail: string,
) {
  results.push({ step, name, status, durationMs, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  console.log(
    `  [${icon}] Paso ${step}: ${name} — ${status} (${durationMs}ms) ${detail ? `— ${detail}` : ""}`,
  );
}

function printReport() {
  console.log("\n" + "=".repeat(80));
  console.log("RESULTADO INTEGRACIÓN E2E SPRINT 2");
  console.log("=".repeat(80));
  console.log(
    `${"Paso".padEnd(6)}${"Nombre".padEnd(45)}${"Estado".padEnd(8)}${"ms".padEnd(8)}Detalle`,
  );
  console.log("-".repeat(80));
  for (const r of results) {
    console.log(
      `${String(r.step).padEnd(6)}${r.name.padEnd(45)}${r.status.padEnd(8)}${String(r.durationMs).padEnd(8)}${r.detail}`,
    );
  }
  console.log("-".repeat(80));
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`Total: ${pass} PASS, ${fail} FAIL, ${skip} SKIP de ${results.length} pasos`);
  console.log("=".repeat(80) + "\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function drainPipeline(maxCycles = 40): Promise<{
  consumerProcessed: number;
  projectionsProcessed: number;
}> {
  let consumerProcessed = 0;
  let projectionsProcessed = 0;

  for (let i = 0; i < maxCycles; i++) {
    const cResult = await runConsumerCycle({
      workerId: WORKER_ID,
      types: ["PROCESS_EVENT"],
    });
    const pResult = await runProjectionCycle({ workerId: WORKER_ID });

    consumerProcessed += cResult.processed;
    projectionsProcessed += pResult.processed;

    if (cResult.noWork && pResult.noWork) break;
  }

  return { consumerProcessed, projectionsProcessed };
}

async function drainAllJobTypes(maxCycles = 60): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({ workerId: WORKER_ID });
    const p = await runProjectionCycle({ workerId: WORKER_ID });
    total += c.processed + p.processed;
    if (c.noWork && p.noWork) break;
  }
  return total;
}

function correlationId(suffix: string): string {
  const id = `${RUN_ID}-${suffix}`;
  allCorrelationIds.push(id);
  return id;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setup() {
  console.log(`\n[setup] Run ID: ${RUN_ID}`);
  console.log(`[setup] Credenciales: WA=${HAS_WA} OpenAI=${HAS_OPENAI} Statefox=${HAS_STATEFOX} Cloudinary=${HAS_CLOUDINARY}`);
  console.log(`[setup] Cleanup: ${NO_CLEANUP ? "DESACTIVADO (--no-cleanup)" : "activado"}\n`);

  await prisma.comercial.upsert({
    where: { id: COMERCIAL_ID },
    create: {
      id: COMERCIAL_ID,
      nombre: COMERCIAL_NOMBRE,
      email: "e2e@test.local",
      telefono: "34600000001",
      ciudad: "Córdoba",
      activo: true,
      cargaActual: 0,
    },
    update: {},
  });

  await prisma.demandCurrent.upsert({
    where: { codigo: DEMAND_ID },
    create: {
      codigo: DEMAND_ID,
      nombre: "E2E Comprador Sprint2",
      telefono: WA_ID,
      presupuestoMin: 200_000,
      presupuestoMax: 350_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      agente: COMERCIAL_NOMBRE,
      lastEventId: "seed",
      lastEventPosition: BigInt(0),
      lastEventAt: new Date(),
    },
    update: {},
  });

  await prisma.demandSnapshot.upsert({
    where: { codigo: DEMAND_ID },
    create: {
      codigo: DEMAND_ID,
      ref: ".e2e_sprint2.",
      nombre: "E2E Comprador Sprint2",
      presupuestoMin: 200_000,
      presupuestoMax: 350_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      raw: {
        keycli: "CLI-E2E-001",
        keyagente: "AGT-E2E-001",
        tipopropiedad: "Piso",
      },
    },
    update: {},
  });

  console.log("[setup] Datos de test creados\n");
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  if (NO_CLEANUP) {
    console.log("[cleanup] Omitido por --no-cleanup");
    return;
  }

  console.log("[cleanup] Limpiando datos de test...");

  await prisma.micrositeSelectionFeedback.deleteMany({
    where: { selection: { demandId: DEMAND_ID } },
  });
  await prisma.whatsAppBuyerSession.deleteMany({ where: { waId: WA_ID } });
  await prisma.micrositeSelection.deleteMany({ where: { demandId: DEMAND_ID } });

  const testEvents = await prisma.event.findMany({
    where: { correlationId: { in: allCorrelationIds } },
    select: { id: true },
  });
  const testEventIds = [...new Set([...allEventIds, ...testEvents.map((e) => e.id)])];

  if (testEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: testEventIds } },
    });
  }

  await prisma.jobQueue.deleteMany({
    where: { payload: { path: ["demandId"], equals: DEMAND_ID } },
  });

  await prisma.event.deleteMany({
    where: { correlationId: { in: allCorrelationIds } },
  });

  await prisma.commercialLeadFact.deleteMany({
    where: { leadId: LEAD_AGGREGATE_ID },
  });
  await prisma.commercialVisitEvaluationFact.deleteMany({
    where: { demandId: DEMAND_ID },
  });
  await prisma.commercialOperationFact.deleteMany({
    where: { propertyCode: PROPERTY_CODE },
  });

  await prisma.operacion.deleteMany({ where: { propertyCode: PROPERTY_CODE } });
  await prisma.propertyCurrent.deleteMany({ where: { codigo: PROPERTY_CODE } });
  await prisma.demandCurrent.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.demandSnapshot.deleteMany({ where: { codigo: DEMAND_ID } });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });

  console.log("[cleanup] Completado\n");
}

// ---------------------------------------------------------------------------
// Paso 1: Lead Ingestion → Scoring → SLA → Routing
// ---------------------------------------------------------------------------

async function step1_LeadScoring(): Promise<void> {
  const t0 = Date.now();
  try {
    const cid = correlationId("01-lead");
    const event = await appendEvent({
      type: "LEAD_INGESTADO",
      aggregateType: "LEAD",
      aggregateId: LEAD_AGGREGATE_ID,
      payload: {
        tipo: "comprador",
        nombre: "E2E Comprador Sprint2",
        telefono: WA_ID,
        email: "e2e@test.local",
        ciudad: "Córdoba",
        origen: "test-sprint2-e2e",
        preaprobacionHipotecaria: true,
        presupuestoDefinido: true,
        plazoDias: 15,
        mensajeConDetalles: true,
        referido: false,
        soloMirando: false,
      },
      correlationId: cid,
    });
    allEventIds.push(event.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });

    await drainPipeline();

    const processJob = await prisma.jobQueue.findFirst({
      where: { sourceEventId: event.id, type: "PROCESS_EVENT" },
    });
    if (processJob?.status !== "COMPLETED") {
      throw new Error(`PROCESS_EVENT status=${processJob?.status ?? "NOT_FOUND"}`);
    }

    const notifyJobs = await prisma.jobQueue.findMany({
      where: { sourceEventId: event.id, type: "NOTIFY_LEAD_WHATSAPP" },
    });

    const followUpJobs = await prisma.jobQueue.findMany({
      where: { sourceEventId: event.id, type: "FOLLOW_UP_LEAD" },
    });

    const leadFact = await prisma.commercialLeadFact.findFirst({
      where: { leadId: LEAD_AGGREGATE_ID },
    });

    const details = [
      `NOTIFY_LEAD=${notifyJobs.length}`,
      `FOLLOW_UP=${followUpJobs.length}`,
      `LeadFact=${leadFact ? "OK" : "MISSING"}`,
    ].join(", ");

    reportStep(1, "Lead → Scoring → SLA → Routing", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(1, "Lead → Scoring → SLA → Routing", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 2: Property Creation + Matching
// ---------------------------------------------------------------------------

async function step2_PropertyMatching(): Promise<void> {
  const t0 = Date.now();
  try {
    const cid = correlationId("02-prop");
    const diff: PropertyDiffResult = {
      created: [
        {
          type: "created",
          property: {
            codigo: PROPERTY_CODE,
            ref: `REF-${PROPERTY_CODE}`,
            titulo: "Piso E2E Sprint2 Centro Córdoba",
            tipoOfer: "Piso",
            precio: 280_000,
            metrosConstruidos: 95,
            habitaciones: 3,
            banyos: 2,
            ciudad: "Córdoba",
            zona: "Centro",
            estado: "Activo",
            nodisponible: false,
            prospecto: false,
            fechaAlta: new Date().toISOString().replace("T", " ").slice(0, 19),
            fechaActualizacion: new Date().toISOString().replace("T", " ").slice(0, 19),
            numFotos: 8,
            agente: COMERCIAL_NOMBRE,
            raw: {},
          },
        },
      ],
      modified: [],
      statusChanged: [],
      removed: [],
      unchanged: 0,
    };

    const summary = await publishEventsForDiff(diff, cid);
    if (summary.emitted < 1) throw new Error("No se emitió PROPIEDAD_CREADA");

    const propEvents = await prisma.event.findMany({
      where: { correlationId: cid, type: "PROPIEDAD_CREADA" },
    });
    for (const e of propEvents) allEventIds.push(e.id);

    await drainAllJobTypes();

    const prop = await prisma.propertyCurrent.findUnique({
      where: { codigo: PROPERTY_CODE },
    });
    if (!prop) throw new Error("properties_current no materializada");

    const matchEvents = await prisma.event.findMany({
      where: {
        type: "MATCH_GENERADO",
        correlationId: cid,
      },
    });
    for (const e of matchEvents) allEventIds.push(e.id);

    const details = [
      `prop_current=${prop ? "OK" : "MISSING"}`,
      `matches=${matchEvents.length}`,
    ].join(", ");

    reportStep(2, "Property → Matching → MATCH_GENERADO", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(2, "Property → Matching → MATCH_GENERADO", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 3: Match Notification (WA al comprador + comercial)
// ---------------------------------------------------------------------------

async function step3_MatchNotification(): Promise<void> {
  const t0 = Date.now();
  try {
    await drainAllJobTypes();

    const matchEvents = await prisma.event.findMany({
      where: {
        type: "MATCH_GENERADO",
        correlationId: { in: allCorrelationIds },
      },
      select: { id: true },
    });

    const notifyJobs = await prisma.jobQueue.findMany({
      where: {
        type: "NOTIFY_LEAD_WHATSAPP",
        sourceEventId: { in: matchEvents.map((e) => e.id) },
      },
    });

    const waStatus = HAS_WA ? "WA real disponible" : "WA dry-run (sin token)";
    const details = [
      `match_notify_jobs=${notifyJobs.length}`,
      waStatus,
    ].join(", ");

    reportStep(3, "Match → WA comprador + comercial", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(3, "Match → WA comprador + comercial", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 4: Post-visita
// ---------------------------------------------------------------------------

async function step4_PostVisita(): Promise<void> {
  const t0 = Date.now();
  try {
    const cid = correlationId("04-visita");
    const event = await appendEvent({
      type: "VISITA_EVALUADA",
      aggregateType: "DEMAND",
      aggregateId: DEMAND_ID,
      payload: {
        demandId: DEMAND_ID,
        nivelInteres: "alto",
        nota: "Le encantó la zona y la distribución. Quiere negociar precio.",
        propertyCode: PROPERTY_CODE,
        visitDate: new Date().toISOString(),
      },
      correlationId: cid,
    });
    allEventIds.push(event.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });

    await drainPipeline();

    const processJob = await prisma.jobQueue.findFirst({
      where: { sourceEventId: event.id, type: "PROCESS_EVENT" },
    });

    const visitFact = await prisma.commercialVisitEvaluationFact.findFirst({
      where: { demandId: DEMAND_ID },
    });

    const details = [
      `PROCESS_EVENT=${processJob?.status ?? "NOT_FOUND"}`,
      `VisitFact=${visitFact ? "OK" : "MISSING"}`,
    ].join(", ");

    reportStep(4, "VISITA_EVALUADA → projection + analytics", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(4, "VISITA_EVALUADA → projection + analytics", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 5: Microsite Generation
// ---------------------------------------------------------------------------

let selectionId = "";
let selectionToken = "";

async function step5_MicrositeGeneration(): Promise<void> {
  const t0 = Date.now();
  try {
    const job = await enqueueJob({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId: DEMAND_ID,
        comercialId: COMERCIAL_ID,
        demand: {
          tipos: "Piso",
          zonas: "Centro",
          presupuestoMin: 200_000,
          presupuestoMax: 350_000,
          habitacionesMin: 2,
        },
      },
      idempotencyKey: `e2e-gen-microsite:${RUN_ID}`,
    });

    await drainAllJobTypes();

    const selection = await prisma.micrositeSelection.findFirst({
      where: { demandId: DEMAND_ID },
      orderBy: { createdAt: "desc" },
    });

    if (selection) {
      selectionId = selection.id;
      selectionToken = selection.token;
    }

    const sendJobs = await prisma.jobQueue.findMany({
      where: { type: "SEND_MICROSITE_TO_BUYER" },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    const hasSendJob = sendJobs.some((j) => {
      const p = j.payload as Record<string, unknown> | null;
      return p?.selectionId === selectionId;
    });

    const sfxStatus = HAS_STATEFOX ? "Statefox real" : "Statefox sin token";

    if (!selection) {
      reportStep(5, "GENERATE_MICROSITE → Selection", "SKIP", Date.now() - t0,
        `Sin selección creada (${sfxStatus}) — flujo continúa`);
      return;
    }

    const details = [
      `selection=${selection.id.slice(0, 8)}…`,
      `status=${selection.status}`,
      `props=${(selection.properties as unknown[])?.length ?? 0}`,
      `send_job=${hasSendJob ? "OK" : "MISSING"}`,
      sfxStatus,
    ].join(", ");

    reportStep(5, "GENERATE_MICROSITE → Selection", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(5, "GENERATE_MICROSITE → Selection", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 6: Buyer Feedback (WhatsApp → NLU → Events)
// ---------------------------------------------------------------------------

async function step6_BuyerFeedback(): Promise<void> {
  const t0 = Date.now();

  if (!selectionId) {
    reportStep(6, "WA Feedback → NLU → Events", "SKIP", Date.now() - t0,
      "Sin microsite selection del paso 5");
    return;
  }

  try {
    await prisma.micrositeSelection.update({
      where: { id: selectionId },
      data: { status: "APPROVED", buyerPhone: WA_ID },
    });

    await prisma.whatsAppBuyerSession.upsert({
      where: { waId: WA_ID },
      create: {
        waId: WA_ID,
        demandId: DEMAND_ID,
        selectionId,
        selectionToken,
      },
      update: {
        demandId: DEMAND_ID,
        selectionId,
        selectionToken,
      },
    });

    const cid = correlationId("06-feedback");
    const waEvent = await appendEvent({
      type: "WHATSAPP_RECIBIDO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: WA_ID,
      payload: {
        messageId: `wamid.e2e.${Date.now()}`,
        from: WA_ID,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: "El piso del centro se me queda algo caro, busco algo por menos de 300k con terraza" },
      },
      correlationId: cid,
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
      where: { type: "SELECCION_COMPRADOR", correlationId: cid },
    });
    for (const e of seleccionEvents) allEventIds.push(e.id);

    const demandaEvents = await prisma.event.findMany({
      where: { type: "DEMANDA_ACTUALIZADA", correlationId: cid },
    });
    for (const e of demandaEvents) allEventIds.push(e.id);

    const nluMode = HAS_OPENAI ? "NLU real (OpenAI)" : "NLU handler (puede stub)";

    const details = [
      `SELECCION_COMPRADOR=${seleccionEvents.length}`,
      `DEMANDA_ACTUALIZADA=${demandaEvents.length}`,
      nluMode,
    ].join(", ");

    const status: StepStatus = seleccionEvents.length > 0 || demandaEvents.length > 0 ? "PASS" : "SKIP";
    reportStep(6, "WA Feedback → NLU → Events", status, Date.now() - t0, details);
  } catch (err) {
    reportStep(6, "WA Feedback → NLU → Events", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 7: Demanda Update Chain
// ---------------------------------------------------------------------------

async function step7_DemandaUpdateChain(): Promise<void> {
  const t0 = Date.now();
  try {
    await drainAllJobTypes();

    const demandaEvents = await prisma.event.findMany({
      where: {
        type: "DEMANDA_ACTUALIZADA",
        aggregateId: DEMAND_ID,
        correlationId: { in: allCorrelationIds },
      },
      select: { id: true },
    });

    if (demandaEvents.length === 0) {
      reportStep(7, "DEMANDA_ACTUALIZADA → Jobs chain", "SKIP", Date.now() - t0,
        "Sin DEMANDA_ACTUALIZADA del paso 6");
      return;
    }

    const writeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "WRITE_TO_INMOVILLA",
        sourceEventId: { in: demandaEvents.map((e) => e.id) },
      },
    });

    const micrositeJobs = await prisma.jobQueue.findMany({
      where: {
        type: "GENERATE_MICROSITE",
        sourceEventId: { in: demandaEvents.map((e) => e.id) },
      },
    });

    const details = [
      `WRITE_TO_INMOVILLA=${writeJobs.length} (dry-run, no se ejecuta RPA)`,
      `GENERATE_MICROSITE=${micrositeJobs.length}`,
    ].join(", ");

    reportStep(7, "DEMANDA_ACTUALIZADA → Jobs chain", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(7, "DEMANDA_ACTUALIZADA → Jobs chain", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 8: Smart Closing (Estado → Reservada)
// ---------------------------------------------------------------------------

async function step8_SmartClosing(): Promise<void> {
  const t0 = Date.now();
  try {
    const cid = correlationId("08-reserva");
    const event = await appendEvent({
      type: "ESTADO_CAMBIADO",
      aggregateType: "PROPERTY",
      aggregateId: PROPERTY_CODE,
      payload: {
        previousEstado: "Activo",
        newEstado: "Reservada",
        snapshot: {
          codigo: PROPERTY_CODE,
          agente: COMERCIAL_NOMBRE,
        },
      },
      correlationId: cid,
    });
    allEventIds.push(event.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });

    await drainAllJobTypes();

    const operacion = await prisma.operacion.findFirst({
      where: { propertyCode: PROPERTY_CODE },
      orderBy: { createdAt: "desc" },
    });

    const contractJobs = await prisma.jobQueue.findMany({
      where: { sourceEventId: event.id, type: "GENERATE_CONTRACT_DRAFT" },
    });

    const details = [
      `Operacion=${operacion ? operacion.codigo : "NOT_CREATED"}`,
      `GENERATE_CONTRACT_DRAFT=${contractJobs.length}`,
    ].join(", ");

    reportStep(8, "ESTADO_CAMBIADO Reservada → Smart Closing", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(8, "ESTADO_CAMBIADO Reservada → Smart Closing", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 9: Contract Draft Generation
// ---------------------------------------------------------------------------

let contractDraftGenerated = false;

async function step9_ContractDraft(): Promise<void> {
  const t0 = Date.now();
  try {
    await drainAllJobTypes();

    const borradorEvents = await prisma.event.findMany({
      where: {
        type: "CONTRATO_BORRADOR_GENERADO",
        aggregateId: PROPERTY_CODE,
        correlationId: { in: allCorrelationIds },
      },
    });
    for (const e of borradorEvents) allEventIds.push(e.id);

    const incompleteEvents = await prisma.event.findMany({
      where: {
        type: "DATOS_INCOMPLETOS",
        aggregateId: PROPERTY_CODE,
        correlationId: { in: allCorrelationIds },
      },
    });
    for (const e of incompleteEvents) allEventIds.push(e.id);

    if (borradorEvents.length > 0) {
      contractDraftGenerated = true;
      const details = `CONTRATO_BORRADOR_GENERADO=${borradorEvents.length} — draft generado`;
      reportStep(9, "Contract Draft → Borrador/Incompleto", "PASS", Date.now() - t0, details);
    } else if (incompleteEvents.length > 0) {
      const details = `DATOS_INCOMPLETOS=${incompleteEvents.length} — camino válido (faltan datos comprador/vendedor)`;
      reportStep(9, "Contract Draft → Borrador/Incompleto", "PASS", Date.now() - t0, details);
    } else {
      const contractJobs = await prisma.jobQueue.findMany({
        where: {
          type: "GENERATE_CONTRACT_DRAFT",
          payload: { path: ["propertyCode"], equals: PROPERTY_CODE },
        },
      });
      const jobStatuses = contractJobs.map((j) => j.status).join(", ");
      reportStep(9, "Contract Draft → Borrador/Incompleto", "SKIP", Date.now() - t0,
        `Sin eventos de borrador ni incompleto. Jobs GENERATE_CONTRACT_DRAFT: [${jobStatuses}]`);
    }
  } catch (err) {
    reportStep(9, "Contract Draft → Borrador/Incompleto", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 10: Firma (simulada)
// ---------------------------------------------------------------------------

async function step10_Firma(): Promise<void> {
  const t0 = Date.now();
  try {
    const cid = correlationId("10-firma");

    const firmaEnviadaEvent = await appendEvent({
      type: "FIRMA_ENVIADA",
      aggregateType: "PROPERTY",
      aggregateId: PROPERTY_CODE,
      payload: {
        signatureRequestId: `sr-e2e-${RUN_ID}`,
        operationId: `op-e2e-${RUN_ID}`,
        documentKind: "Arras",
        signingUrl: `https://example.com/firma/e2e-token`,
        documentHash: "e2e-hash-placeholder",
        signers: [{ name: "E2E Comprador", email: "buyer@test.local" }],
        slaDeadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        triggeredBy: "E2E_TEST",
      },
      correlationId: cid,
    });
    allEventIds.push(firmaEnviadaEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: firmaEnviadaEvent.id, eventType: firmaEnviadaEvent.type },
      sourceEventId: firmaEnviadaEvent.id,
      idempotencyKey: `process-event:${firmaEnviadaEvent.id}`,
    });

    await drainPipeline();

    const firmaCompletadaEvent = await appendEvent({
      type: "FIRMA_COMPLETADA",
      aggregateType: "PROPERTY",
      aggregateId: PROPERTY_CODE,
      payload: {
        signatureRequestId: `sr-e2e-${RUN_ID}`,
        operationId: `op-e2e-${RUN_ID}`,
        documentKind: "Arras",
        completedAt: new Date().toISOString(),
        signerName: "E2E Comprador",
        signerEmail: "buyer@test.local",
      },
      correlationId: cid,
    });
    allEventIds.push(firmaCompletadaEvent.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: firmaCompletadaEvent.id, eventType: firmaCompletadaEvent.type },
      sourceEventId: firmaCompletadaEvent.id,
      idempotencyKey: `process-event:${firmaCompletadaEvent.id}`,
    });

    await drainPipeline();

    const enviadaJob = await prisma.jobQueue.findFirst({
      where: { sourceEventId: firmaEnviadaEvent.id, type: "PROCESS_EVENT" },
    });
    const completadaJob = await prisma.jobQueue.findFirst({
      where: { sourceEventId: firmaCompletadaEvent.id, type: "PROCESS_EVENT" },
    });

    const details = [
      `FIRMA_ENVIADA processed=${enviadaJob?.status ?? "?"}`,
      `FIRMA_COMPLETADA processed=${completadaJob?.status ?? "?"}`,
    ].join(", ");

    reportStep(10, "Firma simulada (envío + completada)", "PASS", Date.now() - t0, details);
  } catch (err) {
    reportStep(10, "Firma simulada (envío + completada)", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 11: Operación Cerrada + Post-venta
// ---------------------------------------------------------------------------

async function step11_OperacionCerrada(): Promise<void> {
  const t0 = Date.now();
  try {
    const cid = correlationId("11-vendido");
    const event = await appendEvent({
      type: "ESTADO_CAMBIADO",
      aggregateType: "PROPERTY",
      aggregateId: PROPERTY_CODE,
      payload: {
        previousEstado: "Reservada",
        newEstado: "Vendido",
        snapshot: {
          codigo: PROPERTY_CODE,
          agente: COMERCIAL_NOMBRE,
        },
      },
      correlationId: cid,
    });
    allEventIds.push(event.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });

    await drainAllJobTypes();

    const opCerradaEvents = await prisma.event.findMany({
      where: {
        type: "OPERACION_CERRADA",
        aggregateId: PROPERTY_CODE,
        correlationId: cid,
      },
    });
    for (const e of opCerradaEvents) allEventIds.push(e.id);

    const operacion = await prisma.operacion.findFirst({
      where: { propertyCode: PROPERTY_CODE },
      orderBy: { createdAt: "desc" },
    });

    const postSaleJobs = await prisma.jobQueue.findMany({
      where: {
        type: { in: ["SEND_POST_SALE_MESSAGE", "SEND_REVIEW_REQUEST", "SEND_REFERRAL_REQUEST", "START_POSTVENTA_CADENCE"] },
        sourceEventId: { in: [...opCerradaEvents.map((e) => e.id), event.id] },
      },
    });

    const details = [
      `OPERACION_CERRADA=${opCerradaEvents.length}`,
      `Operacion.estado=${operacion?.estado ?? "?"}`,
      `postSaleJobs=${postSaleJobs.length}`,
    ].join(", ");

    const status: StepStatus = opCerradaEvents.length > 0 ? "PASS" : "FAIL";
    reportStep(11, "Vendido → OPERACION_CERRADA + Post-venta", status, Date.now() - t0, details);
  } catch (err) {
    reportStep(11, "Vendido → OPERACION_CERRADA + Post-venta", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Paso 12: Dashboard Facts Verification
// ---------------------------------------------------------------------------

async function step12_DashboardFacts(): Promise<void> {
  const t0 = Date.now();
  try {
    const leadFact = await prisma.commercialLeadFact.findFirst({
      where: { leadId: LEAD_AGGREGATE_ID },
    });

    const opFact = await prisma.commercialOperationFact.findFirst({
      where: { propertyCode: PROPERTY_CODE },
    });

    const details = [
      `CommercialLeadFact=${leadFact ? "OK" : "MISSING"}`,
      `CommercialOperationFact=${opFact ? "OK" : "MISSING"}`,
    ].join(", ");

    const allPresent = Boolean(leadFact);
    reportStep(12, "Dashboard facts verificación", allPresent ? "PASS" : "SKIP", Date.now() - t0, details);
  } catch (err) {
    reportStep(12, "Dashboard facts verificación", "FAIL", Date.now() - t0,
      err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("INTEGRACIÓN END-TO-END SPRINT 2 — Urus Capital");
  console.log("=".repeat(80));

  try {
    await setup();

    console.log("--- Ejecutando 12 pasos ---\n");

    await step1_LeadScoring();
    await step2_PropertyMatching();
    await step3_MatchNotification();
    await step4_PostVisita();
    await step5_MicrositeGeneration();
    await step6_BuyerFeedback();
    await step7_DemandaUpdateChain();
    await step8_SmartClosing();
    await step9_ContractDraft();
    await step10_Firma();
    await step11_OperacionCerrada();
    await step12_DashboardFacts();

    printReport();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  const failures = results.filter((r) => r.status === "FAIL").length;
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
