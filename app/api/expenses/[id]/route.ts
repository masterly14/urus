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
  costTypeFromBucket,
  defaultCostType,
  defaultExpenseBucket,
} from "@/lib/finance/category-cost-type";

const PatchExpenseSchema = z
  .object({
    amount: z.number().positive().optional(),
    category: z.string().min(1).max(80).optional(),
    bucket: z.enum(["FACTURA", "SUSCRIPCION", "GASTO_VARIABLE", "AHORRO", "DEUDA"]).optional(),
    costType: z.enum(["FIJO", "VARIABLE"]).optional(),
    accountId: z.string().min(1).max(191).nullable().optional(),
    expenseDate: z.string().datetime().optional(),
    description: z.string().min(1).max(500).optional(),
    vendor: z.string().max(200).nullable().optional(),
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
    const parsed = PatchExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = { ...parsed.data };

    if (data.accountId) {
      const account = await prisma.bankAccount.findUnique({
        where: { id: data.accountId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json(
          { ok: false, error: "Cuenta bancaria no encontrada" },
          { status: 404 },
        );
      }
    }

    if (data.bucket && !data.costType) {
      data.costType = costTypeFromBucket(data.bucket);
    } else if (data.category && !data.bucket) {
      data.bucket = defaultExpenseBucket(data.category);
      if (!data.costType) {
        data.costType = defaultCostType(data.category);
      }
    } else if (data.category && data.bucket && !data.costType) {
      data.costType = costTypeFromBucket(data.bucket);
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(data.amount != null ? { amount: data.amount } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(data.bucket ? { bucket: data.bucket } : {}),
        ...(data.costType ? { costType: data.costType } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "accountId")
          ? { accountId: data.accountId ?? null }
          : {}),
        ...(data.expenseDate ? { expenseDate: new Date(data.expenseDate) } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "vendor")
          ? { vendor: data.vendor ?? null }
          : {}),
      },
      include: {
        account: true,
        attachments: true,
      },
    });

    return NextResponse.json({ ok: true, expense: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to update not found")) {
      return NextResponse.json(
        { ok: false, error: "Gasto no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/expenses/[id]] PATCH failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar el gasto" },
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
    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Gasto no encontrado" },
        { status: 404 },
      );
    }
    console.error("[api/expenses/[id]] DELETE failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar el gasto" },
      { status: 500 },
    );
  }
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/expenses/[id]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/expenses/[id]" },
  deleteHandler,
);
