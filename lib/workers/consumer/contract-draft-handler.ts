import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { appendEvent } from "@/lib/event-store/event-store";
import {
  buildContractTemplateInput,
  emitContractDataIncomplete,
} from "@/lib/contracts/extraction";
import { generateContractDocx } from "@/lib/contracts/docx";
import { uploadContractDocument } from "@/lib/cloudinary";
import { buildContractVersionStem } from "@/lib/contracts/naming";
import { prisma } from "@/lib/prisma";
import type { ContractDocumentKind } from "@/types/contracts";
import type { Prisma } from "@prisma/client";

interface GenerateContractDraftPayload {
  propertyCode: string;
  demandId?: string;
  operationId?: string;
  operacionId?: string;
  operacionCodigo?: string;
  previousEstado?: string;
  newEstado?: string;
  sourceEventId?: string;
  documentKind?: string;
  manualData?: Record<string, unknown>;
}

const VALID_DOCUMENT_KINDS = new Set<string>(["arras", "senal_compra", "oferta_firme"]);

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
    documentKind: typeof obj.documentKind === "string" ? obj.documentKind : undefined,
    manualData: obj.manualData && typeof obj.manualData === "object"
      ? obj.manualData as Record<string, unknown>
      : undefined,
  };
}

/**
 * Job handler para GENERATE_CONTRACT_DRAFT.
 * Orquesta: extracción → validación → generación DOCX → upload Cloudinary → evento.
 *
 * Soporta los 3 documentKind: arras, senal_compra, oferta_firme.
 * Si no se especifica documentKind, usa "arras" para backward compatibility
 * con los jobs encolados por smart-closing-handler.
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

  const { propertyCode, newEstado, manualData } = payload;

  const documentKind: ContractDocumentKind =
    payload.documentKind && VALID_DOCUMENT_KINDS.has(payload.documentKind)
      ? (payload.documentKind as ContractDocumentKind)
      : "arras";

  const demandId = payload.demandId ?? propertyCode;
  const operationId = payload.operacionCodigo ?? payload.operationId ?? `OP-${propertyCode}`;
  const operacionId = payload.operacionId ?? undefined;
  const initialTemplateVersion = buildContractVersionStem(operationId, documentKind, 1);

  console.log(
    `[contract-draft] GENERATE_CONTRACT_DRAFT job=${job.id} property=${propertyCode} kind=${documentKind} estado="${newEstado ?? "?"}"`,
  );

  const extractionResult = await buildContractTemplateInput({
    documentKind,
    propertyCode,
    demandId,
    operationId,
    manualData,
    templateVersion: initialTemplateVersion,
  });

  if (!extractionResult.ok) {
    console.log(
      `[contract-draft] Datos incompletos para ${propertyCode} (${documentKind}) — emitiendo DATOS_INCOMPLETOS`,
    );

    await emitContractDataIncomplete(extractionResult.validationSignal);

    return { success: true };
  }

  const docxResult = await generateContractDocx(extractionResult.input);

  if (!docxResult.ok) {
    console.error(
      `[contract-draft] Error generando DOCX para ${propertyCode} (${documentKind}): ${docxResult.issues.map((i) => i.message).join("; ")}`,
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
    tags: ["draft", "v1", documentKind],
    context: {
      operationId,
      propertyCode,
      estado: newEstado ?? "",
      templateVersion: extractionResult.input.templateVersion ?? initialTemplateVersion,
    },
  });

  console.log(
    `[contract-draft] DOCX subido a Cloudinary: ${uploadResult.secureUrl} (${uploadResult.bytes})`,
  );

  const resolvedVersion = extractionResult.input.templateVersion ?? initialTemplateVersion;

  await prisma.legalDocument.upsert({
    where: {
      operationId_documentKind: { operationId, documentKind },
    },
    create: {
      operationId,
      propertyCode,
      documentKind,
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
      documentKind,
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
    `[contract-draft] Evento CONTRATO_BORRADOR_GENERADO emitido para ${propertyCode} (${documentKind})`,
  );

  return { success: true };
}
