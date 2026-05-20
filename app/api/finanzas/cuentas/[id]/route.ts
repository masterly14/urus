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
  deleteBankAccount,
  updateBankAccount,
} from "@/lib/finance/accounts/repository";

const PatchBankAccountSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    bankName: z.string().max(120).nullable().optional(),
    ownerScope: z.string().min(2).max(40).optional(),
    accountType: z.string().min(2).max(40).optional(),
    isActive: z.boolean().optional(),
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
    const parsed = PatchBankAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await updateBankAccount(id, parsed.data);
    return NextResponse.json({ ok: true, account: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to update not found")) {
      return NextResponse.json(
        { ok: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/cuentas/[id]] PATCH failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar la cuenta bancaria" },
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
    await deleteBankAccount(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }
    console.error("[api/finanzas/cuentas/[id]] DELETE failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar la cuenta bancaria" },
      { status: 500 },
    );
  }
};

export const PATCH = withObservedRoute(
  { method: "PATCH", route: "/api/finanzas/cuentas/[id]" },
  patchHandler,
);

export const DELETE = withObservedRoute(
  { method: "DELETE", route: "/api/finanzas/cuentas/[id]" },
  deleteHandler,
);
