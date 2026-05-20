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
  deleteIncomeEntry,
  updateIncomeEntry,
} from "@/lib/finance/incomes/repository";

const PatchIncomeSchema = z
  .object({
    period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    occurredAt: z.string().datetime().optional(),
    amount: z.number().positive().optional(),
    currency: z.string().min(3).max(3).optional(),
    source: z.string().min(1).max(80).optional(),
    description: z.string().min(1).max(500).optional(),
    accountId: z.string().min(1).max(191).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Debe incluir al menos un campo a actualizar",
  });

const patchHandler = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { id } = await context.params;

  try {
    const body: unknown = await request.json();
    const parsed = PatchIncomeSchema.safeParse(body);
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

    const updated = await updateIncomeEntry(id, {
      ...parsed.data,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
    });

    return NextResponse.json({ ok: true, entry: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to update not found")) {
      return NextResponse.json(
        { ok: false, error: "Ingreso no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/ingresos/[id]] PATCH failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar el ingreso" },
      { status: 500 },
    );
  }
};

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
    await deleteIncomeEntry(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Ingreso no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/ingresos/[id]] DELETE failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar el ingreso" },
      { status: 500 },
    );
  }
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/finanzas/ingresos/[id]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/finanzas/ingresos/[id]" },
  deleteHandler,
);
