/**
 * POST /api/webhoook/statefox — webhook entrante Statefox.
 * Valida el header `apikey` contra STATEFOX_SECRET_KEY y registra el cuerpo recibido.
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const postHandler = async (request: NextRequest): Promise<NextResponse> => {
  const expected = process.env.STATEFOX_SECRET_KEY;
  if (!expected) {
    console.error("[statefox/webhook] STATEFOX_SECRET_KEY no configurado — rechazando request (fail-closed)");
    return NextResponse.json(
      { error: "Configuración incompleta: STATEFOX_SECRET_KEY requerido" },
      { status: 500 },
    );
  }

  const apikey = request.headers.get("apikey") ?? "";
  if (!secretsMatch(apikey, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  let payload: unknown = raw;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      // cuerpo no JSON: se deja como string en logs
    }
  }

  console.log("[statefox/webhook] payload:", payload);

  return NextResponse.json({ ok: true });
};

export const POST = withObservedRoute({ method: "POST", route: "/api/webhoook/statefox" }, postHandler);
