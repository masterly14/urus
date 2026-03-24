import { NextResponse } from "next/server";
import { appendEvent } from "@/lib/event-store/event-store";
import { AggregateType, EventType } from "@/app/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import {
  createCalendarEvent,
  type CalendarEventInput,
} from "@/lib/composio";

interface AgendaRequestBody {
  demandId: string;
  comercialId?: string;
  clienteNombre: string;
  propiedad: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  ubicacion?: string;
  notas?: string;
}

export async function POST(request: Request) {
  try {
    const body: AgendaRequestBody = await request.json();

    const { demandId, clienteNombre, propiedad, fecha, horaInicio, horaFin } =
      body;

    if (
      !demandId ||
      !clienteNombre ||
      !propiedad ||
      !fecha ||
      !horaInicio ||
      !horaFin
    ) {
      return NextResponse.json(
        {
          error:
            "demandId, clienteNombre, propiedad, fecha, horaInicio y horaFin son obligatorios",
        },
        { status: 400 },
      );
    }

    const calendarInput: CalendarEventInput = {
      titulo: `Visita: ${propiedad} — ${clienteNombre}`,
      descripcion: [
        `Visita de inmueble para demanda ${demandId}.`,
        `Cliente: ${clienteNombre}`,
        `Propiedad: ${propiedad}`,
        body.notas ? `Notas: ${body.notas}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      fecha,
      horaInicio,
      horaFin,
      ubicacion: body.ubicacion,
    };

    const calendarResult = await createCalendarEvent(calendarInput);

    const event = await appendEvent({
      type: EventType.VISITA_AGENDADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: demandId,
      payload: {
        comercialId: body.comercialId || "system",
        clienteNombre,
        propiedad,
        fecha,
        horaInicio,
        horaFin,
        ubicacion: body.ubicacion || "",
        notas: body.notas || "",
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
