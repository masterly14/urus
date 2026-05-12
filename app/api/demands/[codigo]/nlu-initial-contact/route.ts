/**
 * POST /api/demands/[codigo]/nlu-initial-contact
 *
 * Inicia manualmente el primer contacto NLU de preferencias para una demanda.
 * Reutiliza la misma plantilla y reglas anti-duplicado del flujo automático
 * disparado por DEMANDA_CREADA.
 *
 * Acceso: CEO/Admin o el comercial asignado a la demanda.
 */

import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { startNluInitialContactForDemand } from "@/lib/nlu/initial-contact";

export const runtime = "nodejs";

const postHandler = async (
  request: Request,
  { params }: { params: Promise<{ codigo: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { codigo } = await params;

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo },
    select: { codigo: true, comercialId: true },
  });

  if (!demand) {
    return NextResponse.json(
      { ok: false, error: "Demanda no encontrada" },
      { status: 404 },
    );
  }

  if (!isCeoOrAdmin(session.role) && demand.comercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "Solo puedes contactar tus propias demandas." },
      { status: 403 },
    );
  }

  const result = await startNluInitialContactForDemand({
    demandId: codigo,
    source: "manual_ui",
    triggeredBy: {
      userId: session.userId,
      nombre: session.nombre,
    },
  });

  if (result.skippedReason === "demand_not_found") {
    return NextResponse.json(
      { ok: false, ...result, error: "Demanda no encontrada" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/demands/[codigo]/nlu-initial-contact" },
  postHandler,
);
