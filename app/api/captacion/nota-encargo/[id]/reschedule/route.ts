import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSession,
  unauthorized,
  forbidden,
  isCeoOrAdmin,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  NotaEncargoRescheduleError,
  rescheduleNotaEncargoSession,
} from "@/lib/nota-encargo/reschedule";
import { NotaEncargoScheduleError } from "@/lib/nota-encargo/schedule";

const bodySchema = z.object({
  visitDateTime: z.string().datetime(),
});

/**
 * POST /api/captacion/nota-encargo/[id]/reschedule
 *
 * Reprograma in-place el horario de una Nota de Encargo en estado
 * PENDING o PENDIENTE_PROPIEDAD.
 */
const postHandler = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Id de sesión inválido" },
      { status: 400 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await rescheduleNotaEncargoSession({
      sessionId: id,
      visitDateTime: new Date(parsed.data.visitDateTime),
      actorComercialId: session.comercialId,
      actorUserId: session.userId,
      isAdmin: isCeoOrAdmin(session.role),
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    if (err instanceof NotaEncargoRescheduleError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }

    if (err instanceof NotaEncargoScheduleError) {
      const message = err.message;
      console.error(
        `[captacion/nota-encargo/reschedule] Error programando QStash para sesión ${id}: ${message}`,
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nota reprogramada en base de datos pero falló la programación en QStash. Contacta a soporte.",
          sessionId: id,
        },
        { status: 502 },
      );
    }

    console.error("[captacion/nota-encargo/reschedule] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al reprogramar la nota de encargo" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/captacion/nota-encargo/[id]/reschedule" },
  postHandler,
);
