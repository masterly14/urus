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
  createBankAccount,
  listBankAccounts,
} from "@/lib/finance/accounts/repository";

const CreateBankAccountSchema = z.object({
  name: z.string().min(1).max(80),
  bankName: z.string().max(120).nullable().optional(),
  ownerScope: z.string().min(2).max(40).optional(),
  accountType: z.string().min(2).max(40).optional(),
  isActive: z.boolean().optional(),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const includeInactive =
    new URL(request.url).searchParams.get("includeInactive") !== "0";

  try {
    const rows = await listBankAccounts(includeInactive);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/cuentas] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar las cuentas bancarias" },
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
    const parsed = CreateBankAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const created = await createBankAccount(parsed.data);
    return NextResponse.json({ ok: true, account: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/finanzas/cuentas] POST failed:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudo crear la cuenta bancaria" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/finanzas/cuentas" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/finanzas/cuentas" },
  postHandler,
);
