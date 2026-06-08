/**
 * @deprecated Callback QStash legacy (recordatorio con confirmación del propietario).
 * Responde noop para drenar mensajes ya publicados sin efectos secundarios.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";

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

  console.log(
    `[nota-encargo/recordatorio] deprecated noop — session=${parsed.data.sessionId}`,
  );
  return NextResponse.json({ ok: true, status: "deprecated_noop" });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/nota-encargo/recordatorio" },
  postHandler,
);

export const maxDuration = 60;
