import { NextResponse } from "next/server";
import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getExpenses } from "@/lib/dashboard/expenses/queries";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const period = url.searchParams.get("period");
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const costType = url.searchParams.get("costType");
  const bucket = url.searchParams.get("bucket");
  const accountId = url.searchParams.get("accountId");

  try {
    const rows = await getExpenses({ period, from, to, category, status, costType, bucket, accountId });
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/expenses] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los gastos" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/expenses" },
  getHandler,
);
