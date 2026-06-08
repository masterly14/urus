/**
 * Callback QStash: envía el WhatsApp Flow de la Nota de Encargo al comercial
 * en el instante de la visita (programado al crear la sesión).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { sendNotaEncargoFormularioForSession } from "@/lib/nota-encargo/send";

const BodySchema = z.object({ sessionId: z.string().min(1) });

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

  const result = await sendNotaEncargoFormularioForSession(parsed.data.sessionId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, permanent: result.permanent },
      { status: result.permanent ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/nota-encargo/formulario" },
  postHandler,
);

export const maxDuration = 60;
