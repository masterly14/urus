import { NextResponse } from "next/server";
import { z } from "zod";
import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import {
  createRecurringExpense,
  listRecurringExpenses,
} from "@/lib/finance/recurring/repository";

const CreateRecurringSchema = z.object({
  name: z.string().min(1).max(120),
  vendor: z.string().min(1).max(120),
  amountEur: z.number().positive(),
  dayOfMonth: z.number().int().min(1).max(28),
  category: z.string().min(1).max(80),
  bucket: z.enum(["FACTURA", "SUSCRIPCION", "GASTO_VARIABLE", "AHORRO", "DEUDA"]),
  accountId: z.string().min(1).max(191).nullable().optional(),
  active: z.boolean().optional(),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();
  void request;

  try {
    const rows = await listRecurringExpenses();
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/recurrentes] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los recurrentes" },
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
    const parsed = CreateRecurringSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.accountId) {
      const account = await prisma.bankAccount.findUnique({
        where: { id: parsed.data.accountId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json(
          { ok: false, error: "Cuenta bancaria no encontrada" },
          { status: 404 },
        );
      }
    }

    const created = await createRecurringExpense(parsed.data);
    return NextResponse.json({ ok: true, recurring: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/recurrentes] POST failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo crear el gasto recurrente" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/finanzas/recurrentes" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/finanzas/recurrentes" },
  postHandler,
);
