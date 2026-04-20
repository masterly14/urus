import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { generateContractDocx } from "@/lib/contracts/docx";
import type { ContractTemplateInput } from "@/types/contracts";
import { withObservedRoute } from "@/lib/observability";
import { additionalClausesDocSchema } from "@/lib/contracts/additional-clauses/schema";


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
  additionalClausesDoc: additionalClausesDocSchema.nullable().optional(),
});

/** Solo en builds/runtime de producción se exige sesión (Next/Vercel fijan NODE_ENV=production). */
const requireSessionForRender = process.env.NODE_ENV === "production";

const postHandler = async (request: Request) => {
  if (requireSessionForRender) {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
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

  const { contractTemplateInput, additionalClausesDoc } = parsed.data;

  if (!RENDERABLE_KINDS.includes(contractTemplateInput.kind as (typeof RENDERABLE_KINDS)[number])) {
    return NextResponse.json(
      {
        error: `kind="${contractTemplateInput.kind}" no soportado para render. Use: ${RENDERABLE_KINDS.join(", ")}.`,
      },
      { status: 422 },
    );
  }

  try {
    const result = await generateContractDocx(contractTemplateInput, {
      additionalClausesDoc: additionalClausesDoc ?? null,
    });
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
