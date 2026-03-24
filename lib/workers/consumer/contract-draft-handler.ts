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

interface GenerateContractDraftPayload {
  propertyCode: string;
  demandId?: string;
  operationId?: string;
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
  const operationId = payload.operationId ?? `OP-${propertyCode}`;

  console.log(
    `[smart-closing] GENERATE_CONTRACT_DRAFT job=${job.id} property=${propertyCode} estado="${newEstado ?? "?"}"`,
  );

  const deps = createDefaultArrasExtractionDeps();

  const extractionResult = await buildArrasContractTemplateInputFromNeonAndInmovilla(
    {
      demandId,
      propertyCode,
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
      templateVersion: extractionResult.input.templateVersion ?? "m8-v1",
    },
  });

  console.log(
    `[smart-closing] DOCX subido a Cloudinary: ${uploadResult.secureUrl} (${uploadResult.bytes} bytes)`,
  );

  await appendEvent({
    type: "CONTRATO_BORRADOR_GENERADO",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      operationId,
      demandId,
      propertyCode,
      documentKind: "arras",
      templateVersion: extractionResult.input.templateVersion ?? "m8-v1",
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
