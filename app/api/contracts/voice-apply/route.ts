import { NextResponse } from "next/server";
import { z } from "zod";
import { interpretVoiceAndRegenerateDocx } from "@/lib/contracts/voice/interpret-and-regenerate";
import type { ContractTemplateInput } from "@/types/contracts";

export const runtime = "nodejs";

export const maxDuration = 60;

const SUPPORTED_KINDS = ["arras", "senal_compra", "oferta_firme"] as const;

const ContractTemplateInputSchema: z.ZodType<ContractTemplateInput> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("arras"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("oferta_firme"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("senal_compra"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("anexo_mobiliario"), templateVersion: z.string().optional(), payload: z.any() }),
]);

const BodySchema = z.object({
  transcript: z.string().min(1, "transcript vacío"),
  contractTemplateInput: ContractTemplateInputSchema,
  outputTemplateVersion: z.string().optional(),
  /** Si es false, no incrementa `_vN` aunque haya cambios (misma revisión de plantilla). Por defecto true. */
  bumpRevision: z.boolean().optional(),
});

export async function POST(request: Request) {
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

  const { transcript, contractTemplateInput, outputTemplateVersion, bumpRevision } = parsed.data;

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

    if (!result.ok) {
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
        },
        { status: 200 },
      );
    }

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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice-apply]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
