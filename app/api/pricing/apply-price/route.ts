import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { safeUpdateProperty } from "@/lib/inmovilla/rest/safe-update";
import { canAccessPricingProperty } from "@/lib/pricing/access-control";
import type { JsonValue } from "@/lib/event-store/types";

export const runtime = "nodejs";

const RequestSchema = z.object({
  propertyCode: z.string().min(1),
  newPrice: z.number().int().positive(),
  previousPrice: z.number().int().positive(),
  source: z.enum(["pricing-recommendation"]),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { propertyCode, newPrice, previousPrice, source } = parsed.data;

  if (!(await canAccessPricingProperty(session, propertyCode))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "INMOVILLA_API_TOKEN no configurado" },
      { status: 503 },
    );
  }

  const report = await prisma.pricingReport.findUnique({
    where: { propertyCode },
    select: { semaforo: true, gapPorcentaje: true },
  });

  if (!report) {
    return NextResponse.json(
      { error: "No existe informe de pricing para esta propiedad" },
      { status: 404 },
    );
  }

  const client = createInmovillaRestClient({ token });

  try {
    const codOfer = Number(propertyCode);
    const result = await safeUpdateProperty(
      client,
      codOfer > 0 ? { codOfer } : { ref: propertyCode },
      { precioinmo: newPrice },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: "No se pudo actualizar el precio en Inmovilla", removedFields: result.removedFields },
        { status: 502 },
      );
    }

    await appendEvent({
      type: "PRICING_PRECIO_APLICADO",
      aggregateType: "PROPERTY",
      aggregateId: propertyCode,
      payload: {
        previousPrice,
        newPrice,
        source,
        appliedBy: session.nombre ?? session.email ?? "unknown",
        appliedAt: new Date().toISOString(),
        semaforo: report.semaforo,
        gapPorcentaje: report.gapPorcentaje,
      } as unknown as JsonValue,
    });

    console.log(
      `[pricing/apply-price] propertyCode=${propertyCode} precio ${previousPrice} → ${newPrice} por ${session.email ?? "unknown"}`,
    );

    return NextResponse.json({ ok: true, propertyCode, newPrice });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pricing/apply-price] Error: ${message}`);

    const isRateLimit = /429|too many|rate limit|limite.*peticiones/i.test(message);
    if (isRateLimit) {
      return NextResponse.json(
        {
          error: "Inmovilla ha alcanzado el límite de peticiones por minuto. Inténtalo de nuevo en unos minutos.",
          code: "RATE_LIMIT",
          retryAfterSeconds: 120,
        },
        { status: 429 },
      );
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
