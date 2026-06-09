/**
 * Callback QStash: revisa N días después de la visita si la Nota de Encargo
 * sigue sin propiedad vinculada y, si es el caso, emite el evento
 * `NOTA_ENCARGO_SIN_PROPIEDAD_DEADLINE`.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { runNotaEncargoMatchingCheckForSession } from "@/lib/nota-encargo/send";

const BodySchema = z.object({
  sessionId: z.string().min(1),
  scheduleGeneration: z.number().int().nonnegative().optional(),
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

  const result = await runNotaEncargoMatchingCheckForSession(parsed.data.sessionId, {
    scheduleGeneration: parsed.data.scheduleGeneration,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, permanent: result.permanent },
      { status: result.permanent ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/nota-encargo/matching-check" },
  postHandler,
);

export const maxDuration = 60;
