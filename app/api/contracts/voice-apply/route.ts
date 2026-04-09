import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadContractDocument } from "@/lib/cloudinary";
import { interpretVoiceAndRegenerateDocx } from "@/lib/contracts/voice/interpret-and-regenerate";
import {
  contratoVersionadoPayloadSchema,
  type ContratoVersionadoCloudinary,
} from "@/lib/contracts/versioning/contrato-versionado-payload";
import { appendEvent } from "@/lib/event-store/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import type { ContractTemplateInput } from "@/types/contracts";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

export const maxDuration = 60;

const SUPPORTED_KINDS = ["arras", "senal_compra", "oferta_firme"] as const;

const ContractTemplateInputSchema: z.ZodType<ContractTemplateInput> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("arras"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("oferta_firme"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("senal_compra"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("anexo_mobiliario"), templateVersion: z.string().optional(), payload: z.any() }),
]);

const VersioningContextSchema = z
  .object({
    propertyCode: z.string().optional(),
    operationId: z.string().optional(),
    actorUserId: z.string().optional(),
    /** Si true, persiste CONTRATO_VERSIONADO en Neon (requiere propertyCode y operationId). */
    recordVersionEvent: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.recordVersionEvent === true) {
      if (!v.propertyCode?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "versioningContext.propertyCode requerido si recordVersionEvent es true",
          path: ["propertyCode"],
        });
      }
      if (!v.operationId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "versioningContext.operationId requerido si recordVersionEvent es true",
          path: ["operationId"],
        });
      }
    }
  });

const BodySchema = z.object({
  transcript: z.string().min(1, "transcript vacío"),
  contractTemplateInput: ContractTemplateInputSchema,
  outputTemplateVersion: z.string().optional(),
  /** Si es false, no incrementa `_vN` aunque haya cambios (misma revisión de plantilla). Por defecto true. */
  bumpRevision: z.boolean().optional(),
  versioningContext: VersioningContextSchema.optional(),
});

async function tryUploadVoiceRevisionDocx(params: {
  buffer: Buffer;
  fileName: string;
  operationId: string;
  propertyCode: string;
  templateVersion: string;
  documentKind: string;
}): Promise<ContratoVersionadoCloudinary | undefined> {
  try {
    const r = await uploadContractDocument({
      buffer: params.buffer,
      fileName: params.fileName,
      folder: `contracts/${params.operationId}`,
      tags: ["draft", "voice-revision", params.documentKind],
      context: {
        operationId: params.operationId,
        propertyCode: params.propertyCode,
        templateVersion: params.templateVersion,
      },
    });
    return { publicId: r.publicId, secureUrl: r.secureUrl, bytes: r.bytes };
  } catch {
    return undefined;
  }
}

const postHandler = async (request: Request) => {
  const requestStartedAt = Date.now();
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no está configurada" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cuerpo inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    transcript,
    contractTemplateInput,
    outputTemplateVersion,
    bumpRevision,
    versioningContext,
  } = parsed.data;

  if (!SUPPORTED_KINDS.includes(contractTemplateInput.kind as (typeof SUPPORTED_KINDS)[number])) {
    return NextResponse.json(
      { error: `kind="${contractTemplateInput.kind}" no soportado. Aceptados: ${SUPPORTED_KINDS.join(", ")}.` },
      { status: 422 },
    );
  }

  try {
    const result = await interpretVoiceAndRegenerateDocx({
      transcript,
      input: contractTemplateInput,
      outputTemplateVersion,
      bumpTemplateRevision: bumpRevision !== false,
    });

    if ("needsClarification" in result && result.needsClarification) {
      console.info("[voice-apply]", {
        kind: contractTemplateInput.kind,
        propertyCode: versioningContext?.propertyCode ?? null,
        operationId: versioningContext?.operationId ?? null,
        result: "needs_clarification",
        confidence: result.patch.confidence,
        ambiguousPoints: result.patch.ambiguousPoints.length,
        interpretationMs: result.metrics.interpretationMs,
        regenerationMs: result.metrics.regenerationMs,
        totalMs: Date.now() - requestStartedAt,
      });

      return NextResponse.json(
        {
          ok: false,
          needsClarification: true,
          clarificationQuestions: result.clarificationQuestions,
          patch: result.patch,
          appliedSummaries: result.appliedSummaries,
          previousTemplateVersion: result.previousTemplateVersion,
          nextTemplateVersion: result.nextTemplateVersion,
          hadAppliedChanges: result.hadAppliedChanges,
          updatedInput: result.updatedInput,
          validationIssues: [],
          versionEventRecorded: false,
        },
        { status: 200 },
      );
    }

    if (!result.ok) {
      console.info("[voice-apply]", {
        kind: contractTemplateInput.kind,
        propertyCode: versioningContext?.propertyCode ?? null,
        operationId: versioningContext?.operationId ?? null,
        result: "validation_failed",
        confidence: result.patch.confidence,
        ambiguousPoints: result.patch.ambiguousPoints.length,
        issues: result.issues.length,
        interpretationMs: result.metrics.interpretationMs,
        regenerationMs: result.metrics.regenerationMs,
        totalMs: Date.now() - requestStartedAt,
      });

      return NextResponse.json(
        {
          ok: false,
          patch: result.patch,
          appliedSummaries: result.appliedSummaries,
          previousTemplateVersion: result.previousTemplateVersion,
          nextTemplateVersion: result.nextTemplateVersion,
          hadAppliedChanges: result.hadAppliedChanges,
          updatedInput: result.updatedInput,
          validationIssues: result.issues,
          versionEventRecorded: false,
        },
        { status: 200 },
      );
    }

    let versionEventRecorded = false;
    const shouldRecord =
      versioningContext?.recordVersionEvent === true &&
      (result.nextTemplateVersion !== result.previousTemplateVersion ||
        result.hadAppliedChanges);

    if (shouldRecord && versioningContext) {
      const buf = Buffer.from(result.docx.bufferBase64, "base64");
      const docxSha256 = createHash("sha256").update(buf).digest("hex");
      const transcriptSha256 = createHash("sha256").update(transcript, "utf8").digest("hex");
      const cloudinary = await tryUploadVoiceRevisionDocx({
        buffer: buf,
        fileName: result.docx.fileName,
        operationId: versioningContext.operationId ?? "",
        propertyCode: versioningContext.propertyCode ?? "",
        templateVersion: result.nextTemplateVersion ?? "",
        documentKind: contractTemplateInput.kind,
      });

      const rawPayload = {
        operationId: versioningContext.operationId,
        propertyCode: versioningContext.propertyCode,
        documentKind: contractTemplateInput.kind,
        previousTemplateVersion: result.previousTemplateVersion ?? null,
        nextTemplateVersion:
          result.nextTemplateVersion ??
          result.updatedInput.templateVersion ??
          "revision-unknown",
        docxFileName: result.docx.fileName,
        appliedSummaries: result.appliedSummaries,
        patch: result.patch,
        contractInput: result.updatedInput,
        transcriptSha256,
        actorUserId: versioningContext.actorUserId,
        docxSha256,
        cloudinary,
      };
      const payload = contratoVersionadoPayloadSchema.parse(rawPayload);

      await appendEvent({
        type: "CONTRATO_VERSIONADO",
        aggregateType: "PROPERTY",
        aggregateId:
          versioningContext.propertyCode ??
          versioningContext.operationId ??
          "unknown",
        payload: JSON.parse(JSON.stringify(payload)) as JsonValue,
      });
      versionEventRecorded = true;
    }

    console.info("[voice-apply]", {
      kind: contractTemplateInput.kind,
      propertyCode: versioningContext?.propertyCode ?? null,
      operationId: versioningContext?.operationId ?? null,
      result: "ok",
      confidence: result.patch.confidence,
      ambiguousPoints: result.patch.ambiguousPoints.length,
      appliedChanges: result.appliedSummaries.length,
      versionEventRecorded,
      interpretationMs: result.metrics.interpretationMs,
      regenerationMs: result.metrics.regenerationMs,
      totalMs: Date.now() - requestStartedAt,
    });

    return NextResponse.json({
      ok: true,
      patch: result.patch,
      appliedSummaries: result.appliedSummaries,
      previousTemplateVersion: result.previousTemplateVersion,
      nextTemplateVersion: result.nextTemplateVersion,
      hadAppliedChanges: result.hadAppliedChanges,
      updatedInput: result.updatedInput,
      docxFileName: result.docx.fileName,
      docxBase64: result.docx.bufferBase64,
      versionEventRecorded,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice-apply]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/contracts/voice-apply" }, postHandler);
