import { NextResponse } from "next/server";
import { appendEvent } from "@/lib/event-store/event-store";
import { AggregateType, EventType } from "@/app/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  try {
    const body = await request.json();
    const { demandId, interes, notas, comercialId, propertyCode } = body;

    if (!demandId || !interes) {
      return NextResponse.json(
        { error: "demandId e interes son obligatorios" },
        { status: 400 }
      );
    }

    const event = await appendEvent({
      type: EventType.VISITA_EVALUADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: demandId,
      payload: {
        interes,
        notas: notas || "",
        comercialId: comercialId || "system",
        ...(propertyCode ? { propertyCode } : {}),
      },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("Error en post-visit API:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/post-visit" }, postHandler);
