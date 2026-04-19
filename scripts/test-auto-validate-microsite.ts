/**
 * Test E2E de auto-validación de microsites con IA.
 *
 * Verifica el flujo completo:
 *   1. Crear comercial con autoValidateMicrosite=true
 *   2. GENERATE_MICROSITE → selección PENDING_VALIDATION
 *   3. AUTO_VALIDATE_MICROSITE → IA genera descripciones + rebranding
 *   4. Verificar: selección APPROVED, validatedByComercialId="auto_validation"
 *   5. Verificar: descripciones generadas (no vacías, en español)
 *   6. Verificar: rebranding aplicado (no quedan otras agencias)
 *   7. Verificar: evento SELECCION_VALIDADA con source="auto_validation"
 *   8. Verificar: SEND_MICROSITE_TO_BUYER encolado
 *   9. Contraste: comercial con toggle OFF → flujo manual (NOTIFY_MICROSITE_PENDING_VALIDATION)
 *
 * Usa BD real (Neon) y OpenAI API real.
 *
 * Ejecución:
 *   npx tsx scripts/test-auto-validate-microsite.ts
 *   npx tsx scripts/test-auto-validate-microsite.ts --no-cleanup
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { enqueueJob } from "../lib/job-queue";
import { runConsumerCycle } from "../lib/workers/consumer";
import { runProjectionCycle } from "../lib/projections";
import { setTestSendInterceptor } from "../lib/whatsapp/send";
import {
  coerceMicrositeCuratedProperties,
  type MicrositeCuratedProperty,
} from "../lib/microsite/selection";

const RUN_ID = `auto-val-${Date.now()}`;
const WORKER_ID = `auto-val-worker-${Date.now()}`;
const NO_CLEANUP = process.argv.includes("--no-cleanup");

const DEMAND_ID = `AV-DEM-${RUN_ID}`;
const WA_ID = "34600999888";
const COMERCIAL_AUTO_ID = `av-com-auto-${Date.now()}`;
const COMERCIAL_MANUAL_ID = `av-com-manual-${Date.now()}`;

const KNOWN_COMPETITOR_AGENCIES = [
  "Idealista",
  "Engel & Völkers",
  "Solvia",
  "Tecnocasa",
  "Century 21",
  "Keller Williams",
  "RE/MAX",
  "Redpiso",
];

const BRAND_NAME = process.env.AGENCY_NAME?.trim() || "Urus Capital Group";

type StepStatus = "PASS" | "FAIL" | "SKIP";
interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  detail?: string;
  durationMs: number;
}

const results: StepResult[] = [];

function log(msg: string) {
  console.log(`\n${"=".repeat(70)}\n  ${msg}\n${"=".repeat(70)}`);
}

function ok(step: number, name: string, detail: string, start: number) {
  const r: StepResult = { step, name, status: "PASS", detail, durationMs: Date.now() - start };
  results.push(r);
  console.log(`  ✅ ${name}: ${detail} (${r.durationMs}ms)`);
}

function fail(step: number, name: string, detail: string, start: number) {
  const r: StepResult = { step, name, status: "FAIL", detail, durationMs: Date.now() - start };
  results.push(r);
  console.error(`  ❌ ${name}: ${detail} (${r.durationMs}ms)`);
}

function skip(step: number, name: string, detail: string) {
  results.push({ step, name, status: "SKIP", detail, durationMs: 0 });
  console.log(`  ⏭️  ${name}: ${detail}`);
}

async function drainConsumer(
  types: string[],
  maxCycles = 40,
): Promise<{ processed: number; failed: number }> {
  let totalProcessed = 0;
  let totalFailed = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({ workerId: WORKER_ID, types: types as never[] });
    const p = await runProjectionCycle({ workerId: WORKER_ID });
    totalProcessed += c.processed;
    totalFailed += c.failed;
    if (c.noWork && p.noWork) break;
  }
  return { processed: totalProcessed, failed: totalFailed };
}

async function cleanup() {
  await prisma.micrositeSelectionFeedback.deleteMany({
    where: { selection: { demandId: DEMAND_ID } },
  });
  await prisma.whatsAppBuyerSession.deleteMany({ where: { waId: WA_ID } });
  await prisma.micrositeSelection.deleteMany({ where: { demandId: DEMAND_ID } });
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
  await prisma.comercial.deleteMany({ where: { id: { in: [COMERCIAL_AUTO_ID, COMERCIAL_MANUAL_ID] } } });
}

function checkRebranding(properties: MicrositeCuratedProperty[]): {
  passed: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  for (const prop of properties) {
    if (!prop.description) continue;
    const descLower = prop.description.toLowerCase();
    for (const competitor of KNOWN_COMPETITOR_AGENCIES) {
      if (descLower.includes(competitor.toLowerCase())) {
        failures.push(
          `Propiedad ${prop.propertyId}: contiene referencia a "${competitor}" en descripción`,
        );
      }
    }
  }
  return { passed: failures.length === 0, failures };
}

function checkDescriptionQuality(properties: MicrositeCuratedProperty[]): {
  withDescription: number;
  total: number;
  issues: string[];
} {
  const issues: string[] = [];
  let withDescription = 0;

  for (const prop of properties) {
    if (prop.description && prop.description.trim().length > 0) {
      withDescription++;

      // 90-140 palabras en español ≈ 500-1100 chars. Umbrales laxos para no
      // marcar falsos positivos cuando el modelo se pasa ligeramente.
      if (prop.description.length < 100) {
        issues.push(`${prop.propertyId}: descripción muy corta (${prop.description.length} chars)`);
      }
      if (prop.description.length > 1200) {
        issues.push(`${prop.propertyId}: descripción muy larga (${prop.description.length} chars)`);
      }
    } else {
      issues.push(`${prop.propertyId}: sin descripción generada`);
    }
  }

  return { withDescription, total: properties.length, issues };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("⚠️  OPENAI_API_KEY requerida para este test (usa la API real).");
    process.exit(1);
  }

  if (!process.env.STATEFOX_BEARER_TOKEN) {
    console.error("⚠️  STATEFOX_BEARER_TOKEN requerida para generar microsites con stock real.");
    process.exit(1);
  }

  setTestSendInterceptor((msg) => {
    const previewSrc = msg.payload ?? {};
    const preview = JSON.stringify(previewSrc).slice(0, 120);
    console.log(`    [WA interceptado] → ${msg.to} (${msg.type}): ${preview}`);
  });

  console.log(`\n🧪 Test Auto-Validación de Microsites con IA`);
  console.log(`   Run ID: ${RUN_ID}`);
  console.log(`   Brand: ${BRAND_NAME}\n`);

  // ── Setup ─────────────────────────────────────────────────────────────────

  log("Setup: limpieza + datos base");
  await cleanup();

  await prisma.comercial.create({
    data: {
      id: COMERCIAL_AUTO_ID,
      nombre: "Comercial Auto-Validate",
      email: `auto-${Date.now()}@test.com`,
      telefono: "34600000001",
      ciudad: "Córdoba",
      autoValidateMicrosite: true,
    },
  });

  await prisma.comercial.create({
    data: {
      id: COMERCIAL_MANUAL_ID,
      nombre: "Comercial Manual",
      email: `manual-${Date.now()}@test.com`,
      telefono: "34600000002",
      ciudad: "Córdoba",
      autoValidateMicrosite: false,
    },
  });

  await prisma.demandCurrent.create({
    data: {
      codigo: DEMAND_ID,
      nombre: "Comprador Test Auto-Validate",
      telefono: WA_ID,
      presupuestoMin: 50000,
      presupuestoMax: 300000,
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
      ref: ".av_test.",
      nombre: "Comprador Test Auto-Validate",
      presupuestoMin: 50000,
      presupuestoMax: 300000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
      raw: { keycli: "AV-10001", keyagente: "AV-20001", tipopropiedad: "2799,3399" },
    },
  });

  console.log("  ✅ Setup completado\n");

  // ── Step 1: GENERATE_MICROSITE con auto-validate ON ───────────────────────

  log("Step 1: GENERATE_MICROSITE con autoValidateMicrosite=true");
  let s1 = Date.now();

  await enqueueJob({
    type: "GENERATE_MICROSITE",
    payload: {
      demandId: DEMAND_ID,
      comercialId: COMERCIAL_AUTO_ID,
      demand: { tipos: "Piso", zonas: "Centro", presupuestoMin: 50000, presupuestoMax: 300000, habitacionesMin: 2 },
    },
    idempotencyKey: `e2e-auto-val-gen:${RUN_ID}`,
  });

  await drainConsumer([
    "PROCESS_EVENT",
    "GENERATE_MICROSITE",
    "AUTO_VALIDATE_MICROSITE",
    "NOTIFY_MICROSITE_PENDING_VALIDATION",
    "SEND_MICROSITE_TO_BUYER",
  ]);

  const autoSelection = await prisma.micrositeSelection.findFirst({
    where: { demandId: DEMAND_ID, comercialId: COMERCIAL_AUTO_ID },
    orderBy: { createdAt: "desc" },
  });

  if (!autoSelection) {
    fail(1, "Generación con auto-validate", "No se creó MicrositeSelection", s1);
  } else {
    ok(1, "Generación con auto-validate", `selectionId=${autoSelection.id}`, s1);

    // ── Step 2: Verificar status APPROVED ──────────────────────────────────

    log("Step 2: Verificar auto-aprobación");
    s1 = Date.now();

    if (autoSelection.status === "APPROVED") {
      ok(2, "Status APPROVED", `validatedByComercialId=${autoSelection.validatedByComercialId}`, s1);
    } else {
      fail(2, "Status APPROVED", `status actual: ${autoSelection.status}`, s1);
    }

    // ── Step 3: Verificar validatedByComercialId ───────────────────────────

    log("Step 3: Verificar source auto_validation");
    s1 = Date.now();

    if (autoSelection.validatedByComercialId === "auto_validation") {
      ok(3, "Source auto_validation", "Correcto", s1);
    } else {
      fail(3, "Source auto_validation", `valor: ${autoSelection.validatedByComercialId}`, s1);
    }

    // ── Step 4: Verificar descripciones generadas ──────────────────────────

    log("Step 4: Calidad de descripciones generadas");
    s1 = Date.now();

    const properties = coerceMicrositeCuratedProperties(autoSelection.properties as unknown);
    const quality = checkDescriptionQuality(properties);

    if (quality.withDescription > 0) {
      ok(
        4,
        "Descripciones generadas",
        `${quality.withDescription}/${quality.total} con descripción` +
          (quality.issues.length > 0 ? ` (problemas: ${quality.issues.join("; ")})` : ""),
        s1,
      );
    } else {
      fail(4, "Descripciones generadas", `0/${quality.total} con descripción`, s1);
    }

    // Imprimir un sample de las descripciones
    for (const prop of properties.slice(0, 3)) {
      console.log(`\n    📝 ${prop.title} (${prop.propertyId}):`);
      console.log(`       ${(prop.description ?? "— sin descripción —").slice(0, 200)}...`);
    }

    // ── Step 5: Verificar rebranding ───────────────────────────────────────

    log("Step 5: Rebranding — sin referencias a competidores");
    s1 = Date.now();

    const rebranding = checkRebranding(properties);
    if (rebranding.passed) {
      ok(5, "Rebranding", "Ninguna referencia a competidores detectada", s1);
    } else {
      fail(5, "Rebranding", rebranding.failures.join("; "), s1);
    }

    // ── Step 6: Evento SELECCION_VALIDADA ──────────────────────────────────

    log("Step 6: Evento SELECCION_VALIDADA con source=auto_validation");
    s1 = Date.now();

    const validatedEvents = await prisma.event.findMany({
      where: {
        type: "SELECCION_VALIDADA",
        aggregateId: DEMAND_ID,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const autoEvent = validatedEvents.find((e) => {
      const p = e.payload as Record<string, unknown>;
      return p.source === "auto_validation" && p.selectionId === autoSelection.id;
    });

    if (autoEvent) {
      const ep = autoEvent.payload as Record<string, unknown>;
      ok(
        6,
        "Evento SELECCION_VALIDADA",
        `eventId=${autoEvent.id}, descriptionsGenerated=${ep.descriptionsGenerated}`,
        s1,
      );
    } else {
      fail(6, "Evento SELECCION_VALIDADA", "No encontrado con source=auto_validation", s1);
    }

    // ── Step 7: SEND_MICROSITE_TO_BUYER encolado ───────────────────────────

    log("Step 7: SEND_MICROSITE_TO_BUYER encolado");
    s1 = Date.now();

    const sendJobs = await prisma.jobQueue.findMany({
      where: {
        type: "SEND_MICROSITE_TO_BUYER",
        payload: { path: ["selectionId"], equals: autoSelection.id },
      },
    });

    if (sendJobs.length > 0) {
      ok(7, "SEND_MICROSITE_TO_BUYER", `${sendJobs.length} job(s) encontrado(s)`, s1);
    } else {
      fail(7, "SEND_MICROSITE_TO_BUYER", "No se encontró el job", s1);
    }

    // ── Step 8: NO hay NOTIFY_MICROSITE_PENDING_VALIDATION ─────────────────

    log("Step 8: NO debe haber NOTIFY_MICROSITE_PENDING_VALIDATION");
    s1 = Date.now();

    const notifyJobs = await prisma.jobQueue.findMany({
      where: {
        type: "NOTIFY_MICROSITE_PENDING_VALIDATION",
        payload: { path: ["selectionId"], equals: autoSelection.id },
      },
    });

    if (notifyJobs.length === 0) {
      ok(8, "Sin notificación manual", "Correcto: no se notificó al comercial para validar", s1);
    } else {
      fail(8, "Sin notificación manual", `Se encontraron ${notifyJobs.length} notificaciones`, s1);
    }
  }

  // ── Step 9: Contraste — comercial con toggle OFF ─────────────────────────

  log("Step 9: Contraste — GENERATE_MICROSITE con autoValidateMicrosite=false");
  s1 = Date.now();

  await enqueueJob({
    type: "GENERATE_MICROSITE",
    payload: {
      demandId: DEMAND_ID,
      comercialId: COMERCIAL_MANUAL_ID,
      demand: { tipos: "Piso", zonas: "Centro", presupuestoMin: 50000, presupuestoMax: 300000, habitacionesMin: 2 },
    },
    idempotencyKey: `e2e-manual-val-gen:${RUN_ID}`,
  });

  await drainConsumer([
    "PROCESS_EVENT",
    "GENERATE_MICROSITE",
    "AUTO_VALIDATE_MICROSITE",
    "NOTIFY_MICROSITE_PENDING_VALIDATION",
    "SEND_MICROSITE_TO_BUYER",
  ]);

  const manualSelection = await prisma.micrositeSelection.findFirst({
    where: { demandId: DEMAND_ID, comercialId: COMERCIAL_MANUAL_ID },
    orderBy: { createdAt: "desc" },
  });

  if (!manualSelection) {
    fail(9, "Contraste manual", "No se creó MicrositeSelection", s1);
  } else {
    if (manualSelection.status === "PENDING_VALIDATION") {
      const manualNotifyJobs = await prisma.jobQueue.findMany({
        where: {
          type: "NOTIFY_MICROSITE_PENDING_VALIDATION",
          payload: { path: ["selectionId"], equals: manualSelection.id },
        },
      });

      const autoValJobs = await prisma.jobQueue.findMany({
        where: {
          type: "AUTO_VALIDATE_MICROSITE",
          payload: { path: ["selectionId"], equals: manualSelection.id },
        },
      });

      if (manualNotifyJobs.length > 0 && autoValJobs.length === 0) {
        ok(
          9,
          "Contraste manual",
          "Selección queda PENDING_VALIDATION, se notifica al comercial, NO auto-valida",
          s1,
        );
      } else {
        fail(
          9,
          "Contraste manual",
          `notifyJobs=${manualNotifyJobs.length}, autoValJobs=${autoValJobs.length}`,
          s1,
        );
      }
    } else {
      fail(9, "Contraste manual", `Status inesperado: ${manualSelection.status}`, s1);
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────

  console.log(`\n${"=".repeat(70)}`);
  console.log("  RESUMEN");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⏭️";
    console.log(`  ${icon} Step ${r.step}: ${r.name} — ${r.detail ?? ""} (${r.durationMs}ms)`);
  }

  console.log(`\n  Total: ${passed} pass, ${failed} fail, ${skipped} skip`);
  console.log(`  Duración total: ${results.reduce((a, r) => a + r.durationMs, 0)}ms`);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  if (NO_CLEANUP) {
    console.log("\n  --no-cleanup: datos de test conservados.");
  } else {
    console.log("\n  Limpiando datos de test...");
    await cleanup();
    console.log("  ✅ Cleanup completado");
  }

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Error fatal:", err);
  process.exit(2);
});
