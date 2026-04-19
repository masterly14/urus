import { NextResponse } from "next/server";
import { z } from "zod";
import { appendEvent } from "@/lib/event-store/event-store";
import { AggregateType, EventType } from "@/app/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import {
  createCalendarEvent,
  type CalendarEventInput,
} from "@/lib/composio";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

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
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

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

    // H25: resolver la conexión de Composio del comercial autenticado en vez
    // de usar una variable de entorno global. Cada comercial tiene su propia
    // conexión OAuth en `Comercial.composioConnectionId`.
    const effectiveComercialId = comercialId ?? session.comercialId ?? null;
    if (!effectiveComercialId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sin comercial asociado a la sesión para agendar la visita",
        },
        { status: 400 },
      );
    }

    const comercial = await prisma.comercial.findUnique({
      where: { id: effectiveComercialId },
      select: { composioConnectionId: true, nombre: true },
    });

    if (!comercial?.composioConnectionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El comercial no tiene conectado su calendario. Pídele que lo conecte en Configuración → Google Calendar.",
        },
        { status: 409 },
      );
    }

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

    const calendarResult = await createCalendarEvent(
      calendarInput,
      comercial.composioConnectionId,
    );

    const event = await appendEvent({
      type: EventType.VISITA_AGENDADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: demandId,
      payload: {
        sessionId: null,
        comercialId: effectiveComercialId,
        comercialNombre: comercial.nombre ?? clienteNombre,
        demandId,
        propertyCode: propiedad,
        fecha,
        horaInicio,
        horaFin,
        visitorName: clienteNombre,
        visitorPhone: "",
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
