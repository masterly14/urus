import { NextResponse } from "next/server";
import { z } from "zod";
import { generateContractDocx } from "@/lib/contracts/docx";
import type { ContractTemplateInput } from "@/types/contracts";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

export const maxDuration = 60;

const RENDERABLE_KINDS = ["arras", "senal_compra", "oferta_firme"] as const;

const ContractTemplateInputSchema: z.ZodType<ContractTemplateInput> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("arras"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("oferta_firme"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("senal_compra"), templateVersion: z.string().optional(), payload: z.any() }),
  z.object({ kind: z.literal("anexo_mobiliario"), templateVersion: z.string().optional(), payload: z.any() }),
]);

const BodySchema = z.object({
  contractTemplateInput: ContractTemplateInputSchema,
});

const postHandler = async (request: Request) => {
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

  const { contractTemplateInput } = parsed.data;

  if (!RENDERABLE_KINDS.includes(contractTemplateInput.kind as (typeof RENDERABLE_KINDS)[number])) {
    return NextResponse.json(
      {
        error: `kind="${contractTemplateInput.kind}" no soportado para render. Use: ${RENDERABLE_KINDS.join(", ")}.`,
      },
      { status: 422 },
    );
  }

  try {
    const result = await generateContractDocx(contractTemplateInput);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          validationIssues: result.issues,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      docxFileName: result.fileName,
      docxBase64: result.buffer.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[contracts/render]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/contracts/render" }, postHandler);
