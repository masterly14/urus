import { NextResponse } from "next/server";
import { z } from "zod";
import { appendEvent } from "@/lib/event-store/event-store";
import { AggregateType, EventType } from "@/app/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import {
  createCalendarEvent,
  type CalendarEventInput,
} from "@/lib/composio";
import { withObservedRoute } from "@/lib/observability";

const BodySchema = z.object({
  demandId: z.string(),
  clienteNombre: z.string(),
  propiedad: z.string(),
  fecha: z.string(),
  horaInicio: z.string(),
  horaFin: z.string(),
  comercialId: z.string().optional(),
  ubicacion: z.string().optional(),
  notas: z.string().optional(),
});

const postHandler = async (request: Request) => {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Input inválido",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const {
      demandId,
      clienteNombre,
      propiedad,
      fecha,
      horaInicio,
      horaFin,
      comercialId,
      ubicacion,
      notas,
    } = parsed.data;

    const calendarInput: CalendarEventInput = {
      titulo: `Visita: ${propiedad} — ${clienteNombre}`,
      descripcion: [
        `Visita de inmueble para demanda ${demandId}.`,
        `Cliente: ${clienteNombre}`,
        `Propiedad: ${propiedad}`,
        notas ? `Notas: ${notas}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      fecha,
      horaInicio,
      horaFin,
      ubicacion,
    };

    const calendarResult = await createCalendarEvent(calendarInput);

    const event = await appendEvent({
      type: EventType.VISITA_AGENDADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: demandId,
      payload: {
        comercialId: comercialId || "system",
        clienteNombre,
        propiedad,
        fecha,
        horaInicio,
        horaFin,
        ubicacion: ubicacion || "",
        notas: notas || "",
        calendarEventId: calendarResult.eventId || null,
        calendarLink: calendarResult.link || null,
        calendarSuccess: calendarResult.success,
      },
    });

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: event.id },
      sourceEventId: event.id,
      idempotencyKey: `process_event:${event.id}`,
    });

    return NextResponse.json({
      success: true,
      eventId: event.id,
      calendar: {
        success: calendarResult.success,
        eventId: calendarResult.eventId,
        link: calendarResult.link,
      },
    });
  } catch (error) {
    console.error("Error en agenda API:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/agenda" }, postHandler);
