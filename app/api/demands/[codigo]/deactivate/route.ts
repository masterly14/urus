/**
 * POST /api/demands/[codigo]/deactivate
 *
 * Da de baja una demanda: actualiza leadStatus a PERDIDO localmente
 * y sincroniza keysitu=23 (Descartada) en Inmovilla vía guardar.php.
 * Acceso: CEO/Admin o el comercial asignado.
 */

import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  unauthorized,
  isCeoOrAdmin,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { deactivateDemand } from "@/lib/demands/deactivate";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { codigo } = await params;

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo },
    select: { codigo: true, comercialId: true, leadStatus: true },
  });

  if (!demand) {
    return NextResponse.json({ error: "Demanda no encontrada" }, { status: 404 });
  }

  if (!isCeoOrAdmin(session.role) && demand.comercialId !== session.comercialId) {
    return NextResponse.json(
      { error: "Solo puedes dar de baja tus propias demandas." },
      { status: 403 },
    );
  }

  if (demand.leadStatus === "PERDIDO" || demand.leadStatus === "CERRADO") {
    return NextResponse.json(
      { error: "Esta demanda ya está en un estado terminal." },
      { status: 422 },
    );
  }

  const result = await deactivateDemand({
    demandId: codigo,
    source: "platform-deactivate",
    updatedBy: session.nombre ?? session.email ?? "unknown",
  });

  if (!result.inmovillaSyncQueued) {
    console.warn(
      `[deactivate] demanda=${codigo} → PERDIDO (local only, reason=${result.reason ?? "unknown"})`,
    );
  }

  return NextResponse.json(result);
}
