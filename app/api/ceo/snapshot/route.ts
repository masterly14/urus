import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
  checkSnapshotStatus,
  getCeoSnapshotByPeriod,
  upsertCeoSnapshot,
} from "@/lib/dashboard/ceo/snapshot-manager";
import { withObservedRoute } from "@/lib/observability";


// ---------------------------------------------------------------------------
// GET /api/ceo/snapshot
//   Sin query params → devuelve el status de mes actual y anterior
//   ?period=2026-04   → devuelve los datos completos de ese periodo
// ---------------------------------------------------------------------------

const getHandler = async (request: Request) => {
  const session = getSession(request);
  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");

  try {
    if (period) {
      const snapshot = await getCeoSnapshotByPeriod(period);
      return NextResponse.json({ ok: true, snapshot: snapshot ?? null });
    }

    const status = await checkSnapshotStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/snapshot GET] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const GET = withObservedRoute({ method: "GET", route: "/api/ceo/snapshot" }, getHandler);

// ---------------------------------------------------------------------------
// POST /api/ceo/snapshot
//   Body: { period, ebitdaEur, operatingCostEur, cashAvailableEur,
//           fixedCostsEur, variableCostsEur, reinvestmentCapacity }
// ---------------------------------------------------------------------------

const SnapshotUpsertSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato YYYY-MM"),
  ebitdaEur: z.number(),
  operatingCostEur: z.number(),
  cashAvailableEur: z.number(),
  fixedCostsEur: z.number(),
  variableCostsEur: z.number(),
  reinvestmentCapacity: z.number(),
});

const postHandler = async (request: Request) => {
  const session = getSession(request);
  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = SnapshotUpsertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const snapshot = await upsertCeoSnapshot(parsed.data);
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/snapshot POST] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/ceo/snapshot" }, postHandler);
