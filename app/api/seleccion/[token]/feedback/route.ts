import {
  AggregateType,
  EventType,
  type MicrositeSelectionDecision,
  type Prisma,
} from "@/app/generated/prisma/client";
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

  if (existing?.decision === decision) {
    return NextResponse.json({
      ok: true,
      alreadyRecorded: true,
      decision,
    });
  }

  const feedbackPayload = {
    token: selection.token,
    demandId: selection.demandId,
    demandNombre: selection.demandNombre,
    comercialId: selection.comercialId,
    selectionId: selection.id,
    decision,
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
    channel: "microsite",
    userAgent: request.headers.get("user-agent"),
    ip: getClientIp(request),
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
