/**
 * Live E2E Parte de Visita (flujo nuevo):
 * - Formulario + link + OTP al COMERCIAL.
 * - PDF firmado final al COMPRADOR.
 *
 * Caso por defecto solicitado:
 * - Comercial: Miguel (se resuelve en DB).
 * - Comprador: Santiago Varón, 573113541077.
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { scheduleParteVisita } from "@/lib/parte-visita/schedule";
import { normalizeComercialWhatsappPhone } from "@/lib/routing/comercial-whatsapp";
import { normalizePhoneES } from "@/lib/whatsapp/phone";
import type { Event } from "@/types/domain";
import { handleFirmaEnviada } from "@/lib/workers/consumer/firma-enviada-handler";
import { handleFirmaCompletada } from "@/lib/workers/consumer/firma-completada-handler";

type StepStatus = "PASS" | "FAIL" | "WAIT" | "SKIP";

type CliOptions = {
  checkEnv: boolean;
  confirmLive: boolean;
  noWaitSignature: boolean;
  cleanup: boolean;
  comercialName: string;
  buyerName: string;
  buyerPhone: string;
  propertyCode: string | null;
  windowSeconds: number;
  timeoutMinutes: number;
};

const RUN_ID = `pv-commercial-e2e-${Date.now()}`;
const POLL_MS = 10_000;
const HARD_CODED_TUNNEL_URL = "https://a357-186-29-10-212.ngrok-free.app";

// Requisito de validación live: forzar túnel público para callbacks y links.
process.env.NEXT_PUBLIC_APP_URL = HARD_CODED_TUNNEL_URL;

const DEFAULTS = {
  comercialName: "Miguel",
  buyerName: "Santiago Varón",
  buyerPhone: "573113541077",
  windowSeconds: 90,
  timeoutMinutes: 20,
};

const created: { visitSessionId?: string; parteSessionId?: string } = {};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    checkEnv: argv.includes("--check-env"),
    confirmLive:
      argv.includes("--confirm-live") ||
      process.env.PV_LIVE_E2E_CONFIRM === "true",
    noWaitSignature: argv.includes("--no-wait-signature"),
    cleanup: argv.includes("--cleanup"),
    comercialName:
      process.env.PV_LIVE_COMERCIAL_NAME?.trim() || DEFAULTS.comercialName,
    buyerName: process.env.PV_LIVE_BUYER_NAME?.trim() || DEFAULTS.buyerName,
    buyerPhone:
      process.env.PV_LIVE_BUYER_PHONE?.trim() || DEFAULTS.buyerPhone,
    propertyCode: process.env.PV_LIVE_PROPERTY_CODE?.trim() || null,
    windowSeconds:
      Number(process.env.PV_LIVE_WINDOW_SECONDS) || DEFAULTS.windowSeconds,
    timeoutMinutes:
      Number(process.env.PV_LIVE_TIMEOUT_MINUTES) || DEFAULTS.timeoutMinutes,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--comercial-name" && next) options.comercialName = next;
    if (arg === "--buyer-name" && next) options.buyerName = next;
    if (arg === "--buyer-phone" && next) options.buyerPhone = next;
    if (arg === "--property-code" && next) options.propertyCode = next;
    if (arg === "--window-seconds" && next)
      options.windowSeconds = Number(next);
    if (arg === "--timeout-minutes" && next)
      options.timeoutMinutes = Number(next);
  }

  options.buyerPhone = normalizePhoneES(options.buyerPhone.replace(/\D/g, ""));
  return options;
}

function printUsage() {
  console.log(`
Uso:
  npx tsx scripts/test-parte-visita-live-e2e.ts --check-env
  npx tsx scripts/test-parte-visita-live-e2e.ts --confirm-live

Opciones:
  --comercial-name "Miguel"
  --buyer-name "Santiago Varón"
  --buyer-phone 573113541077
  --property-code <codigo>
  --window-seconds 90
  --timeout-minutes 20
  --no-wait-signature
  --cleanup
`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function report(
  step: number,
  name: string,
  status: StepStatus,
  ms: number,
  detail: string,
) {
  const icon =
    status === "PASS"
      ? "✓"
      : status === "FAIL"
        ? "✗"
        : status === "WAIT"
          ? "…"
          : "○";
  console.log(
    `[${icon}] Paso ${step}: ${name} — ${status} (${ms}ms)${detail ? ` — ${detail}` : ""}`,
  );
}

async function findComercialByName(name: string) {
  const records = await prisma.comercial.findMany({
    where: { nombre: { contains: name, mode: "insensitive" }, activo: true },
    select: { id: true, nombre: true, telefono: true, waId: true },
    orderBy: { nombre: "asc" },
  });
  if (records.length === 0) {
    throw new Error(`No se encontró comercial activo con nombre "${name}"`);
  }
  const exact =
    records.find((r) => r.nombre.toLowerCase() === name.toLowerCase()) ??
    records[0];
  const waPhone = normalizeComercialWhatsappPhone(exact);
  if (!waPhone) {
    throw new Error(
      `Comercial "${exact.nombre}" sin teléfono operativo (waId/telefono)`,
    );
  }
  return { ...exact, waPhone };
}

async function findPropertyForComercial(
  comercialId: string,
  propertyCode: string | null,
) {
  const property = propertyCode
    ? await prisma.propertyCurrent.findFirst({
        where: { codigo: propertyCode, comercialId },
      })
    : await prisma.propertyCurrent.findFirst({
        where: { comercialId, nodisponible: false },
        orderBy: { updatedAt: "desc" },
      });
  if (!property) {
    throw new Error(
      propertyCode
        ? `No hay PropertyCurrent ${propertyCode} asignada al comercial`
        : "No hay PropertyCurrent disponible asignada al comercial",
    );
  }
  return property;
}

async function waitForState(
  parteSessionId: string,
  expected: string[],
  timeoutMinutes: number,
) {
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const current = await prisma.parteVisitaSession.findUniqueOrThrow({
      where: { id: parteSessionId },
    });
    if (expected.includes(current.state)) return current;
    await sleep(POLL_MS);
  }
  throw new Error(
    `Timeout esperando estado ${expected.join(" | ")} en ParteVisitaSession ${parteSessionId}`,
  );
}

async function loadLatestEvent(params: {
  type: "FIRMA_ENVIADA" | "FIRMA_COMPLETADA";
  aggregateId: string;
  since: Date;
}): Promise<Event> {
  const rawEvent = await prisma.event.findFirst({
    where: {
      type: params.type,
      aggregateType: "PROPERTY",
      aggregateId: params.aggregateId,
      occurredAt: { gte: params.since },
    },
    orderBy: { occurredAt: "desc" },
  });
  if (!rawEvent) {
    throw new Error(
      `No se encontró evento ${params.type} para aggregateId=${params.aggregateId}`,
    );
  }
  return rawEvent as unknown as Event;
}

async function cleanupData() {
  if (!created.visitSessionId) return;
  const visitSessionId = created.visitSessionId;
  const parte = await prisma.parteVisitaSession.findUnique({
    where: { visitSessionId },
    select: { id: true, signatureRequestId: true },
  });

  if (parte?.signatureRequestId) {
    const legal = await prisma.legalDocument.findUnique({
      where: { signatureRequestId: parte.signatureRequestId },
      select: { id: true },
    });
    if (legal) {
      await prisma.legalDocumentParty.deleteMany({
        where: { legalDocumentId: legal.id },
      });
      await prisma.legalDocument.delete({ where: { id: legal.id } });
    }
    await prisma.signatureRequest.delete({
      where: { id: parte.signatureRequestId },
    });
  }

  if (parte) {
    await prisma.parteVisitaSession.delete({ where: { id: parte.id } });
  }
  await prisma.visitSchedulingSession.delete({ where: { id: visitSessionId } });
  console.log("[cleanup] Datos de prueba eliminados.");
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.confirmLive && !options.checkEnv) {
    printUsage();
    return;
  }

  console.log(`\nRun ID: ${RUN_ID}`);
  console.log(`Comercial: ${options.comercialName}`);
  console.log(`Comprador: ${options.buyerName} (${options.buyerPhone})`);
  console.log(`Window seconds: ${options.windowSeconds}`);

  let t = Date.now();
  try {
    requireEnv("DATABASE_URL");
    requireEnv("WHATSAPP_ACCESS_TOKEN");
    requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    requireEnv("QSTASH_TOKEN");
    requireEnv("FIRMA_TOKEN_SECRET");
    report(0, "Validar entorno", "PASS", Date.now() - t, "OK");
  } catch (error) {
    report(0, "Validar entorno", "FAIL", Date.now() - t, String(error));
    return;
  }

  if (options.checkEnv) return;

  // 1) Resolver comercial Miguel y propiedad
  t = Date.now();
  const comercial = await findComercialByName(options.comercialName);
  const property = await findPropertyForComercial(
    comercial.id,
    options.propertyCode,
  );
  report(
    1,
    "Resolver comercial + propiedad",
    "PASS",
    Date.now() - t,
    `${comercial.nombre} (${comercial.waPhone}) -> ${property.codigo}`,
  );

  // 2) Crear visita sintética en ventana corta
  t = Date.now();
  const visitDateTime = new Date(Date.now() + options.windowSeconds * 1000);
  const visit = await prisma.visitSchedulingSession.create({
    data: {
      demandId: `e2e-demand-${RUN_ID}`,
      propertyCode: property.codigo,
      comercialId: comercial.id,
      buyerWaId: options.buyerPhone,
      comercialWaId: comercial.waPhone,
      state: "VISIT_CONFIRMED",
      confirmedSlotStart: visitDateTime,
      confirmedSlotEnd: new Date(visitDateTime.getTime() + 60 * 60 * 1000),
      visitorName: options.buyerName,
      visitorPhone: options.buyerPhone,
      visitorCount: 1,
    },
  });
  created.visitSessionId = visit.id;
  report(
    2,
    "Crear VisitSchedulingSession",
    "PASS",
    Date.now() - t,
    `visitId=${visit.id}, slot=${visitDateTime.toISOString()}`,
  );

  // 3) Programar parte visita (QStash)
  t = Date.now();
  await scheduleParteVisita(visit);
  const parte = await prisma.parteVisitaSession.findUniqueOrThrow({
    where: { visitSessionId: visit.id },
  });
  created.parteSessionId = parte.id;
  report(
    3,
    "Programar ParteVisita (QStash)",
    "PASS",
    Date.now() - t,
    `parteSession=${parte.id}`,
  );

  const testStart = new Date(Date.now() - 60_000);

  // 4) Esperar envío de formulario al comercial y validar timing
  t = Date.now();
  const afterSend = await waitForState(
    parte.id,
    ["FORMULARIO_ENVIADO", "FIRMA_ENVIADA", "DOCUMENTO_ENVIADO"],
    options.timeoutMinutes,
  );

  const flowEvent = await prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: comercial.waPhone,
      OR: [
        { payload: { path: ["kind"], equals: "parte_visita_formulario_template" } },
        { payload: { path: ["kind"], equals: "parte_visita_formulario_flow" } },
      ],
      occurredAt: { gte: new Date(visitDateTime.getTime() - 5 * 60 * 1000) },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true, id: true },
  });
  if (!flowEvent) {
    throw new Error("No se encontró evento WHATSAPP_ENVIADO del formulario al comercial");
  }
  const driftSec = Math.abs(
    Math.round((flowEvent.occurredAt.getTime() - visitDateTime.getTime()) / 1000),
  );
  report(
    4,
    "Validar envío Flow al comercial",
    "PASS",
    Date.now() - t,
    `state=${afterSend.state}, drift=${driftSec}s`,
  );

  // 5) Esperar formulario completado -> FIRMA_ENVIADA
  t = Date.now();
  if (afterSend.state === "FORMULARIO_ENVIADO") {
    console.log(
      `\nCompleta el Flow en el WhatsApp del comercial (${comercial.nombre}).`,
    );
  }
  const afterForm = await waitForState(
    parte.id,
    ["FIRMA_ENVIADA", "DOCUMENTO_ENVIADO"],
    options.timeoutMinutes,
  );
  if (!afterForm.signatureRequestId) {
    throw new Error("ParteVisitaSession sin signatureRequestId tras formulario");
  }
  report(
    5,
    "Formulario completado y firma iniciada",
    "PASS",
    Date.now() - t,
    `signatureRequestId=${afterForm.signatureRequestId}`,
  );

  // 6) Validar + procesar FIRMA_ENVIADA de este test (sin barrer cola global)
  t = Date.now();
  const sigReq = await prisma.signatureRequest.findUniqueOrThrow({
    where: { id: afterForm.signatureRequestId },
  });
  if (sigReq.signerPhone !== comercial.waPhone) {
    throw new Error(
      `signerPhone esperado ${comercial.waPhone}, recibido ${sigReq.signerPhone}`,
    );
  }
  const firmaEnviadaEvent = await loadLatestEvent({
    type: "FIRMA_ENVIADA",
    aggregateId: property.codigo,
    since: testStart,
  });
  const firmaEnviadaResult = await handleFirmaEnviada(firmaEnviadaEvent);
  if (!firmaEnviadaResult.success) {
    throw new Error(
      `handleFirmaEnviada falló: ${firmaEnviadaResult.error ?? "error desconocido"}`,
    );
  }
  report(
    6,
    "Procesar FIRMA_ENVIADA (solo evento del test)",
    "PASS",
    Date.now() - t,
    `signingUrl=${sigReq.signingUrl}`,
  );

  // 7) Esperar firma humana (opcional)
  if (options.noWaitSignature) {
    report(7, "Esperar firma humana", "SKIP", 0, "--no-wait-signature");
    report(8, "Validar entrega PDF al comprador", "SKIP", 0, "Firma pendiente");
    return;
  }

  t = Date.now();
  console.log(
    `\nFirmar ahora desde el móvil del comercial:\n${sigReq.signingUrl}\n`,
  );
  const deadline = Date.now() + options.timeoutMinutes * 60 * 1000;
  let completed = false;
  while (Date.now() < deadline) {
    const current = await prisma.signatureRequest.findUnique({
      where: { id: sigReq.id },
      select: { status: true },
    });
    if (current?.status === "COMPLETED") {
      completed = true;
      break;
    }
    await sleep(POLL_MS);
  }
  if (!completed) {
    report(
      7,
      "Esperar firma humana",
      "WAIT",
      Date.now() - t,
      "Timeout, firma no completada",
    );
    report(8, "Validar entrega PDF al comprador", "SKIP", 0, "Firma pendiente");
    return;
  }
  report(7, "Esperar firma humana", "PASS", Date.now() - t, "COMPLETED");

  // 8) Procesar FIRMA_COMPLETADA de este test y validar entrega a comprador
  t = Date.now();
  const firmaCompletadaEvent = await loadLatestEvent({
    type: "FIRMA_COMPLETADA",
    aggregateId: property.codigo,
    since: testStart,
  });
  const firmaCompletadaResult = await handleFirmaCompletada(firmaCompletadaEvent);
  if (!firmaCompletadaResult.success) {
    throw new Error(
      `handleFirmaCompletada falló: ${firmaCompletadaResult.error ?? "error desconocido"}`,
    );
  }
  const done = await waitForState(
    parte.id,
    ["DOCUMENTO_ENVIADO"],
    options.timeoutMinutes,
  );
  if (!done.signedDocumentUrl) {
    throw new Error("ParteVisitaSession sin signedDocumentUrl");
  }
  const pdfEvent = await prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: options.buyerPhone,
      payload: { path: ["kind"], equals: "parte_visita_documento_firmado" },
      occurredAt: { gte: new Date(sigReq.sentAt.getTime() - 30 * 60 * 1000) },
    },
    orderBy: { occurredAt: "desc" },
    select: { id: true },
  });
  if (!pdfEvent) {
    throw new Error("No se encontró evento de envío de PDF firmado al comprador");
  }
  report(
    8,
    "Validar entrega PDF al comprador",
    "PASS",
    Date.now() - t,
    `signedDocumentUrl=${done.signedDocumentUrl}`,
  );
}

main()
  .catch((error) => {
    console.error(
      "\nFalló Parte de Visita live E2E:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    const opts = parseArgs(process.argv);
    if (opts.cleanup) {
      try {
        await cleanupData();
      } catch (error) {
        console.warn("[cleanup] Error:", error);
      }
    }
    await prisma.$disconnect();
  });
