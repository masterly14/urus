import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized, isCeoOrAdmin } from "@/lib/auth/session";
import type { LeadStatus, Prisma } from "@/app/generated/prisma/client";

const LEAD_STATUS_VALUES = new Set<LeadStatus>([
  "NUEVO",
  "CONTACTADO",
  "EN_SELECCION",
  "VISITA_PENDIENTE",
  "VISITA_CONFIRMADA",
  "VISITA_REALIZADA",
  "EN_NEGOCIACION",
  "EN_FIRMA",
  "CERRADO",
  "PERDIDO",
]);

function parseLeadStatuses(raw: string | null): LeadStatus[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase() as LeadStatus)
    .filter((s) => LEAD_STATUS_VALUES.has(s));
}

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)));
  const skip = (page - 1) * limit;

  // Filters
  const q = url.searchParams.get("q")?.trim() ?? "";
  const statusFilter = parseLeadStatuses(url.searchParams.get("leadStatus"));

  // RBAC: comercial only sees their own demands
  let comercialIdFilter: string | null = null;
  if (!isCeoOrAdmin(session.role)) {
    if (!session.comercialId) {
      return NextResponse.json({ ok: true, demands: [], total: 0, stats: buildEmptyStats() });
    }
    comercialIdFilter = session.comercialId;
  } else {
    // ceo/admin can optionally filter by a specific comercial
    const qComercialId = url.searchParams.get("comercialId");
    if (qComercialId) comercialIdFilter = qComercialId;
  }

  // Build where clause
  const where: Prisma.DemandCurrentWhereInput = {
    ...(comercialIdFilter ? { comercialId: comercialIdFilter } : {}),
    ...(statusFilter.length > 0 ? { leadStatus: { in: statusFilter } } : {}),
    ...(q
      ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { zonas: { contains: q, mode: "insensitive" } },
            { telefono: { contains: q, mode: "insensitive" } },
            { tipos: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Run queries in parallel: paged list + total count + stats grouped by leadStatus
  const [demands, total, rawStats] = await Promise.all([
    prisma.demandCurrent.findMany({
      where,
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        zonas: true,
        tipos: true,
        presupuestoMin: true,
        presupuestoMax: true,
        habitacionesMin: true,
        agente: true,
        comercialId: true,
        leadStatus: true,
        fechaActualizacion: true,
        updatedAt: true,
        lastEventAt: true,
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.demandCurrent.count({ where }),
    // Stats always reflect the SAME base filter (comercial restriction + search) but ignoring status
    prisma.demandCurrent.groupBy({
      by: ["leadStatus"],
      where: {
        ...(comercialIdFilter ? { comercialId: comercialIdFilter } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { zonas: { contains: q, mode: "insensitive" } },
                { telefono: { contains: q, mode: "insensitive" } },
                { tipos: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const stats = buildEmptyStats();
  for (const row of rawStats) {
    stats[row.leadStatus] = row._count._all;
  }

  return NextResponse.json({
    ok: true,
    demands,
    total,
    page,
    limit,
    stats,
  });
};

function buildEmptyStats(): Record<LeadStatus, number> {
  return {
    NUEVO: 0,
    CONTACTADO: 0,
    EN_SELECCION: 0,
    VISITA_PENDIENTE: 0,
    VISITA_CONFIRMADA: 0,
    VISITA_REALIZADA: 0,
    EN_NEGOCIACION: 0,
    EN_FIRMA: 0,
    CERRADO: 0,
    PERDIDO: 0,
  };
}

export const GET = withObservedRoute(
  { method: "GET", route: "/api/demands" },
  getHandler,
);
