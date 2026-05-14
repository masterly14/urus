/**
 * Endpoint dedicado al envío del Parte de Visita.
 *
 * QStash publica un mensaje diferido con `notBefore = visitDateTime` apuntando
 * a esta ruta. Al llegar el instante de la visita, QStash invoca este endpoint
 * y se envía el WhatsApp Flow de forma síncrona — sin pasar por la cola
 * interna ni esperar a un cron poller.
 *
 * Autenticación:
 *   - Firma `Upstash-Signature` (QStash), o
 *   - Header `Authorization: Bearer <CRON_SECRET>` como fallback de rescate.
 *
 * Idempotencia: si la sesión ya no está en `PENDING` (cancelada, ya enviada o
 * en otro estado), responde 200 OK sin reenviar.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { sendParteVisitaForSession } from "@/lib/parte-visita/send";

const BodySchema = z.object({
  sessionId: z.string().min(1),
});

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await sendParteVisitaForSession(parsed.data.sessionId);

  if (!result.ok) {
    const status = result.permanent ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: result.error, permanent: result.permanent },
      { status },
    );
  }

  return NextResponse.json({ ok: true, status: result.status });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/parte-visita/send" },
  postHandler,
);

export const maxDuration = 60;
