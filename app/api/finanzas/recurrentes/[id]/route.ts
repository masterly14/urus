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
  deleteRecurringExpense,
  updateRecurringExpense,
} from "@/lib/finance/recurring/repository";

const PatchRecurringSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    vendor: z.string().min(1).max(120).optional(),
    amountEur: z.number().positive().optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    category: z.string().min(1).max(80).optional(),
    bucket: z.enum(["FACTURA", "SUSCRIPCION", "GASTO_VARIABLE", "AHORRO", "DEUDA"]).optional(),
    accountId: z.string().min(1).max(191).nullable().optional(),
    active: z.boolean().optional(),
    lastGeneratedPeriod: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
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
    const parsed = PatchRecurringSchema.safeParse(body);
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

    const updated = await updateRecurringExpense(id, parsed.data);
    return NextResponse.json({ ok: true, recurring: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to update not found")) {
      return NextResponse.json(
        { ok: false, error: "Recurrente no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/recurrentes/[id]] PATCH failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar el recurrente" },
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
    await deleteRecurringExpense(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Recurrente no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/recurrentes/[id]] DELETE failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar el recurrente" },
      { status: 500 },
    );
  }
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/finanzas/recurrentes/[id]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/finanzas/recurrentes/[id]" },
  deleteHandler,
);
