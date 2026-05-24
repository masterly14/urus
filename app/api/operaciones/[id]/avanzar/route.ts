import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/job-queue/types";
import { canAccessOperacion, OPERACION_FORBIDDEN_ERROR } from "@/lib/operacion/access";
import { advanceOperacion } from "@/lib/operacion/advance";
import type { OperacionEstado } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const AvanzarSchema = z.object({
  targetEstado: z.enum([
    "EN_CURSO", "OFERTA_FIRME", "RESERVA", "ARRAS", "PENDIENTE_FIRMA",
  ]),
  manualData: z.record(z.string(), z.unknown()).optional(),
});

const patchHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = AvanzarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const comercialId = session.comercialId ?? session.userId;
  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { comercialId: true },
  });
  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }
  if (!canAccessOperacion(session, operacion)) {
    return NextResponse.json({ error: OPERACION_FORBIDDEN_ERROR }, { status: 403 });
  }

  const result = await advanceOperacion({
    operacionId,
    targetEstado: parsed.data.targetEstado as OperacionEstado,
    manualData: parsed.data.manualData,
    comercialId,
  });

  if (!result.ok && result.missingFields) {
    return NextResponse.json(
      {
        error: "Datos incompletos para avanzar a esta etapa",
        missingFields: result.missingFields,
        documentKind: result.documentKind,
      },
      { status: 422 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.documentKind && result.operacion) {
    const existingDoc = await prisma.legalDocument.findUnique({
      where: {
        operationId_documentKind: {
          operationId: result.operacion.codigo,
          documentKind: result.documentKind,
        },
      },
      select: { id: true, status: true },
    });

    if (!existingDoc) {
      await enqueueJob({
        type: "GENERATE_CONTRACT_DRAFT",
        payload: {
          propertyCode: result.operacion.propertyCode,
          demandId: result.operacion.demandId,
          operacionId: result.operacion.id,
          operacionCodigo: result.operacion.codigo,
          documentKind: result.documentKind,
          manualData: (parsed.data.manualData ?? null) as JsonValue,
          newEstado: parsed.data.targetEstado,
        } as unknown as JsonValue,
        idempotencyKey: `contract_draft:${result.operacion.id}:${result.documentKind}`,
      });
    }
  }

  return NextResponse.json({
    operacion: result.operacion,
    documentKind: result.documentKind,
  });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/operaciones/[id]/avanzar" },
  patchHandler,
);
