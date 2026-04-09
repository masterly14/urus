import { NextResponse } from "next/server";
import { appendEvent } from "@/lib/event-store/event-store";
import { AggregateType, EventType } from "@/app/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { withObservedRoute } from "@/lib/observability";


/**
 * POST — Abrir incidencia post-venta.
 * Llamado desde el micro-frontend cuando el comprador pulsa "Necesito ayuda".
 * Emite evento INCIDENCIA_POSTVENTA_ABIERTA y notifica al comercial.
 */
const postHandler = async (request: Request) => {
  try {
    const body = await request.json();
    const { propertyCode, buyerPhone, description } = body;

    if (!propertyCode) {
      return NextResponse.json(
        { error: "propertyCode es obligatorio" },
        { status: 400 },
      );
    }

    const event = await appendEvent({
      type: EventType.INCIDENCIA_POSTVENTA_ABIERTA,
      aggregateType: AggregateType.PROPERTY,
      aggregateId: propertyCode,
      payload: {
        buyerPhone: buyerPhone || "",
        description: description || "",
        openedAt: new Date().toISOString(),
      },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });

    const alertPhone = process.env.ALERT_WHATSAPP_TO;
    if (alertPhone) {
      await enqueueJob({
        type: "NOTIFY_LEAD_WHATSAPP",
        payload: {
          assignedAgentTelefono: alertPhone,
          leadAggregateId: propertyCode,
          score: 0,
          slaLevel: "INCIDENCIA_POSTVENTA",
        },
        idempotencyKey: `notify_incidencia:${event.id}`,
        sourceEventId: event.id,
      });
    }

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("[postventa/incidencia] Error POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/postventa/incidencia" }, postHandler);

/**
 * PATCH — Resolver incidencia post-venta.
 * Llamado desde el panel del comercial al marcar "Resuelto".
 * Emite evento INCIDENCIA_POSTVENTA_RESUELTA — la cadencia se reanuda
 * automáticamente en el siguiente ciclo del cron scanner.
 */
const patchHandler = async (request: Request) => {
  try {
    const body = await request.json();
    const { propertyCode, resolvedBy } = body;

    if (!propertyCode) {
      return NextResponse.json(
        { error: "propertyCode es obligatorio" },
        { status: 400 },
      );
    }

    const event = await appendEvent({
      type: EventType.INCIDENCIA_POSTVENTA_RESUELTA,
      aggregateType: AggregateType.PROPERTY,
      aggregateId: propertyCode,
      payload: {
        resolvedBy: resolvedBy || "system",
        resolvedAt: new Date().toISOString(),
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
    console.error("[postventa/incidencia] Error PATCH:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const PATCH = withObservedRoute({ method: "PATCH", route: "/api/postventa/incidencia" }, patchHandler);
