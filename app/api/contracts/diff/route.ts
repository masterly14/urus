import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { diffContractTemplatePayload } from "@/lib/contracts/versioning/diff-payload";
import type { ContractTemplateInput } from "@/types/contracts";
import { withObservedRoute } from "@/lib/observability";


export const runtime = "nodejs";

const ContractTemplateInputSchema: z.ZodType<ContractTemplateInput> = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("arras"), templateVersion: z.string().optional(), payload: z.any() }),
    z.object({
      kind: z.literal("oferta_firme"),
      templateVersion: z.string().optional(),
      payload: z.any(),
    }),
    z.object({
      kind: z.literal("senal_compra"),
      templateVersion: z.string().optional(),
      payload: z.any(),
    }),
    z.object({
      kind: z.literal("anexo_mobiliario"),
      templateVersion: z.string().optional(),
      payload: z.any(),
    }),
  ],
);

const BodySchema = z.object({
  previousInput: ContractTemplateInputSchema,
  nextInput: ContractTemplateInputSchema,
});

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

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

  const { previousInput, nextInput } = parsed.data;
  const changes = diffContractTemplatePayload(previousInput, nextInput);
  return NextResponse.json({ changes });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/contracts/diff" }, postHandler);
