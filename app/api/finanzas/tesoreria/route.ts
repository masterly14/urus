import { NextResponse } from "next/server";
import { z } from "zod";
import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import {
  getTreasuryBalance,
  listTreasuryBalances,
  upsertTreasuryBalance,
} from "@/lib/finance/treasury/repository";

const UpsertTreasurySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  openingBalanceEur: z.number(),
  notes: z.string().max(500).nullable().optional(),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const period = new URL(request.url).searchParams.get("period");

  try {
    if (period) {
      const row = await getTreasuryBalance(period);
      return NextResponse.json({ ok: true, row });
    }

    const rows = await listTreasuryBalances();
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/tesoreria] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar la tesorería" },
      { status: 500 },
    );
  }
};

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const body: unknown = await request.json();
    const parsed = UpsertTreasurySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const row = await upsertTreasuryBalance({
      ...parsed.data,
      updatedByUserId: session.userId,
    });

    return NextResponse.json({ ok: true, row });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/tesoreria] POST failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar la tesorería" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/finanzas/tesoreria" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/finanzas/tesoreria" },
  postHandler,
);
