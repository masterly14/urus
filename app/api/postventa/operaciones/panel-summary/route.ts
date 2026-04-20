import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { isPrivileged } from "@/lib/postventa/panel/access";
import type { PanelSummary } from "@/lib/postventa/panel/types";

const QuerySchema = z.object({
  ids: z.string().min(1),
});

/**
 * GET /api/postventa/operaciones/panel-summary?ids=op1,op2,op3
 * Devuelve los contadores del panel lateral (notas visibles, checklist,
 * adjuntos) para un lote de operaciones, usado por las tarjetas del pipeline.
 *
 * Límite: 100 operaciones por llamada (alineado con MAX_PIPELINE_ITEMS).
 */
const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    ids: url.searchParams.get("ids") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query inválida", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const ids = Array.from(
    new Set(
      parsed.data.ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);

  if (ids.length === 0) {
    return NextResponse.json({ summaries: [] });
  }

  const privileged = isPrivileged(session.role);

  const [notas, checklistItems, adjuntos] = await Promise.all([
    prisma.operacionNota.groupBy({
      by: ["operacionId"],
      where: privileged
        ? { operacionId: { in: ids } }
        : { operacionId: { in: ids }, authorUserId: session.userId },
      _count: { _all: true },
    }),
    prisma.operacionChecklistItem.findMany({
      where: { operacionId: { in: ids } },
      select: { operacionId: true, completado: true },
    }),
    prisma.operacionAdjunto.groupBy({
      by: ["operacionId"],
      where: { operacionId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const summaries: PanelSummary[] = ids.map((id) => {
    const notasCount = notas.find((n) => n.operacionId === id)?._count._all ?? 0;
    const adjuntosCount =
      adjuntos.find((a) => a.operacionId === id)?._count._all ?? 0;
    const items = checklistItems.filter((c) => c.operacionId === id);
    const total = items.length;
    const completados = items.filter((c) => c.completado).length;

    return {
      operacionId: id,
      notasVisibles: notasCount,
      checklistTotal: total,
      checklistCompletados: completados,
      adjuntos: adjuntosCount,
    };
  });

  return NextResponse.json({ summaries });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/postventa/operaciones/panel-summary" },
  getHandler,
);
