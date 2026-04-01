import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dashboard/alerts
 *
 * Query params:
 *   from           — ISO date (default: 30 days ago)
 *   to             — ISO date (default: now)
 *   comercialId    — filter by comercial
 *   severity       — "low" | "medium" | "high"
 *   type           — "drop" | "sla_breach" | "deviation"
 *   resolved       — "true" | "false" (default: false — only unresolved)
 *   limit          — number (default: 50)
 *   offset         — number (default: 0)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = url.searchParams.get("from")
      ? new Date(url.searchParams.get("from")!)
      : defaultFrom;
    const to = url.searchParams.get("to")
      ? new Date(url.searchParams.get("to")!)
      : now;

    const comercialId = url.searchParams.get("comercialId") ?? undefined;
    const severity = url.searchParams.get("severity") ?? undefined;
    const type = url.searchParams.get("type") ?? undefined;
    const resolvedParam = url.searchParams.get("resolved");
    const showResolved = resolvedParam === "true" || resolvedParam === "1";

    const limit = Math.min(
      Math.max(1, Number(url.searchParams.get("limit")) || 50),
      200,
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const where = {
      createdAt: { gte: from, lte: to },
      ...(comercialId ? { comercialId } : {}),
      ...(severity ? { severity } : {}),
      ...(type ? { type } : {}),
      ...(showResolved ? {} : { resolvedAt: null }),
    };

    const [alerts, total] = await Promise.all([
      prisma.dashboardAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.dashboardAlert.count({ where }),
    ]);

    return NextResponse.json({ ok: true, alerts, total });
  } catch (err) {
    console.error(
      "[api/dashboard/alerts] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al obtener alertas" },
      { status: 500 },
    );
  }
}
