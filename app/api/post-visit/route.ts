import { NextResponse } from "next/server";
import { z } from "zod";
import { appendEvent } from "@/lib/event-store/event-store";
import { AggregateType, EventType } from "@/app/generated/prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

const BodySchema = z.object({
  demandId: z.string(),
  interes: z.enum(["alto", "medio", "bajo"]),
  notas: z.string().optional().default(""),
  comercialId: z.string().optional(),
  propertyCode: z.string().optional(),
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

    const { demandId, interes, notas, comercialId, propertyCode } = parsed.data;

    const event = await appendEvent({
      type: EventType.VISITA_EVALUADA,
      aggregateType: AggregateType.DEMAND,
      aggregateId: demandId,
      payload: {
        interes,
        notas,
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
