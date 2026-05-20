import { NextResponse } from "next/server";
import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { deleteTreasuryBalance } from "@/lib/finance/treasury/repository";

const deleteHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();
  void request;

  const { id } = await context.params;

  try {
    await deleteTreasuryBalance(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Registro de tesorería no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/tesoreria/[id]] DELETE failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar el registro de tesorería" },
      { status: 500 },
    );
  }
};

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/finanzas/tesoreria/[id]" },
  deleteHandler,
);
