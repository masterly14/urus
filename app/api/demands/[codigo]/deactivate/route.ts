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
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";

export const runtime = "nodejs";

const KEYSITU_DESCARTADA = "23";

function pickString(
  raw: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && v > 0) return String(v);
  }
  return null;
}

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

  await prisma.demandCurrent.update({
    where: { codigo },
    data: { leadStatus: "PERDIDO" },
  });

  const event = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: codigo,
    payload: {
      source: "platform-deactivate",
      leadStatus: "PERDIDO",
      updatedBy: session.nombre ?? session.email ?? "unknown",
    } as unknown as JsonValue,
  });

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo },
    select: { ref: true, raw: true },
  });

  if (snapshot) {
    const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
    const clientId = pickString(raw, ["keycli", "cod_cli", "clientes-cod_cli", "clientes-cod_clipriclave"]);
    const agentId = pickString(raw, ["keyagente", "demandas-keyagente", "idUsuario", "agente"]);
    const propertyTypes = pickString(raw, ["tipopropiedad", "tipos"]) ?? "";
    const demandRef = snapshot.ref?.trim() || codigo;

    if (clientId && agentId) {
      await enqueueJob({
        type: "WRITE_TO_INMOVILLA",
        payload: {
          operation: "updateDemandStatus",
          args: {
            demandId: codigo,
            demandRef,
            clientId,
            agentId,
            propertyTypes,
            keysitu: KEYSITU_DESCARTADA,
          },
        },
        idempotencyKey: `write_to_inmovilla:updateDemandStatus:deactivate:${event.id}`,
        sourceEventId: event.id,
      });

      console.log(
        `[deactivate] demanda=${codigo} → PERDIDO + keysitu=${KEYSITU_DESCARTADA} por ${session.email ?? "unknown"}`,
      );
    } else {
      console.warn(
        `[deactivate] demanda=${codigo} → PERDIDO (local only, missing clientId/agentId for Inmovilla sync)`,
      );
    }
  }

  return NextResponse.json({ ok: true, leadStatus: "PERDIDO" });
}
