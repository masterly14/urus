import { NextResponse } from "next/server";
import { z } from "zod";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { closeOperacion } from "@/lib/operacion/close";
import { CLOSED_ESTADOS } from "@/lib/operacion/stages";
import type { ClosedEstado } from "@/lib/operacion/stages";

type Params = { params: Promise<{ id: string }> };

const CerrarSchema = z.object({
  tipoCierre: z.enum(CLOSED_ESTADOS as unknown as [string, ...string[]]),
  demandId: z.string().trim().min(1).optional(),
  buyerClientId: z.string().trim().min(1).optional(),
});

const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = CerrarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const comercialId = session.comercialId ?? session.userId;

  const result = await closeOperacion({
    operacionId,
    tipoCierre: parsed.data.tipoCierre as ClosedEstado,
    demandId: parsed.data.demandId,
    buyerClientId: parsed.data.buyerClientId,
    comercialId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/operaciones/[id]/cerrar" },
  patchHandler,
);
