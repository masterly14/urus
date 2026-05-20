import {
  AggregateType,
  EventType,
  type MicrositeSelectionDecision,
  type Prisma,
} from "@prisma/client";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import type { JsonValue } from "@/lib/event-store/types";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";


const bodySchema = z.object({
  propertyId: z.string().min(1),
  decision: z.enum(["ME_INTERESA", "NO_ME_ENCAJA"]),
});

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

const postHandler = async (request: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;

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
    where: { token },
    select: {
      id: true,
      token: true,
      status: true,
      demandId: true,
      demandNombre: true,
      comercialId: true,
      properties: true,
      expiresAt: true,
    },
  });

  if (!selection) {
    return NextResponse.json({ error: "Selection not found" }, { status: 404 });
  }
  if (selection.status === "EXPIRED" || (selection.expiresAt && selection.expiresAt.getTime() < Date.now())) {
    return NextResponse.json({ error: "Selection expired" }, { status: 410 });
  }

  const properties = coerceMicrositeCuratedProperties(selection.properties as unknown);
  const selectedProperty = properties.find((p) => p.propertyId === parsed.data.propertyId);
  if (!selectedProperty) {
    return NextResponse.json({ error: "Property not found in selection" }, { status: 404 });
  }

  const decision = parsed.data.decision as MicrositeSelectionDecision;
  const existing = await prisma.micrositeSelectionFeedback.findUnique({
    where: {
      selectionId_propertyId: {
        selectionId: selection.id,
        propertyId: parsed.data.propertyId,
      },
    },
    select: { id: true, decision: true },
  });

  // Idempotencia hard: si ya hay un ME_INTERESA registrado para esta propiedad,
  // devolvemos 409 para que el cliente pueda bloquear el botón sin ambigüedad y
  // no se emita un nuevo evento (lo que dispararía un WhatsApp duplicado).
  // Para NO_ME_ENCAJA mantenemos el 200 (la decisión negativa puede repetirse
  // sin efectos secundarios visibles al comprador).
  if (existing?.decision === "ME_INTERESA" && decision === "ME_INTERESA") {
    return NextResponse.json(
      { ok: false, alreadyRecorded: true, decision: "ME_INTERESA" },
      { status: 409 },
    );
  }

  if (existing?.decision === decision) {
    return NextResponse.json({
      ok: true,
      alreadyRecorded: true,
      decision,
    });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  const feedbackPayload = {
    token: selection.token,
    demandId: selection.demandId,
    demandNombre: selection.demandNombre,
    comercialId: selection.comercialId,
    selectionId: selection.id,
    propertyId: selectedProperty.propertyId,
    decision,
    // `source.channel` está al primer nivel del payload (no solo en metadata)
    // para que los handlers (`handleSeleccionComprador`) puedan discriminar
    // el canal sin tener que leer metadata. `microsite_card` indica que la
    // decisión viene del botón "Me encaja" del micrositio.
    source: {
      channel: "microsite_card" as const,
      token: selection.token,
      ip,
      userAgent,
    },
    property: {
      propertyId: selectedProperty.propertyId,
      title: selectedProperty.title,
      price: selectedProperty.price,
      metersBuilt: selectedProperty.metersBuilt,
      zone: selectedProperty.zone,
      city: selectedProperty.city,
      extras: selectedProperty.extras,
      images: selectedProperty.images.slice(0, 4),
      link: selectedProperty.link,
    },
    respondedAt: new Date().toISOString(),
  } as const;

  const metadata = {
    channel: "microsite_card",
    userAgent,
    ip,
  };

  const event = await appendEvent({
    type: EventType.SELECCION_COMPRADOR,
    aggregateType: AggregateType.DEMAND,
    aggregateId: selection.demandId,
    payload: feedbackPayload as unknown as JsonValue,
    metadata: metadata as unknown as JsonValue,
  });

  await prisma.micrositeSelectionFeedback.upsert({
    where: {
      selectionId_propertyId: {
        selectionId: selection.id,
        propertyId: parsed.data.propertyId,
      },
    },
    update: {
      decision,
      payload: feedbackPayload as unknown as Prisma.InputJsonValue,
    },
    create: {
      selectionId: selection.id,
      propertyId: parsed.data.propertyId,
      decision,
      payload: feedbackPayload as unknown as Prisma.InputJsonValue,
    },
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    decision,
  });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/seleccion/[token]/feedback" }, postHandler);
