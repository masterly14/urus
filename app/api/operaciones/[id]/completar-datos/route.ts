import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/job-queue/types";
import { canAccessOperacion, OPERACION_FORBIDDEN_ERROR } from "@/lib/operacion/access";
import { documentKindForStage } from "@/lib/operacion/stages";

type Params = { params: Promise<{ id: string }> };

const CompletarDatosSchema = z.object({
  documentKind: z.enum(["oferta_firme", "senal_compra", "arras"]),
  data: z.record(z.string(), z.unknown()),
});

/**
 * POST /api/operaciones/:id/completar-datos
 *
 * Cuando la generación automática de contrato falló por datos incompletos,
 * el comercial proporciona los datos faltantes desde la UI. Este endpoint
 * re-encola GENERATE_CONTRACT_DRAFT con los datos actualizados.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = CompletarDatosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: {
      id: true,
      codigo: true,
      propertyCode: true,
      demandId: true,
      estado: true,
      comercialId: true,
    },
  });

  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  if (!canAccessOperacion(session, operacion)) {
    return NextResponse.json({ error: OPERACION_FORBIDDEN_ERROR }, { status: 403 });
  }

  const expectedKind = documentKindForStage(operacion.estado);
  if (expectedKind && expectedKind !== parsed.data.documentKind) {
    return NextResponse.json(
      {
        error: `El estado actual (${operacion.estado}) corresponde a documentKind="${expectedKind}", no "${parsed.data.documentKind}"`,
      },
      { status: 400 },
    );
  }

  const attempt = Date.now();

  await enqueueJob({
    type: "GENERATE_CONTRACT_DRAFT",
    payload: {
      propertyCode: operacion.propertyCode,
      demandId: operacion.demandId,
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      documentKind: parsed.data.documentKind,
      manualData: parsed.data.data,
      newEstado: operacion.estado,
    } as unknown as JsonValue,
    idempotencyKey: `contract_draft_retry:${operacion.id}:${parsed.data.documentKind}:${attempt}`,
  });

  console.log(
    `[api/operaciones] completar-datos — re-encolado GENERATE_CONTRACT_DRAFT para ${operacion.codigo} kind=${parsed.data.documentKind}`,
  );

  return NextResponse.json({ ok: true, message: "Generación de contrato re-encolada" });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/operaciones/[id]/completar-datos" },
  postHandler,
);
