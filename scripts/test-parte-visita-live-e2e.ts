/**
 * Flujo live E2E de Parte de Visita — desde una visita confirmada.
 *
 * Recorre:
 *  1. Valida prerequisitos de entorno.
 *  2. Busca una PropertyCurrent real en BD (o usa --property-code).
 *  3. Crea una VisitSchedulingSession sintética (estado VISIT_CONFIRMED).
 *  4. Llama a scheduleParteVisita → crea ParteVisitaSession + encola job.
 *  5. Fuerza availableAt = ahora y procesa PARTE_VISITA_ENVIAR_FORMULARIO.
 *  6. Verifica estado FORMULARIO_ENVIADO (WhatsApp Flow enviado al comprador).
 *  7. Simula respuesta del formulario (nfm_reply) o espera webhook real.
 *  8. Verifica: PDF generado, Cloudinary upload, SignatureRequest, LegalDocument.
 *  9. Procesa FIRMA_ENVIADA → link de firma enviado por WhatsApp al comprador.
 * 10. (Opcional) Espera firma humana en /firma/{token}.
 * 11. FIRMA_COMPLETADA → documento firmado enviado al comprador.
 *
 * Uso:
 *   npx tsx scripts/test-parte-visita-live-e2e.ts --check-env
 *   npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live
 *   npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --no-wait
 *   npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --simulate-form
 *   npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --phone 573113541077
 *   npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --property-code PROP123
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { runConsumerCycle } from "@/lib/workers/consumer";
import { scheduleParteVisita } from "@/lib/parte-visita/schedule";
import { handleParteVisitaNfmReply } from "@/lib/parte-visita/webhook-handler";
import {
  setTestSendInterceptor,
  type TestSendInterceptor,
} from "@/lib/whatsapp/send";

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
  propertyCode: string | null;
  timeoutMinutes: number;
}

const RUN_ID = `pv-live-${Date.now()}`;
const WORKER_ID = `pv-live-worker-${randomUUID().slice(0, 8)}`;
const DEFAULT_PHONE = "573113541077";
const DEFAULT_TIMEOUT_MINUTES = 15;
const POLL_MS = 10_000;
const PROCESS_EVENT_MAX_CYCLES = 20;
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

const results: StepResult[] = [];
const sentMessages: Array<{ to: string; type: string; payload: unknown }> = [];

// Track created resources for cleanup
let createdParteVisitaSessionId: string | null = null;
let createdVisitSessionId: string | null = null;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    confirmLive:
      argv.includes("--confirm-live") ||
      process.env.PV_LIVE_E2E_CONFIRM === "true",
    checkEnv: argv.includes("--check-env"),
    noWait: argv.includes("--no-wait"),
    liveForm:
      !argv.includes("--simulate-form") &&
      (argv.includes("--confirm-live") ||
        process.env.PV_LIVE_E2E_CONFIRM === "true"),
    phone: process.env.PV_LIVE_E2E_PHONE?.trim() || DEFAULT_PHONE,
    propertyCode: null,
    timeoutMinutes:
      Number(process.env.PV_LIVE_E2E_TIMEOUT_MINUTES) ||
      DEFAULT_TIMEOUT_MINUTES,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--phone" && next) options.phone = next.replace(/\D/g, "");
    if (arg === "--property-code" && next) options.propertyCode = next.trim();
    if (arg === "--timeout-minutes" && next)
      options.timeoutMinutes = Number(next);
  }

  return options;
}

function printUsage() {
  console.log(`
Uso:
  npx tsx scripts/test-parte-visita-live-e2e.ts --check-env
  npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live
  npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --no-wait
  npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --simulate-form
  npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --phone 573113541077
  npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live --property-code PROP123

Flags:
  --confirm-live         Ejecuta side effects reales (WhatsApp, Cloudinary, Neon)
  --check-env            Solo valida prerequisitos
  --no-wait              No espera firma humana; imprime signingUrl y termina
  --simulate-form        Simula el relleno del Flow con datos falsos (por defecto en modo live)
  --phone <number>       Teléfono del comprador para enviar mensajes WhatsApp (default: ${DEFAULT_PHONE})
  --property-code <code> Código de propiedad específica a usar (default: primera con comercialId)
  --timeout-minutes N    Tiempo máximo de espera para firma humana (default: ${DEFAULT_TIMEOUT_MINUTES})
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
  console.log("PARTE DE VISITA LIVE E2E — RESUMEN");
  console.log("=".repeat(90));
  for (const r of results) {
    console.log(
      `${String(r.step).padEnd(4)}${r.name.padEnd(46)}${r.status.padEnd(8)}${String(r.durationMs).padEnd(8)}${r.detail}`,
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
      type: { in: ["PARTE_VISITA_ENVIAR_FORMULARIO"] },
      createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: {
      status: "DEAD_LETTER",
      lastError: "Flushed by E2E test — orphaned job",
    },
  });
  if (result.count > 0) {
    console.log(
      `  [cleanup] Flushed ${result.count} orphaned parte-visita jobs`,
    );
  }
}

async function cleanupPreviousTestRun(
  visitSessionId: string,
  parteVisitaSessionId?: string,
) {
  let totalDeleted = 0;

  const pvSessions = parteVisitaSessionId
    ? [{ id: parteVisitaSessionId, signatureRequestId: null as string | null }]
    : await prisma.parteVisitaSession.findMany({
        where: { visitSessionId },
        select: { id: true, signatureRequestId: true },
      });

  const signatureRequestIds = pvSessions
    .map((s) => s.signatureRequestId)
    .filter((id): id is string => !!id);

  if (signatureRequestIds.length) {
    const docs = await prisma.legalDocument.findMany({
      where: { signatureRequestId: { in: signatureRequestIds } },
      select: { id: true },
    });
    if (docs.length) {
      const d1 = await prisma.legalDocumentParty.deleteMany({
        where: { legalDocumentId: { in: docs.map((d) => d.id) } },
      });
      totalDeleted += d1.count;
      const d2 = await prisma.legalDocument.deleteMany({
        where: { id: { in: docs.map((d) => d.id) } },
      });
      totalDeleted += d2.count;
    }
    const d3 = await prisma.signatureRequest.deleteMany({
      where: { id: { in: signatureRequestIds } },
    });
    totalDeleted += d3.count;
  }

  if (pvSessions.length) {
    const d4 = await prisma.parteVisitaSession.deleteMany({
      where: { id: { in: pvSessions.map((s) => s.id) } },
    });
    totalDeleted += d4.count;
  }

  // Delete the synthetic visit session
  const d5 = await prisma.visitSchedulingSession.deleteMany({
    where: { id: visitSessionId },
  });
  totalDeleted += d5.count;

  if (totalDeleted > 0) {
    console.log(
      `  [cleanup] Eliminados ${totalDeleted} registros de ejecuciones anteriores (visitSession=${visitSessionId})`,
    );
  }
}

async function processEvents(label: string, extraTypes: string[] = []) {
  const types = [
    "PROCESS_EVENT",
    "PARTE_VISITA_ENVIAR_FORMULARIO",
    "SEND_SIGNATURE_REQUEST",
    ...extraTypes,
  ] as import("@prisma/client").JobType[];

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
  console.log("PARTE DE VISITA LIVE E2E");
  console.log("=".repeat(90));
  console.log(`Run ID          : ${RUN_ID}`);
  console.log(`Phone comprador : ${options.phone}`);
  console.log(
    `Property code   : ${options.propertyCode ?? "(primera con comercialId)"}`,
  );
  console.log(`Live mode       : ${options.confirmLive}`);
  console.log(`Wait for firma  : ${!options.noWait}`);
  console.log(`Simulate form   : ${!options.liveForm}`);
  console.log("=".repeat(90) + "\n");

  // --- Step 0: Check environment ---
  let t = Date.now();
  try {
    requireEnv("DATABASE_URL");
    requireEnv("WHATSAPP_ACCESS_TOKEN");
    requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    requireEnv("CLOUDINARY_CLOUD_NAME");
    requireEnv("FIRMA_TOKEN_SECRET");
    reportStep(
      0,
      "Check environment",
      "PASS",
      Date.now() - t,
      "All required env vars present",
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

  await flushOrphanedJobs();

  // --- Step 1: Find a suitable PropertyCurrent ---
  t = Date.now();
  let propertyCode: string;
  let propertyRef: string;
  let comercialId: string;
  let comercialWaId: string;

  try {
    const property = options.propertyCode
      ? await prisma.propertyCurrent.findFirst({
          where: { codigo: options.propertyCode },
        })
      : await prisma.propertyCurrent.findFirst({
          where: {
            comercialId: { not: null },
          },
          orderBy: { updatedAt: "desc" },
        });

    if (!property) {
      throw new Error(
        options.propertyCode
          ? `PropertyCurrent no encontrada para código ${options.propertyCode}`
          : "No se encontró ninguna PropertyCurrent con comercialId asignado",
      );
    }

    propertyCode = property.codigo;
    propertyRef = property.ref;
    comercialId = property.comercialId!;

    // Find the comercial to get their WhatsApp ID
    const comercial = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { telefono: true, nombre: true },
    });

    comercialWaId = comercial?.telefono ?? options.phone;

    reportStep(
      1,
      "Find PropertyCurrent",
      "PASS",
      Date.now() - t,
      `code=${propertyCode}, ref=${propertyRef}, comercial=${comercialId}`,
    );

    console.log(`  [property] Dirección buscada en snapshot...`);
    const snapshot = await prisma.propertySnapshot.findFirst({
      where: { codigo: propertyCode },
      orderBy: { lastSeenAt: "desc" },
      select: { raw: true },
    });
    if (snapshot?.raw && typeof snapshot.raw === "object") {
      const raw = snapshot.raw as Record<string, unknown>;
      console.log(
        `  [property] calle="${raw["calle"] ?? ""}" ciudad="${raw["ciudad"] ?? property.ciudad}"`,
      );
    }
  } catch (err) {
    reportStep(1, "Find PropertyCurrent", "FAIL", Date.now() - t, String(err));
    printSummary();
    return;
  }

  // --- Step 2: Create synthetic VisitSchedulingSession ---
  t = Date.now();
  let visitSessionId: string;
  const visitDateTime = new Date(Date.now() + 30 * 1000); // 30s from now

  try {
    const visitSession = await prisma.visitSchedulingSession.create({
      data: {
        demandId: `e2e-demand-${RUN_ID}`,
        propertyCode,
        comercialId,
        buyerWaId: options.phone,
        comercialWaId,
        state: "VISIT_CONFIRMED",
        confirmedSlotStart: visitDateTime,
        confirmedSlotEnd: new Date(visitDateTime.getTime() + 60 * 60 * 1000),
        visitorName: "Comprador E2E Test",
        visitorPhone: options.phone,
        visitorCount: 1,
      },
    });

    visitSessionId = visitSession.id;
    createdVisitSessionId = visitSession.id;

    reportStep(
      2,
      "Create synthetic VisitSchedulingSession",
      "PASS",
      Date.now() - t,
      `id=${visitSession.id}, visitTime=${visitDateTime.toISOString()}`,
    );
  } catch (err) {
    reportStep(
      2,
      "Create synthetic VisitSchedulingSession",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 3: scheduleParteVisita → creates session + enqueues job ---
  t = Date.now();
  let parteVisitaSessionId: string;

  try {
    const visitSession = await prisma.visitSchedulingSession.findUniqueOrThrow({
      where: { id: visitSessionId },
    });

    await scheduleParteVisita(visitSession);

    const pvSession = await prisma.parteVisitaSession.findUniqueOrThrow({
      where: { visitSessionId },
    });

    parteVisitaSessionId = pvSession.id;
    createdParteVisitaSessionId = pvSession.id;

    console.log(`  [schedule] ParteVisitaSession creada: ${pvSession.id}`);
    console.log(`  [schedule] Dirección: ${pvSession.direccion || "(vacía)"}`);
    console.log(
      `  [schedule] Operación: ${pvSession.tipoOperacion} — Precio: ${pvSession.precio}`,
    );

    // Override the job's availableAt to now (job was scheduled at visitDateTime)
    const pendingJob = await prisma.jobQueue.findFirst({
      where: {
        type: "PARTE_VISITA_ENVIAR_FORMULARIO",
        payload: { path: ["sessionId"], equals: pvSession.id },
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    if (pendingJob) {
      await prisma.jobQueue.update({
        where: { id: pendingJob.id },
        data: { availableAt: new Date() },
      });
      console.log(
        `  [schedule] Job ${pendingJob.id} availableAt → now`,
      );
    } else {
      console.warn(
        "  [schedule] ADVERTENCIA: No se encontró job PARTE_VISITA_ENVIAR_FORMULARIO",
      );
    }

    reportStep(
      3,
      "Schedule ParteVisita",
      "PASS",
      Date.now() - t,
      `session=${pvSession.id}`,
    );
  } catch (err) {
    reportStep(3, "Schedule ParteVisita", "FAIL", Date.now() - t, String(err));
    printSummary();
    return;
  }

  // --- Step 4: Process PARTE_VISITA_ENVIAR_FORMULARIO → sends WhatsApp Flow ---
  t = Date.now();
  try {
    await processEvents("enviar-formulario");

    const sent = await prisma.parteVisitaSession.findUniqueOrThrow({
      where: { id: parteVisitaSessionId },
    });

    if (sent.state !== "FORMULARIO_ENVIADO") {
      throw new Error(`Expected FORMULARIO_ENVIADO, got ${sent.state}`);
    }

    reportStep(
      4,
      "WhatsApp Flow sent to buyer",
      "PASS",
      Date.now() - t,
      `state=${sent.state}`,
    );
  } catch (err) {
    reportStep(
      4,
      "WhatsApp Flow sent to buyer",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 5: Form completion — wait for real webhook OR simulate ---
  t = Date.now();
  try {
    if (options.liveForm) {
      console.log(
        `\n  [wait] Rellena el formulario en WhatsApp (${options.timeoutMinutes} min max)...\n`,
      );
      const deadline = Date.now() + options.timeoutMinutes * 60 * 1000;
      let pvSession = await prisma.parteVisitaSession.findUniqueOrThrow({
        where: { id: parteVisitaSessionId },
      });

      while (
        pvSession.state === "FORMULARIO_ENVIADO" &&
        Date.now() < deadline
      ) {
        await sleep(POLL_MS);
        process.stdout.write(
          `\r  [wait] Esperando respuesta del formulario... ${Math.ceil((deadline - Date.now()) / 60_000)} min restantes  `,
        );
        pvSession = await prisma.parteVisitaSession.findUniqueOrThrow({
          where: { id: parteVisitaSessionId },
        });
      }
      process.stdout.write("\n");

      if (pvSession.state !== "FIRMA_ENVIADA") {
        throw new Error(
          pvSession.state === "FORMULARIO_ENVIADO"
            ? `Timeout: formulario no completado en ${options.timeoutMinutes} min`
            : `Estado inesperado: ${pvSession.state}`,
        );
      }

      if (!pvSession.signatureRequestId)
        throw new Error("signatureRequestId is null");
      if (!pvSession.documentUrl) throw new Error("documentUrl is null");

      reportStep(
        5,
        "Form completed + PDF + Signature",
        "PASS",
        Date.now() - t,
        `sigReqId=${pvSession.signatureRequestId}`,
      );
    } else {
      // Simulate form submission directly
      const formData = {
        flow_token: parteVisitaSessionId,
        nombre_completo: "Ana Martínez García E2E",
        dni: "87654321B",
        telefono: options.phone,
        acepta_lopd: true,
      };

      console.log(
        `  [simulate] Enviando nfm_reply simulado con datos: ${JSON.stringify(formData)}`,
      );

      const handled = await handleParteVisitaNfmReply(
        options.phone,
        JSON.stringify(formData),
      );

      if (!handled) throw new Error("nfm_reply handler returned false");

      const pvSession = await prisma.parteVisitaSession.findUniqueOrThrow({
        where: { id: parteVisitaSessionId },
      });

      if (pvSession.state !== "FIRMA_ENVIADA") {
        throw new Error(`Expected FIRMA_ENVIADA, got ${pvSession.state}`);
      }
      if (!pvSession.signatureRequestId)
        throw new Error("signatureRequestId is null");
      if (!pvSession.documentUrl) throw new Error("documentUrl is null");

      reportStep(
        5,
        "Form completed + PDF + Signature",
        "PASS",
        Date.now() - t,
        `sigReqId=${pvSession.signatureRequestId}`,
      );
    }
  } catch (err) {
    reportStep(
      5,
      "Form completed + PDF + Signature",
      "FAIL",
      Date.now() - t,
      String(err),
    );
    printSummary();
    return;
  }

  // --- Step 6: Process FIRMA_ENVIADA event → signing link to buyer ---
  t = Date.now();
  try {
    await processEvents("firma-enviada");
    reportStep(
      6,
      "FIRMA_ENVIADA processed",
      "PASS",
      Date.now() - t,
      "Link de firma enviado por WhatsApp al comprador",
    );
  } catch (err) {
    reportStep(
      6,
      "FIRMA_ENVIADA processed",
      "FAIL",
      Date.now() - t,
      String(err),
    );
  }

  // --- Step 7: Verify all created artifacts ---
  t = Date.now();
  let signingToken: string | null = null;
  try {
    const finalSession = await prisma.parteVisitaSession.findUniqueOrThrow({
      where: { id: parteVisitaSessionId },
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
      ["Session state FIRMA_ENVIADA", finalSession.state === "FIRMA_ENVIADA"],
      ["Session has buyerNombre", !!finalSession.buyerNombre],
      ["Session has buyerDni", !!finalSession.buyerDni],
      ["Session has documentUrl", !!finalSession.documentUrl],
      ["Session has direccion", !!finalSession.direccion],
      ["Session has signatureRequestId", !!finalSession.signatureRequestId],
      ["SignatureRequest exists", !!sigReq],
      ["SignatureRequest status SENT", sigReq?.status === "SENT"],
      [
        "SignatureRequest documentKind PARTE_VISITA",
        sigReq?.documentKind === "PARTE_VISITA",
      ],
      ["SignatureRequest has signingToken", !!sigReq?.signingToken],
      ["LegalDocument exists", !!legalDoc],
      [
        "LegalDocument status SENT_TO_SIGNATURE",
        legalDoc?.status === "SENT_TO_SIGNATURE",
      ],
      [
        "LegalDocument documentKind PARTE_VISITA",
        legalDoc?.documentKind === "PARTE_VISITA",
      ],
      ["LegalDocumentParty exists", !!party],
      ["Party role COMPRADOR", party?.role === "COMPRADOR"],
      ...(options.liveForm
        ? []
        : ([
            [
              "Party fullName matches",
              party?.fullName === "Ana Martínez García E2E",
            ],
          ] as const)),
    ] as const;

    const failed = checks.filter(([, ok]) => !ok);

    if (failed.length > 0) {
      const failedNames = failed.map(([name]) => name).join(", ");
      reportStep(
        7,
        "Verify artifacts",
        "FAIL",
        Date.now() - t,
        `Failed: ${failedNames}`,
      );
    } else {
      signingToken = sigReq?.signingToken ?? null;
      const signingUrl = sigReq?.signingUrl ?? "N/A";
      reportStep(
        7,
        "Verify artifacts",
        "PASS",
        Date.now() - t,
        `All ${checks.length} checks passed`,
      );
      console.log(`\n  Signing URL: ${signingUrl}\n`);
    }

    // --- Step 8: Wait for human signature ---
    if (!options.noWait && signingToken) {
      const signingUrl = `${APP_URL}/firma/${signingToken}`;
      console.log(
        `\n  Abrir en navegador para firmar:\n  ${signingUrl}\n`,
      );

      const deadline = Date.now() + options.timeoutMinutes * 60 * 1000;
      let signed = false;
      const tFirma = Date.now();

      while (Date.now() < deadline) {
        const current = await prisma.signatureRequest.findUnique({
          where: { id: sigReq!.id },
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
          8,
          "Human signature",
          "PASS",
          Date.now() - tFirma,
          "Firma completada",
        );

        // --- Step 9: FIRMA_COMPLETADA → documento firmado enviado al comprador ---
        const tDoc = Date.now();
        try {
          await processEvents("firma-completada");

          const afterFirma =
            await prisma.parteVisitaSession.findUniqueOrThrow({
              where: { id: parteVisitaSessionId },
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
              9,
              "Signed doc sent to buyer",
              "FAIL",
              Date.now() - tDoc,
              `Failed: ${docFailed.map(([n]) => n).join(", ")}`,
            );
          } else {
            reportStep(
              9,
              "Signed doc sent to buyer",
              "PASS",
              Date.now() - tDoc,
              "PDF firmado enviado por WhatsApp al comprador",
            );
          }
        } catch (err) {
          reportStep(
            9,
            "Signed doc sent to buyer",
            "FAIL",
            Date.now() - tDoc,
            String(err),
          );
        }
      } else {
        reportStep(
          8,
          "Human signature",
          "WAIT",
          Date.now() - tFirma,
          "Timeout — firma pendiente",
        );
        reportStep(
          9,
          "Signed doc sent to buyer",
          "SKIP",
          0,
          "Firma no completada",
        );
      }
    } else {
      reportStep(
        8,
        "Human signature",
        "SKIP",
        0,
        options.noWait ? "--no-wait" : "No signingToken",
      );
      reportStep(
        9,
        "Signed doc sent to buyer",
        "SKIP",
        0,
        "Firma no completada",
      );
    }
  } catch (err) {
    reportStep(7, "Verify artifacts", "FAIL", Date.now() - t, String(err));
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
      "\nFalló Parte de Visita live E2E:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    try {
      if (createdVisitSessionId) {
        await cleanupPreviousTestRun(
          createdVisitSessionId,
          createdParteVisitaSessionId ?? undefined,
        );
        console.log("[cleanup] Datos de test eliminados (propiedad real intacta)");
      }
    } catch (err) {
      console.warn("[cleanup] Error limpiando:", err);
    }

    await prisma.$disconnect();
  });
