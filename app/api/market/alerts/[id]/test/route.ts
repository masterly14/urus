/**
 * POST /api/market/alerts/:id/test
 *
 * Evalua la alerta con una ventana fija de 7 dias y devuelve el numero de
 * matches y una muestra. NO entrega nada por canales.
 *
 * Uso: probar filtros sin esperar al cron ni mandar WhatsApp.
 */

import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { testAlert } from "@/lib/market/alerts";

const postHandler = async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await context.params;
  const result = await testAlert(id, session.userId);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Alerta no encontrada" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, ...result });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/market/alerts/[id]/test" },
  postHandler,
);

export const dynamic = "force-dynamic";
