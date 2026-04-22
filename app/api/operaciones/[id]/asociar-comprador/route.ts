import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { isTerminal } from "@/lib/operacion/stages";

type Params = { params: Promise<{ id: string }> };

const AsociarSchema = z.object({
  demandId: z.string().trim().min(1).optional(),
  buyerClientId: z.string().trim().min(1).optional(),
}).refine(
  (data) => data.demandId || data.buyerClientId,
  { message: "Se requiere demandId o buyerClientId" },
);

/**
 * PATCH /api/operaciones/:id/asociar-comprador
 *
 * Asocia un comprador (demanda local o buyerClientId directo) a una operación.
 * Emite evento COMPRADOR_ASOCIADO.
 */
const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = AsociarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { id: true, codigo: true, propertyCode: true, estado: true },
  });

  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  if (isTerminal(operacion.estado)) {
    return NextResponse.json(
      { error: `Operación ${operacion.codigo} ya está en estado terminal` },
      { status: 400 },
    );
  }

  const { demandId, buyerClientId } = parsed.data;

  const updateData: Record<string, string> = {};
  if (demandId) updateData.demandId = demandId;
  if (buyerClientId) updateData.buyerClientId = buyerClientId;

  const updated = await prisma.operacion.update({
    where: { id: operacionId },
    data: updateData,
    select: {
      id: true,
      codigo: true,
      demandId: true,
      buyerClientId: true,
    },
  });

  await appendEvent({
    type: "COMPRADOR_ASOCIADO",
    aggregateType: "OPERACION",
    aggregateId: operacion.propertyCode,
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      demandId: demandId ?? null,
      buyerClientId: buyerClientId ?? null,
      source: "manual_association",
      updatedBy: session.userId,
    } as unknown as JsonValue,
  });

  console.log(
    `[asociar-comprador] ${operacion.codigo} — demandId=${demandId ?? "—"} buyerClientId=${buyerClientId ?? "—"} por userId=${session.userId}`,
  );

  return NextResponse.json({ operacion: updated });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/operaciones/[id]/asociar-comprador" },
  patchHandler,
);
