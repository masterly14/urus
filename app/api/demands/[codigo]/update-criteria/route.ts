/**
 * POST /api/demands/[codigo]/update-criteria
 *
 * Permite al comercial o CEO editar los criterios de búsqueda de una demanda
 * (presupuesto, zonas, tipos, habitaciones, metros). Los cambios se reflejan
 * localmente de forma optimista y se sincronizan con Inmovilla a través del
 * pipeline existente: DEMANDA_ACTUALIZADA → projection + egestion + coverage.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";

export const runtime = "nodejs";

const CriteriaSchema = z
  .object({
    presupuestoMin: z.number().min(0).optional(),
    presupuestoMax: z.number().min(0).optional(),
    habitacionesMin: z.number().int().min(0).optional(),
    metrosMin: z.number().int().min(0).optional(),
    metrosMax: z.number().int().min(0).optional(),
    zonas: z.string().optional(),
    tipos: z.string().optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    { message: "Debe enviar al menos un campo a actualizar" },
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { codigo } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = CriteriaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch = parsed.data;

  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo },
    select: { codigo: true },
  });
  if (!demand) {
    return NextResponse.json({ error: "Demanda no encontrada" }, { status: 404 });
  }

  const localPatch: Record<string, unknown> = {};
  if (patch.presupuestoMin !== undefined) localPatch.presupuestoMin = patch.presupuestoMin;
  if (patch.presupuestoMax !== undefined) localPatch.presupuestoMax = patch.presupuestoMax;
  if (patch.habitacionesMin !== undefined) localPatch.habitacionesMin = patch.habitacionesMin;
  if (patch.metrosMin !== undefined) localPatch.metrosMin = patch.metrosMin;
  if (patch.metrosMax !== undefined) localPatch.metrosMax = patch.metrosMax;
  if (patch.zonas !== undefined) localPatch.zonas = patch.zonas;
  if (patch.tipos !== undefined) localPatch.tipos = patch.tipos;

  try {
    await prisma.demandCurrent.update({
      where: { codigo },
      data: localPatch,
    });
  } catch (updateErr) {
    console.warn(
      `[update-criteria] Optimistic update failed (non-blocking): ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
    );
  }

  const variables: Record<string, unknown> = {};
  if (patch.presupuestoMin !== undefined) variables.precioMin = patch.presupuestoMin;
  if (patch.presupuestoMax !== undefined) variables.precioMax = patch.presupuestoMax;
  if (patch.habitacionesMin !== undefined) variables.habitacionesMin = patch.habitacionesMin;
  if (patch.metrosMin !== undefined) variables.metrosMin = patch.metrosMin;
  if (patch.metrosMax !== undefined) variables.metrosMax = patch.metrosMax;
  if (patch.zonas !== undefined) variables.zonas = patch.zonas;
  if (patch.tipos !== undefined) variables.tipos = patch.tipos;

  const event = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: codigo,
    payload: {
      source: { channel: "platform_edit" },
      variables,
      detectedAt: new Date().toISOString(),
      updatedBy: session.nombre ?? session.email ?? "unknown",
    } as unknown as JsonValue,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id, eventType: event.type },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  const changedFields = Object.keys(patch).filter(
    (k) => patch[k as keyof typeof patch] !== undefined,
  );

  console.log(
    `[update-criteria] demanda=${codigo} campos=[${changedFields.join(",")}] por ${session.email ?? "unknown"}`,
  );

  return NextResponse.json({
    ok: true,
    updatedFields: changedFields,
  });
}
