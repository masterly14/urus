/**
 * POST /api/demands/[codigo]/reassign
 *
 * Reasigna una demanda a otro comercial. Solo CEO/Admin.
 * Actualiza Inmovilla vía guardar.php (demandas-keyagente) y la
 * proyección local de forma optimista.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSessionFromRequest,
  unauthorized,
  forbidden,
  isCeoOrAdmin,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  comercialId: z.string().min(1, "comercialId es requerido"),
});

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
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { codigo } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { comercialId } = parsed.data;

  const [comercial, snapshot] = await Promise.all([
    prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { id: true, nombre: true, inmovillaAgentId: true },
    }),
    prisma.demandSnapshot.findUnique({
      where: { codigo },
      select: { ref: true, raw: true },
    }),
  ]);

  if (!comercial) {
    return NextResponse.json(
      { error: "Comercial no encontrado" },
      { status: 404 },
    );
  }
  if (!comercial.inmovillaAgentId) {
    return NextResponse.json(
      { error: "El comercial no tiene inmovillaAgentId configurado — no se puede reasignar en Inmovilla." },
      { status: 422 },
    );
  }
  if (!snapshot) {
    return NextResponse.json(
      { error: "Demanda no encontrada" },
      { status: 404 },
    );
  }

  const raw = (snapshot.raw as Record<string, unknown>) ?? {};
  const demandRef = snapshot.ref?.trim() || codigo;
  const clientId = pickString(raw, [
    "keycli",
    "cod_cli",
    "clientes-cod_cli",
    "clientes-cod_clipriclave",
  ]);
  const currentAgentId = pickString(raw, [
    "keyagente",
    "demandas-keyagente",
    "idUsuario",
    "agente",
  ]);
  const propertyTypes = pickString(raw, ["tipopropiedad", "tipos"]) ?? "";

  if (!clientId || !currentAgentId) {
    return NextResponse.json(
      {
        error: `No se pudo resolver clientId/agentId de la demanda (clientId=${clientId ?? "null"}, agentId=${currentAgentId ?? "null"})`,
      },
      { status: 422 },
    );
  }

  const newAgentId = String(comercial.inmovillaAgentId);

  try {
    await prisma.demandCurrent.update({
      where: { codigo },
      data: {
        agente: comercial.nombre,
        comercialId: comercial.id,
      },
    });
  } catch (updateErr) {
    console.warn(
      `[reassign] Optimistic update falló (no bloqueante): ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
    );
  }

  const event = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: codigo,
    payload: {
      source: "agent-reassign",
      newAgent: {
        comercialId: comercial.id,
        nombre: comercial.nombre,
        inmovillaAgentId: comercial.inmovillaAgentId,
      },
      previousAgentId: currentAgentId,
      updatedBy: session.nombre ?? session.email ?? "unknown",
    } as unknown as JsonValue,
  });

  await enqueueJob({
    type: "WRITE_TO_INMOVILLA",
    payload: {
      operation: "updateDemandAgent",
      args: {
        demandId: codigo,
        demandRef,
        clientId,
        agentId: currentAgentId,
        newAgentId,
        propertyTypes,
      },
    },
    idempotencyKey: `write_to_inmovilla:updateDemandAgent:${event.id}`,
    sourceEventId: event.id,
  });

  console.log(
    `[reassign] demanda=${codigo} → comercial=${comercial.nombre} (inmovillaAgentId=${newAgentId}) por ${session.email ?? "unknown"}`,
  );

  return NextResponse.json({
    ok: true,
    comercialNombre: comercial.nombre,
    comercialId: comercial.id,
  });
}
