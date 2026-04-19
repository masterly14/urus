/**
 * Flujo live E2E de firma in-house, lo mas cercano posible a produccion.
 *
 * Recorre:
 *  1. Render del contrato desde la misma API usada por la UI.
 *  2. Persistencia real en Neon + Cloudinary como borrador.
 *  3. Aprobacion real via POST /api/contracts/approve.
 *  4. Envio real a firma via POST /api/contracts/sign.
 *  5. Procesado real de FIRMA_ENVIADA para disparar WhatsApp al 573113541077.
 *  6. Fase human-in-the-loop: abrir signingUrl, pedir OTP y firmar en navegador.
 *  7. Verificacion de FIRMA_COMPLETADA, LegalDocument SIGNED y artefactos finales.
 *
 * Uso:
 *   npm run firma:live-e2e -- --check-env
 *   npm run firma:live-e2e -- --confirm-live
 *   npm run firma:live-e2e -- --confirm-live --no-wait
 *   npm run firma:live-e2e -- --confirm-live --fixture ctr-1 --timeout-minutes 30
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import { Prisma } from "@/app/generated/prisma/client";
import { POST as approveContract } from "@/app/api/contracts/approve/route";
import { POST as renderContract } from "@/app/api/contracts/render/route";
import { POST as sendToSignature } from "@/app/api/contracts/sign/route";
import { GET as getSignatureMetadata } from "@/app/api/firma/[token]/route";
import { uploadContractDocument, resolveCloudinaryCredentialsFromEnv } from "@/lib/cloudinary";
import { getEventsByAggregate } from "@/lib/event-store";
import type { EventRecord } from "@/lib/event-store/types";
import { enqueueJob } from "@/lib/job-queue";
import { getContractTemplateFixtureByListId } from "@/lib/mock-data/contract-template-fixtures";
import { prisma } from "@/lib/prisma";
import type { ContractTemplateInput } from "@/types/contracts";
import { runConsumerCycle } from "@/lib/workers/consumer";

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
  fixtureId: string;
  timeoutMinutes: number;
  operationId: string;
  propertyCode: string;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  sellerEmail: string;
}

interface RouteJsonResponse {
  error?: string;
  [key: string]: unknown;
}

interface RenderResponse extends RouteJsonResponse {
  ok?: boolean;
  docxBase64?: string;
  docxFileName?: string;
  validationIssues?: unknown[];
}

interface ApproveResponse extends RouteJsonResponse {
  legalDocumentId?: string;
  status?: string;
  approvedAt?: string;
}

interface SignResponse extends RouteJsonResponse {
  signatureRequestId?: string;
  signingUrl?: string;
  status?: string;
  normalizedToPdf?: boolean;
  documentHash?: string;
}

interface SignatureMetadataResponse extends RouteJsonResponse {
  operationId?: string;
  documentKind?: string;
  signerName?: string;
  signerEmail?: string;
  status?: string;
  hasPhone?: boolean;
  phoneMasked?: string | null;
  pdfUrl?: string;
}

const RUN_ID = `firma-live-${Date.now()}`;
const WORKER_ID = `firma-live-worker-${randomUUID().slice(0, 8)}`;
const DEFAULT_SIGNER_PHONE = "573113541077";
const DEFAULT_FIXTURE_ID = "ctr-1";
const DEFAULT_TIMEOUT_MINUTES = 20;
const DEFAULT_WAIT_POLL_MS = 15_000;
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.test";
const PROCESS_EVENT_MAX_CYCLES = 20;

const results: StepResult[] = [];

function reportStep(
  step: number,
  name: string,
  status: StepStatus,
  durationMs: number,
  detail: string,
) {
  results.push({ step, name, status, durationMs, detail });
  const icon =
    status === "PASS" ? "✓" : status === "FAIL" ? "✗" : status === "WAIT" ? "…" : "○";
  console.log(
    `[${icon}] Paso ${step}: ${name} — ${status} (${durationMs}ms)${detail ? ` — ${detail}` : ""}`,
  );
}

function printSummary() {
  console.log("\n" + "=".repeat(90));
  console.log("FIRMA LIVE E2E — RESUMEN");
  console.log("=".repeat(90));
  for (const result of results) {
    console.log(
      `${String(result.step).padEnd(4)}${result.name.padEnd(42)}${result.status.padEnd(8)}${String(
        result.durationMs,
      ).padEnd(8)}${result.detail}`,
    );
  }
  console.log("=".repeat(90) + "\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    confirmLive:
      argv.includes("--confirm-live") || process.env.FIRMA_LIVE_E2E_CONFIRM === "true",
    checkEnv: argv.includes("--check-env"),
    noWait: argv.includes("--no-wait"),
    fixtureId: DEFAULT_FIXTURE_ID,
    timeoutMinutes: Number(process.env.FIRMA_LIVE_E2E_TIMEOUT_MINUTES) || DEFAULT_TIMEOUT_MINUTES,
    operationId: process.env.FIRMA_LIVE_E2E_OPERATION_ID?.trim() || `OP-LIVE-${Date.now()}`,
    propertyCode: process.env.FIRMA_LIVE_E2E_PROPERTY_CODE?.trim() || `PROP-LIVE-${Date.now()}`,
    signerName: process.env.FIRMA_LIVE_E2E_SIGNER_NAME?.trim() || "Firmante Live E2E",
    signerEmail:
      process.env.FIRMA_LIVE_E2E_SIGNER_EMAIL?.trim() || `firma-live-${Date.now()}@urus.local`,
    signerPhone: sanitizePhone(
      process.env.FIRMA_LIVE_E2E_SIGNER_PHONE?.trim() || DEFAULT_SIGNER_PHONE,
    ),
    sellerEmail:
      process.env.FIRMA_LIVE_E2E_SELLER_EMAIL?.trim() || `seller-live-${Date.now()}@urus.local`,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--fixture" && next) options.fixtureId = next;
    if (arg === "--timeout-minutes" && next) options.timeoutMinutes = Number(next);
    if (arg === "--operation-id" && next) options.operationId = next;
    if (arg === "--property-code" && next) options.propertyCode = next;
    if (arg === "--signer-name" && next) options.signerName = next;
    if (arg === "--signer-email" && next) options.signerEmail = next;
    if (arg === "--signer-phone" && next) options.signerPhone = sanitizePhone(next);
    if (arg === "--seller-email" && next) options.sellerEmail = next;
  }

  if (!Number.isFinite(options.timeoutMinutes) || options.timeoutMinutes <= 0) {
    throw new Error("--timeout-minutes debe ser un numero positivo");
  }

  if (!options.signerPhone) {
    throw new Error("signerPhone no puede quedar vacio");
  }

  return options;
}

function printUsage() {
  console.log(`
Uso:
  npm run firma:live-e2e -- --check-env
  npm run firma:live-e2e -- --confirm-live
  npm run firma:live-e2e -- --confirm-live --no-wait

Flags:
  --confirm-live      Ejecuta side effects reales (WhatsApp, SMS OTP, Cloudinary, Neon)
  --check-env         Solo valida prerequisitos
  --no-wait           No espera la firma humana; imprime el signingUrl y termina
  --fixture <id>      Fixture de contrato base (default: ${DEFAULT_FIXTURE_ID})
  --timeout-minutes N Tiempo maximo de espera para la firma humana (default: ${DEFAULT_TIMEOUT_MINUTES})
  --operation-id ID   Fuerza operationId
  --property-code ID  Fuerza propertyCode
  --signer-name TXT   Nombre del firmante
  --signer-email TXT  Email del firmante
  --signer-phone TXT  Telefono del firmante/WhatsApp/OTP
  --seller-email TXT  Email sintetico para la contraparte en LegalDocumentParty
`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

function buildApproveHeaders(): HeadersInit {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};
}

function buildSignHeaders(): HeadersInit {
  const signToken = process.env.SIGNATURIT_SIGN_API_TOKEN?.trim();
  if (signToken) return { authorization: `Bearer ${signToken}` };

  const cronSecret = process.env.CRON_SECRET?.trim();
  return cronSecret ? { authorization: `Bearer ${cronSecret}` } : {};
}

function buildJsonRequest(
  path: string,
  body: unknown,
  headers?: HeadersInit,
): Request {
  return new Request(`${APP_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

async function parseJsonResponse<T extends RouteJsonResponse>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function buildTemplateInput(options: CliOptions): ContractTemplateInput {
  const fixture = getContractTemplateFixtureByListId(options.fixtureId);
  if (!fixture) {
    throw new Error(`No existe fixture Smart Closing para id=${options.fixtureId}`);
  }

  const next = structuredClone(fixture);
  next.templateVersion = `firma-live-${RUN_ID}`;
  return next;
}

function extractDocumentKind(input: ContractTemplateInput): string {
  return input.kind;
}

function extractPrimaryBuyerName(input: ContractTemplateInput, fallback: string): string {
  switch (input.kind) {
    case "arras":
      return input.payload.buyers[0]?.fullName ?? fallback;
    case "senal_compra":
      return input.payload.purchaser.fullName || fallback;
    case "oferta_firme":
      return input.payload.offerers[0]?.fullName ?? fallback;
    default:
      return fallback;
  }
}

function extractCounterpartyName(input: ContractTemplateInput): string {
  switch (input.kind) {
    case "arras":
      return input.payload.sellers[0]?.fullName ?? "Contraparte Live E2E";
    case "senal_compra":
      return input.payload.agency.representative.fullName ?? "Agencia Live E2E";
    case "oferta_firme":
      return input.payload.agency.representative.fullName ?? "Agencia Live E2E";
    default:
      return "Contraparte Live E2E";
  }
}

async function ensureOperacionExists(input: ContractTemplateInput, options: CliOptions) {
  const ciudad =
    input.kind === "anexo_mobiliario"
      ? ""
      : input.payload.property.municipality;

  await prisma.operacion.upsert({
    where: { codigo: options.operationId },
    create: {
      codigo: options.operationId,
      propertyCode: options.propertyCode,
      ciudad,
      estado: "EN_CURSO",
    },
    update: {
      propertyCode: options.propertyCode,
      ciudad,
    },
  });
}

async function createDraftArtifacts(input: ContractTemplateInput, options: CliOptions) {
  const renderStartedAt = Date.now();
  const renderResponse = await renderContract(
    buildJsonRequest("/api/contracts/render", { contractTemplateInput: input }),
  );
  const renderBody = await parseJsonResponse<RenderResponse>(renderResponse);

  if (!renderResponse.ok) {
    throw new Error(renderBody.error ?? `Error render HTTP ${renderResponse.status}`);
  }
  if (renderBody.ok === false) {
    throw new Error(
      `La plantilla no supera la validacion inicial: ${JSON.stringify(
        renderBody.validationIssues ?? [],
      )}`,
    );
  }
  if (!renderBody.docxBase64 || !renderBody.docxFileName) {
    throw new Error("Respuesta de render invalida: falta docxBase64/docxFileName");
  }

  const uploadStartedAt = Date.now();
  const docxBuffer = Buffer.from(renderBody.docxBase64, "base64");
  const upload = await uploadContractDocument({
    buffer: docxBuffer,
    fileName: renderBody.docxFileName,
    folder: `contracts/${options.operationId}`,
    tags: ["draft", "firma-live-e2e", input.kind],
    context: {
      source: "scripts/test-signature-live-e2e",
      operationId: options.operationId,
      propertyCode: options.propertyCode,
      templateVersion: input.templateVersion ?? "",
    },
  });

  const legalDoc = await prisma.legalDocument.upsert({
    where: {
      operationId_documentKind: {
        operationId: options.operationId,
        documentKind: extractDocumentKind(input),
      },
    },
    create: {
      operationId: options.operationId,
      propertyCode: options.propertyCode,
      documentKind: extractDocumentKind(input),
      templateVersion: input.templateVersion ?? null,
      status: "DRAFT",
      contractInput: input as unknown as Prisma.JsonObject,
      cloudinaryUrl: upload.secureUrl,
    },
    update: {
      templateVersion: input.templateVersion ?? null,
      status: "DRAFT",
      contractInput: input as unknown as Prisma.JsonObject,
      cloudinaryUrl: upload.secureUrl,
      signatureRequestId: null,
      approvedAt: null,
      completedAt: null,
      signedDocumentUrl: null,
      auditTrailUrl: null,
    },
  });

  await prisma.legalDocumentParty.deleteMany({
    where: { legalDocumentId: legalDoc.id },
  });

  await prisma.legalDocumentParty.createMany({
    data: [
      {
        legalDocumentId: legalDoc.id,
        role: "BUYER",
        fullName: options.signerName || extractPrimaryBuyerName(input, "Firmante Live E2E"),
        email: options.signerEmail,
        phone: options.signerPhone,
      },
      {
        legalDocumentId: legalDoc.id,
        role: "SELLER",
        fullName: extractCounterpartyName(input),
        email: options.sellerEmail,
        phone: null,
      },
    ],
  });

  return {
    docxBase64: renderBody.docxBase64,
    docxFileName: renderBody.docxFileName,
    docxBytes: docxBuffer.length,
    draftUploadUrl: upload.secureUrl,
    legalDocumentId: legalDoc.id,
    renderMs: Date.now() - renderStartedAt,
    uploadMs: Date.now() - uploadStartedAt,
  };
}

async function approveDraft(input: ContractTemplateInput, options: CliOptions) {
  const response = await approveContract(
    buildJsonRequest(
      "/api/contracts/approve",
      {
        operationId: options.operationId,
        propertyCode: options.propertyCode,
        documentKind: input.kind,
        templateVersion: input.templateVersion,
      },
      buildApproveHeaders(),
    ),
  );
  const body = await parseJsonResponse<ApproveResponse>(response);
  if (!response.ok) {
    throw new Error(body.error ?? `Error approve HTTP ${response.status}`);
  }

  const approvalEvent = await findLatestEvent(options.propertyCode, "CONTRATO_APROBADO");
  return {
    legalDocumentId: body.legalDocumentId ?? null,
    approvedAt: body.approvedAt ?? null,
    approvalEventId: approvalEvent?.id ?? null,
  };
}

async function sendDraftToSignature(
  input: ContractTemplateInput,
  draft: Awaited<ReturnType<typeof createDraftArtifacts>>,
  options: CliOptions,
) {
  const response = await sendToSignature(
    buildJsonRequest(
      "/api/contracts/sign",
      {
        operationId: options.operationId,
        propertyCode: options.propertyCode,
        documentKind: input.kind,
        templateVersion: input.templateVersion,
        docxBase64: draft.docxBase64,
        signers: [
          {
            name: options.signerName,
            email: options.signerEmail,
            phone: options.signerPhone,
            role: "BUYER",
          },
        ],
        signingMode: "sequential",
      },
      buildSignHeaders(),
    ),
  );
  const body = await parseJsonResponse<SignResponse>(response);
  if (!response.ok) {
    throw new Error(body.error ?? `Error sign HTTP ${response.status}`);
  }
  if (!body.signatureRequestId || !body.signingUrl) {
    throw new Error("Respuesta de sign invalida: falta signatureRequestId/signingUrl");
  }

  return {
    signatureRequestId: body.signatureRequestId,
    signingUrl: body.signingUrl,
    normalizedToPdf: Boolean(body.normalizedToPdf),
    documentHash: body.documentHash ?? null,
  };
}

async function findLatestEvent(
  propertyCode: string,
  type: EventRecord["type"],
): Promise<EventRecord | null> {
  const events = await getEventsByAggregate("PROPERTY", propertyCode, { limit: 100 });
  const filtered = events.filter((event) => event.type === type);
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

function hasSignatureRequestId(
  event: EventRecord,
  signatureRequestId: string,
): boolean {
  const payload = event.payload as Record<string, unknown>;
  return payload.signatureRequestId === signatureRequestId;
}

async function findSignatureEvent(
  propertyCode: string,
  type: EventRecord["type"],
  signatureRequestId: string,
): Promise<EventRecord | null> {
  const events = await getEventsByAggregate("PROPERTY", propertyCode, { limit: 100 });
  const filtered = events.filter(
    (event) => event.type === type && hasSignatureRequestId(event, signatureRequestId),
  );
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

async function ensureProcessEventHandled(event: EventRecord) {
  const existing = await prisma.jobQueue.findFirst({
    where: {
      type: "PROCESS_EVENT",
      sourceEventId: event.id,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) {
    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id, eventType: event.type },
      sourceEventId: event.id,
      idempotencyKey: `process-event:${event.id}`,
    });
  }

  let processed = 0;
  for (let i = 0; i < PROCESS_EVENT_MAX_CYCLES; i++) {
    const cycle = await runConsumerCycle({
      workerId: WORKER_ID,
      types: ["PROCESS_EVENT"],
    });
    processed += cycle.processed;
    if (cycle.noWork) break;
  }

  const refreshed = await prisma.jobQueue.findFirst({
    where: {
      type: "PROCESS_EVENT",
      sourceEventId: event.id,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    processed,
    status: refreshed?.status ?? "NOT_FOUND",
    jobId: refreshed?.id ?? null,
  };
}

function extractTokenFromSigningUrl(signingUrl: string): string {
  const url = new URL(signingUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const token = segments[segments.length - 1];
  if (!token) throw new Error(`No se pudo extraer token de signingUrl=${signingUrl}`);
  return token;
}

async function fetchSignatureMetadata(token: string) {
  const response = await getSignatureMetadata(new Request(`${APP_BASE_URL}/api/firma/${token}`), {
    params: Promise.resolve({ token }),
  });
  const body = await parseJsonResponse<SignatureMetadataResponse>(response);
  if (!response.ok) {
    throw new Error(body.error ?? `Error firma metadata HTTP ${response.status}`);
  }
  return body;
}

function printHumanInstructions(
  signingUrl: string,
  token: string,
  signerPhone: string,
  metadata: SignatureMetadataResponse,
) {
  console.log("\n" + "=".repeat(90));
  console.log("FIRMA HUMANA REQUERIDA");
  console.log("=".repeat(90));
  console.log(`1. Abre el enlace real de firma en un navegador:`);
  console.log(`   ${signingUrl}`);
  console.log("");
  console.log(`2. El firmante debe usar el mismo numero ${signerPhone} para recibir el OTP SMS.`);
  console.log("3. En la pantalla publica:");
  console.log("   - revisa el PDF");
  console.log("   - pulsa para enviar OTP");
  console.log("   - introduce el codigo SMS");
  console.log("   - dibuja la firma y confirma");
  console.log("");
  console.log(`Token de firma: ${token}`);
  console.log(`Estado actual: ${metadata.status ?? "?"}`);
  console.log(`Telefono detectado por la API: ${metadata.phoneMasked ?? "sin telefono"}`);
  console.log("El script va a quedarse esperando hasta detectar FIRMA_COMPLETADA.");
  console.log("=".repeat(90) + "\n");
}

async function waitForHumanSignature(
  signatureRequestId: string,
  timeoutMinutes: number,
): Promise<{
  status: string;
  signedDocumentUrl: string | null;
  auditTrailUrl: string | null;
}> {
  const timeoutAt = Date.now() + timeoutMinutes * 60_000;
  let lastStatus = "";

  while (Date.now() < timeoutAt) {
    const sigReq = await prisma.signatureRequest.findUnique({
      where: { id: signatureRequestId },
      select: {
        status: true,
        signedDocumentUrl: true,
        auditTrailUrl: true,
        updatedAt: true,
      },
    });

    if (!sigReq) {
      throw new Error(`SignatureRequest ${signatureRequestId} no encontrada durante la espera`);
    }

    if (sigReq.status !== lastStatus) {
      console.log(
        `[wait] SignatureRequest=${signatureRequestId} status=${sigReq.status} updatedAt=${sigReq.updatedAt.toISOString()}`,
      );
      lastStatus = sigReq.status;
    }

    if (sigReq.status === "COMPLETED") {
      return {
        status: sigReq.status,
        signedDocumentUrl: sigReq.signedDocumentUrl ?? null,
        auditTrailUrl: sigReq.auditTrailUrl ?? null,
      };
    }

    if (["DECLINED", "EXPIRED", "CANCELED", "ERROR"].includes(sigReq.status)) {
      return {
        status: sigReq.status,
        signedDocumentUrl: sigReq.signedDocumentUrl ?? null,
        auditTrailUrl: sigReq.auditTrailUrl ?? null,
      };
    }

    await sleep(DEFAULT_WAIT_POLL_MS);
  }

  return {
    status: "TIMEOUT",
    signedDocumentUrl: null,
    auditTrailUrl: null,
  };
}

function assertProductionLikeEnv() {
  requireEnv("DATABASE_URL");
  requireEnv("NEXT_PUBLIC_APP_URL");
  requireEnv("FIRMA_TOKEN_SECRET");
  requireEnv("WHATSAPP_ACCESS_TOKEN");
  requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  requireEnv("VONAGE_API_KEY");
  requireEnv("VONAGE_API_SECRET");
  requireEnv("SIGNATURIT_PDF_CONVERTER_URL");
  resolveCloudinaryCredentialsFromEnv();
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const options = parseArgs(process.argv);

  const startAt = Date.now();
  console.log(`[firma-live] Run ID: ${RUN_ID}`);
  console.log(`[firma-live] workerId=${WORKER_ID}`);
  console.log(`[firma-live] operationId=${options.operationId} propertyCode=${options.propertyCode}`);
  console.log(`[firma-live] signerPhone=${options.signerPhone}`);
  console.log("");

  const envStartedAt = Date.now();
  assertProductionLikeEnv();
  reportStep(
    1,
    "Prechecks de entorno y credenciales",
    "PASS",
    Date.now() - envStartedAt,
    "Neon, Cloudinary, WhatsApp, Vonage, FIRMA_TOKEN_SECRET y converter presentes",
  );

  if (options.checkEnv) {
    printSummary();
    return;
  }

  if (!options.confirmLive) {
    throw new Error(
      "Este script hace side effects reales. Vuelve a ejecutarlo con --confirm-live o FIRMA_LIVE_E2E_CONFIRM=true",
    );
  }

  const input = buildTemplateInput(options);
  const signerNameFromInput = extractPrimaryBuyerName(input, options.signerName);
  options.signerName = signerNameFromInput || options.signerName;

  const seedStartedAt = Date.now();
  await ensureOperacionExists(input, options);
  const draft = await createDraftArtifacts(input, options);
  reportStep(
    2,
    "Render y persistencia del borrador DRAFT",
    "PASS",
    Date.now() - seedStartedAt,
    `legalDocumentId=${draft.legalDocumentId}, docxBytes=${draft.docxBytes}, draftUrl=${draft.draftUploadUrl}`,
  );

  const approveStartedAt = Date.now();
  const approval = await approveDraft(input, options);
  reportStep(
    3,
    "Aprobacion real del contrato",
    "PASS",
    Date.now() - approveStartedAt,
    `legalDocumentId=${approval.legalDocumentId ?? "?"}, approvalEvent=${approval.approvalEventId ?? "not-found"}`,
  );

  const signStartedAt = Date.now();
  const sign = await sendDraftToSignature(input, draft, options);
  const sentEvent = await findSignatureEvent(
    options.propertyCode,
    "FIRMA_ENVIADA",
    sign.signatureRequestId,
  );
  if (!sentEvent) {
    throw new Error(`No se encontro FIRMA_ENVIADA para signatureRequestId=${sign.signatureRequestId}`);
  }

  const sentLegalDoc = await prisma.legalDocument.findFirst({
    where: { operationId: options.operationId, documentKind: input.kind },
    select: { status: true, signatureRequestId: true, cloudinaryUrl: true },
  });
  reportStep(
    4,
    "Envio real a firma",
    "PASS",
    Date.now() - signStartedAt,
    `signatureRequestId=${sign.signatureRequestId}, legalDocStatus=${sentLegalDoc?.status ?? "?"}, normalizedToPdf=${sign.normalizedToPdf}`,
  );

  const waStartedAt = Date.now();
  const sentProcessing = await ensureProcessEventHandled(sentEvent);
  reportStep(
    5,
    "Procesado de FIRMA_ENVIADA y WhatsApp real",
    sentProcessing.status === "COMPLETED" ? "PASS" : "FAIL",
    Date.now() - waStartedAt,
    `event=${sentEvent.id}, processJob=${sentProcessing.jobId ?? "?"}, status=${sentProcessing.status}`,
  );

  const token = extractTokenFromSigningUrl(sign.signingUrl);
  const metadataStartedAt = Date.now();
  const metadata = await fetchSignatureMetadata(token);
  reportStep(
    6,
    "Publicacion del enlace real de firma",
    "PASS",
    Date.now() - metadataStartedAt,
    `token=${token}, status=${metadata.status ?? "?"}, phone=${metadata.phoneMasked ?? "null"}`,
  );

  printHumanInstructions(sign.signingUrl, token, options.signerPhone, metadata);

  if (options.noWait) {
    reportStep(
      7,
      "Fase humana de firma",
      "WAIT",
      0,
      `No wait activado. Completa la firma manualmente en ${sign.signingUrl}`,
    );
    printSummary();
    return;
  }

  const humanStartedAt = Date.now();
  const waitResult = await waitForHumanSignature(
    sign.signatureRequestId,
    options.timeoutMinutes,
  );

  if (waitResult.status !== "COMPLETED") {
    reportStep(
      7,
      "Fase humana de firma",
      "FAIL",
      Date.now() - humanStartedAt,
      `Estado final durante la espera: ${waitResult.status}`,
    );
    printSummary();
    process.exitCode = 1;
    return;
  }

  reportStep(
    7,
    "Fase humana de firma",
    "PASS",
    Date.now() - humanStartedAt,
    `signedDocumentUrl=${waitResult.signedDocumentUrl ?? "null"}`,
  );

  const completeStartedAt = Date.now();
  const completedEvent = await findSignatureEvent(
    options.propertyCode,
    "FIRMA_COMPLETADA",
    sign.signatureRequestId,
  );
  if (!completedEvent) {
    throw new Error(`No se encontro FIRMA_COMPLETADA para signatureRequestId=${sign.signatureRequestId}`);
  }

  const completedProcessing = await ensureProcessEventHandled(completedEvent);
  const finalSignatureRequest = await prisma.signatureRequest.findUnique({
    where: { id: sign.signatureRequestId },
    select: {
      status: true,
      signedDocumentUrl: true,
      auditTrailUrl: true,
    },
  });
  const finalLegalDoc = await prisma.legalDocument.findFirst({
    where: { operationId: options.operationId, documentKind: input.kind },
    select: {
      status: true,
      signedDocumentUrl: true,
      auditTrailUrl: true,
      signatureRequestId: true,
    },
  });
  const queuedWriteJob = await prisma.jobQueue.findFirst({
    where: {
      type: "WRITE_TO_INMOVILLA",
      sourceEventId: completedEvent.id,
    },
    orderBy: { createdAt: "desc" },
  });

  const postSignOk =
    completedProcessing.status === "COMPLETED" &&
    finalSignatureRequest?.status === "COMPLETED" &&
    finalLegalDoc?.status === "SIGNED";

  reportStep(
    8,
    "Verificacion final de firma y estados persistidos",
    postSignOk ? "PASS" : "FAIL",
    Date.now() - completeStartedAt,
    [
      `signatureRequest=${finalSignatureRequest?.status ?? "?"}`,
      `legalDoc=${finalLegalDoc?.status ?? "?"}`,
      `processEvent=${completedProcessing.status}`,
      `writeToInmovillaQueued=${queuedWriteJob ? queuedWriteJob.status : "NO"}`,
    ].join(", "),
  );

  console.log("\nArtefactos finales:");
  console.log(`- signingUrl: ${sign.signingUrl}`);
  console.log(`- signedDocumentUrl: ${finalSignatureRequest?.signedDocumentUrl ?? "null"}`);
  console.log(`- auditTrailUrl: ${finalSignatureRequest?.auditTrailUrl ?? "null"}`);
  console.log(`- legalDocumentSignatureRequestId: ${finalLegalDoc?.signatureRequestId ?? "null"}`);
  console.log(`- totalMs: ${Date.now() - startAt}`);

  printSummary();

  if (!postSignOk) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[firma-live] Error fatal:", error instanceof Error ? error.message : error);
  printSummary();
  process.exit(1);
});
