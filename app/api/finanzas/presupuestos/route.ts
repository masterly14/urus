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
  FINANCE_BUDGET_BUCKETS,
  bulkUpsertMonthlyBudgets,
  listMonthlyBudgets,
} from "@/lib/finance/budgets/repository";

const BudgetBucketEnum = z.enum([
  "INGRESOS",
  "FACTURA",
  "SUSCRIPCION",
  "GASTO_VARIABLE",
  "AHORRO",
  "DEUDA",
]);

const UpsertBudgetsSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z
    .array(
      z.object({
        bucket: BudgetBucketEnum,
        budgetEur: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(FINANCE_BUDGET_BUCKETS.length),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const period =
    new URL(request.url).searchParams.get("period") ??
    new Date().toISOString().slice(0, 7);

  try {
    const rows = await listMonthlyBudgets(period);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/presupuestos] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los presupuestos" },
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
    const parsed = UpsertBudgetsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const rows = await bulkUpsertMonthlyBudgets(parsed.data.period, parsed.data.rows);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/presupuestos] POST failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron guardar los presupuestos" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/finanzas/presupuestos" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/finanzas/presupuestos" },
  postHandler,
);
