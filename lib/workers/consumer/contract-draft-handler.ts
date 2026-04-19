import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { appendEvent } from "@/lib/event-store/event-store";
import {
  buildArrasContractTemplateInputFromNeonAndInmovilla,
  createDefaultArrasExtractionDeps,
  emitContractDataIncomplete,
} from "@/lib/contracts/extraction";
import { generateContractDocx } from "@/lib/contracts/docx";
import { uploadContractDocument } from "@/lib/cloudinary";
import { buildContractVersionStem } from "@/lib/contracts/naming";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

interface GenerateContractDraftPayload {
  propertyCode: string;
  demandId?: string;
  operationId?: string;
  operacionId?: string;
  operacionCodigo?: string;
  previousEstado?: string;
  newEstado?: string;
  sourceEventId?: string;
}

function parsePayload(raw: unknown): GenerateContractDraftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const propertyCode = obj.propertyCode;
  if (typeof propertyCode !== "string" || !propertyCode) return null;
  return {
    propertyCode,
    demandId: typeof obj.demandId === "string" ? obj.demandId : undefined,
    operationId: typeof obj.operationId === "string" ? obj.operationId : undefined,
    operacionId: typeof obj.operacionId === "string" ? obj.operacionId : undefined,
    operacionCodigo: typeof obj.operacionCodigo === "string" ? obj.operacionCodigo : undefined,
    previousEstado: typeof obj.previousEstado === "string" ? obj.previousEstado : undefined,
    newEstado: typeof obj.newEstado === "string" ? obj.newEstado : undefined,
    sourceEventId: typeof obj.sourceEventId === "string" ? obj.sourceEventId : undefined,
  };
}

/**
 * Job handler para GENERATE_CONTRACT_DRAFT.
 * Orquesta: extracción → validación → generación DOCX → upload Cloudinary → evento.
 */
export async function handleGenerateContractDraft(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "GENERATE_CONTRACT_DRAFT sin propertyCode en payload",
      permanent: true,
    };
  }

  const {
    propertyCode,
    newEstado,
  } = payload;

  const demandId = payload.demandId ?? propertyCode;
  const operationId = payload.operacionCodigo ?? payload.operationId ?? `OP-${propertyCode}`;
  const operacionId = payload.operacionId ?? undefined;
  const initialTemplateVersion = buildContractVersionStem(operationId, "arras", 1);

  console.log(
    `[smart-closing] GENERATE_CONTRACT_DRAFT job=${job.id} property=${propertyCode} estado="${newEstado ?? "?"}"`,
  );

  const deps = createDefaultArrasExtractionDeps();

  const extractionResult = await buildArrasContractTemplateInputFromNeonAndInmovilla(
    {
      demandId,
      propertyCode,
      templateVersion: initialTemplateVersion,
      operation: {
        operationId,
        totalPurchasePriceAmount: 0,
        arrasAmountAmount: 0,
      },
    },
    deps,
  );

  if (!extractionResult.ok) {
    console.log(
      `[smart-closing] Datos incompletos para ${propertyCode} — emitiendo DATOS_INCOMPLETOS`,
    );

    await emitContractDataIncomplete(extractionResult.validationSignal);

    return { success: true };
  }

  const docxResult = await generateContractDocx(extractionResult.input);

  if (!docxResult.ok) {
    console.error(
      `[smart-closing] Error generando DOCX para ${propertyCode}: ${docxResult.issues.map((i) => i.message).join("; ")}`,
    );
    return {
      success: false,
      error: `Generación DOCX falló: ${docxResult.issues.length} issue(s)`,
    };
  }

  const uploadResult = await uploadContractDocument({
    buffer: docxResult.buffer,
    fileName: docxResult.fileName,
    folder: `contracts/${operationId}`,
    tags: ["draft", "v1", "arras"],
    context: {
      operationId,
      propertyCode,
      estado: newEstado ?? "",
      templateVersion: extractionResult.input.templateVersion ?? initialTemplateVersion,
    },
  });

  console.log(
    `[smart-closing] DOCX subido a Cloudinary: ${uploadResult.secureUrl} (${uploadResult.bytes} bytes)`,
  );

  const resolvedVersion = extractionResult.input.templateVersion ?? initialTemplateVersion;

  await prisma.legalDocument.upsert({
    where: {
      operationId_documentKind: { operationId, documentKind: "arras" },
    },
    create: {
      operationId,
      propertyCode,
      documentKind: "arras",
      templateVersion: resolvedVersion,
      status: "DRAFT",
      contractInput: extractionResult.input as unknown as Prisma.JsonObject,
      cloudinaryUrl: uploadResult.secureUrl,
    },
    update: {
      templateVersion: resolvedVersion,
      contractInput: extractionResult.input as unknown as Prisma.JsonObject,
      cloudinaryUrl: uploadResult.secureUrl,
    },
  });

  await appendEvent({
    type: "CONTRATO_BORRADOR_GENERADO",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      operationId,
      operacionId,
      demandId,
      propertyCode,
      documentKind: "arras",
      templateVersion: resolvedVersion,
      fileName: docxResult.fileName,
      cloudinary: {
        publicId: uploadResult.publicId,
        secureUrl: uploadResult.secureUrl,
        bytes: uploadResult.bytes,
      },
      trigger: {
        previousEstado: payload.previousEstado,
        newEstado: payload.newEstado,
      },
    },
    correlationId: payload.sourceEventId,
  });

  console.log(
    `[smart-closing] Evento CONTRATO_BORRADOR_GENERADO emitido para ${propertyCode}`,
  );

  return { success: true };
}
