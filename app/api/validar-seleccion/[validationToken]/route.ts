import { NextResponse } from "next/server";
import { AggregateType, EventType } from "@prisma/client";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";
import { prisma } from "@/lib/prisma";
import {
  applyDescriptionUpdates,
  coerceMicrositeCuratedProperties,
} from "@/lib/microsite/selection";
import { z } from "zod";
import { withObservedRoute } from "@/lib/observability";


const bodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

const patchBodySchema = z.object({
  updates: z.array(
    z.object({
      propertyId: z.string().min(1),
      description: z.string().max(16_000).nullable(),
    }),
  ).min(1).max(12),
});

const postHandler = async (request: Request, context: { params: Promise<{ validationToken: string }> }) => {
  const { validationToken } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { validationToken },
    select: {
      id: true,
      token: true,
      status: true,
      demandId: true,
      demandNombre: true,
      comercialId: true,
      properties: true,
    },
  });

  if (!selection) {
    return NextResponse.json({ error: "Selección no encontrada" }, { status: 404 });
  }

  if (selection.status !== "PENDING_VALIDATION") {
    return NextResponse.json(
      { error: "La selección ya no está pendiente de validación", status: selection.status },
      { status: 409 },
    );
  }

  const now = new Date();

  if (parsed.data.action === "REJECT") {
    const event = await appendEvent({
      type: EventType.SELECCION_RECHAZADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: selection.demandId,
      payload: {
        selectionId: selection.id,
        token: selection.token,
        comercialId: selection.comercialId,
        rejectedAt: now.toISOString(),
      } as JsonValue,
    });

    await prisma.micrositeSelection.update({
      where: { id: selection.id },
      data: {
        status: "REJECTED",
        validatedAt: now,
        validatedByComercialId: selection.comercialId,
      },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });

    return NextResponse.json({ ok: true, eventId: event.id, action: "REJECT" });
  }

  const event = await appendEvent({
    type: EventType.SELECCION_VALIDADA,
    aggregateType: AggregateType.DEMAND,
    aggregateId: selection.demandId,
    payload: {
      selectionId: selection.id,
      token: selection.token,
      comercialId: selection.comercialId,
      propertyIds: coerceMicrositeCuratedProperties(selection.properties as unknown).map(
        (p) => p.propertyId,
      ),
      validatedAt: now.toISOString(),
    } as JsonValue,
  });

  await prisma.micrositeSelection.update({
    where: { id: selection.id },
    data: {
      status: "APPROVED",
      validatedAt: now,
      validatedByComercialId: selection.comercialId,
    },
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  await enqueueJob({
    type: "SEND_MICROSITE_TO_BUYER",
    payload: { selectionId: selection.id },
    priority: 30,
    idempotencyKey: `send_microsite_buyer:${selection.id}`,
  });

  return NextResponse.json({ ok: true, eventId: event.id, action: "APPROVE" });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/validar-seleccion/[validationToken]" }, postHandler);

const patchHandler = async (request: Request, context: { params: Promise<{ validationToken: string }> }) => {
  const { validationToken } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { validationToken },
    select: {
      id: true,
      status: true,
      demandId: true,
      comercialId: true,
      properties: true,
    },
  });

  if (!selection) {
    return NextResponse.json({ error: "Selección no encontrada" }, { status: 404 });
  }

  if (selection.status !== "PENDING_VALIDATION") {
    return NextResponse.json(
      { error: "La selección ya no está pendiente de validación", status: selection.status },
      { status: 409 },
    );
  }

  const updated = applyDescriptionUpdates(selection.properties as unknown, parsed.data.updates);
  if (!updated.ok) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }

  await prisma.micrositeSelection.update({
    where: { id: selection.id },
    data: {
      properties: updated.properties as unknown as object,
    },
  });

  const now = new Date();
  const event = await appendEvent({
    type: EventType.SELECCION_MICROSITE_DESCRIPCIONES_EDITADAS,
    aggregateType: AggregateType.DEMAND,
    aggregateId: selection.demandId,
    payload: {
      selectionId: selection.id,
      comercialId: selection.comercialId,
      propertyIds: parsed.data.updates.map((u) => u.propertyId),
      descriptionLengths: parsed.data.updates.map((u) => ({
        propertyId: u.propertyId,
        length: u.description?.trim().length ?? 0,
      })),
      editedAt: now.toISOString(),
    } as JsonValue,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  return NextResponse.json({ ok: true, eventId: event.id, updatedCount: parsed.data.updates.length });
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/validar-seleccion/[validationToken]" },
  patchHandler,
);
