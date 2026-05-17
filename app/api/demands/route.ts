import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized, isCeoOrAdmin } from "@/lib/auth/session";
import { buildDemandSearchConditions } from "@/lib/demands/search";
import type { LeadStatus, Prisma } from "@prisma/client";

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
  const searchConditions = buildDemandSearchConditions(q);

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
    ...(searchConditions.length > 0
      ? { OR: searchConditions }
      : {}),
  };

  const matchingDemandCodes = await prisma.demandCurrent.findMany({
    where,
    select: { codigo: true },
  });
  const allCodes = matchingDemandCodes.map((row) => row.codigo);

  if (allCodes.length === 0) {
    return NextResponse.json({
      ok: true,
      demands: [],
      total: 0,
      page,
      limit,
      stats: await getDemandStats({
        comercialIdFilter,
        searchConditions,
      }),
    });
  }

  const orderedSnapshots = await prisma.demandSnapshot.findMany({
    where: { codigo: { in: allCodes } },
    select: { codigo: true },
    orderBy: [
      { lastSeenAt: "desc" },
      { fechaActualizacion: "desc" },
      { updatedAt: "desc" },
      { codigo: "desc" },
    ],
  });

  const orderedCodes = orderedSnapshots.map((row) => row.codigo);
  const seenCodes = new Set(orderedCodes);
  const missingSnapshotCodes = allCodes.filter((codigo) => !seenCodes.has(codigo));
  const pagedCodes = [...orderedCodes, ...missingSnapshotCodes].slice(skip, skip + limit);

  // Run queries in parallel: paged list + total count + stats grouped by leadStatus
  const [demands, rawStats] = await Promise.all([
    prisma.demandCurrent.findMany({
      where: { codigo: { in: pagedCodes } },
      select: {
        codigo: true,
        nombre: true,
        telefono: true,
        zonas: true,
        tipos: true,
        presupuestoMin: true,
        presupuestoMax: true,
        habitacionesMin: true,
        metrosMin: true,
        metrosMax: true,
        agente: true,
        comercialId: true,
        leadStatus: true,
        fechaActualizacion: true,
        updatedAt: true,
        lastEventAt: true,
      },
    }),
    // Stats always reflect the SAME base filter (comercial restriction + search) but ignoring status
    prisma.demandCurrent.groupBy({
      by: ["leadStatus"],
      where: {
        ...(comercialIdFilter ? { comercialId: comercialIdFilter } : {}),
        ...(searchConditions.length > 0
          ? { OR: searchConditions }
          : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const demandByCode = new Map(demands.map((demand) => [demand.codigo, demand]));
  const orderedDemands = pagedCodes
    .map((codigo) => demandByCode.get(codigo))
    .filter((demand): demand is NonNullable<typeof demand> => Boolean(demand));

  const stats = buildEmptyStats();
  for (const row of rawStats) {
    stats[row.leadStatus] = row._count._all;
  }

  return NextResponse.json({
    ok: true,
    demands: orderedDemands,
    total: allCodes.length,
    page,
    limit,
    stats,
  });
};

async function getDemandStats({
  comercialIdFilter,
  searchConditions,
}: {
  comercialIdFilter: string | null;
  searchConditions: Prisma.DemandCurrentWhereInput[];
}): Promise<Record<LeadStatus, number>> {
  const rawStats = await prisma.demandCurrent.groupBy({
    by: ["leadStatus"],
    where: {
      ...(comercialIdFilter ? { comercialId: comercialIdFilter } : {}),
      ...(searchConditions.length > 0
        ? { OR: searchConditions }
        : {}),
    },
    _count: { _all: true },
  });

  const stats = buildEmptyStats();
  for (const row of rawStats) {
    stats[row.leadStatus] = row._count._all;
  }
  return stats;
}

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
