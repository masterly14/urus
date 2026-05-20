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
  createIncomeEntry,
  listIncomeEntries,
} from "@/lib/finance/incomes/repository";

const CreateIncomeSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  occurredAt: z.string().datetime(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).optional(),
  source: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  accountId: z.string().min(1).max(191).nullable().optional(),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const period = new URL(request.url).searchParams.get("period") ?? undefined;

  try {
    const rows = await listIncomeEntries(period);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/ingresos] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los ingresos" },
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
    const parsed = CreateIncomeSchema.safeParse(body);
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

    const created = await createIncomeEntry({
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
      createdByUserId: session.userId,
    });

    return NextResponse.json({ ok: true, entry: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/ingresos] POST failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo crear el ingreso" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/finanzas/ingresos" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/finanzas/ingresos" },
  postHandler,
);
