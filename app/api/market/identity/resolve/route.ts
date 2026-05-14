/**
 * POST /api/market/identity/resolve
 *
 * Resuelve un candidato MARKET_PROPERTY_REVIEW_REQUIRED.
 *
 * Body:
 *   {
 *     eventId: string,
 *     action: "merge" | "split" | "ignore",
 *     targetListingId?: string  // requerido si action === "merge"; default = primer candidato del payload
 *   }
 *
 * Efectos:
 *   - merge:  asigna `propertyId` al listing origen reusando o creando una
 *             MarketProperty; emite `MARKET_PROPERTY_MERGED` para auditoria.
 *   - split:  emite `MARKET_PROPERTY_SPLIT` para auditoria, no toca listings.
 *   - ignore: solo marca el evento como resuelto, sin auditoria adicional.
 *
 * Marca el evento original con `resolvedAt`, `resolvedBy`, `resolutionAction`.
 *
 * Permisos: admin/CEO.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  forbidden,
  getSession,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { resolveCandidate } from "@/lib/market/identity-review";

const bodySchema = z.object({
  eventId: z.string().min(1),
  action: z.enum(["merge", "split", "ignore"]),
  targetListingId: z.string().min(1).optional(),
});

const postHandler = async (request: Request) => {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Body no es JSON" } },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_PAYLOAD", message: parsed.error.message },
      },
      { status: 400 },
    );
  }

  if (parsed.data.action === "merge" && !parsed.data.targetListingId) {
    // Aceptamos sin targetListingId; el servicio caera al primer candidato
    // del payload del evento. Lo dejamos asi documentado para que el cliente
    // pueda enviar solo `action: merge` cuando quiere el sugerido.
  }

  try {
    const result = await resolveCandidate({
      eventId: parsed.data.eventId,
      action: parsed.data.action,
      targetListingId: parsed.data.targetListingId,
      resolvedBy: session.userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: "RESOLVE_FAILED", message } },
      { status: 400 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/identity/resolve" },
  postHandler,
);

export const dynamic = "force-dynamic";
