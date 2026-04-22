import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

const PIPELINE_STAGES = [
  "EN_CURSO",
  "OFERTA_FIRME",
  "RESERVA",
  "ARRAS",
  "PENDIENTE_FIRMA",
] as const;

const LEAD_STAGES = [
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
] as const;

const PENDING_SIGNATURE_STATUSES = ["SENT", "OPENED"] as const;

async function fetchPlatformSummary() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    activeOperations,
    closedThisMonth,
    cancelledThisMonth,
    staleOperations,
    operationStates,
    leadStates,
    openAlerts,
    highAlerts,
    pendingSignatures,
    expiredSignatures,
    escalatedSignatures,
    overdueCollaboratorMilestones,
    visitsNextWeek,
    postventaStates,
  ] = await Promise.all([
    prisma.operacion.count({
      where: {
        estado: { notIn: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO", "CANCELADA"] },
      },
    }),
    prisma.operacion.count({
      where: {
        estado: { in: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO"] },
        closedAt: { gte: monthStart },
      },
    }),
    prisma.operacion.count({
      where: {
        estado: "CANCELADA",
        updatedAt: { gte: monthStart },
      },
    }),
    prisma.operacion.count({
      where: {
        estado: { notIn: ["CERRADA_VENTA", "CERRADA_ALQUILER", "CERRADA_TRASPASO", "CANCELADA"] },
        updatedAt: { lt: staleCutoff },
      },
    }),
    prisma.operacion.groupBy({
      by: ["estado"],
      _count: { _all: true },
    }),
    prisma.demandCurrent.groupBy({
      by: ["leadStatus"],
      _count: { _all: true },
    }),
    prisma.dashboardAlert.count({ where: { resolvedAt: null } }),
    prisma.dashboardAlert.count({
      where: { resolvedAt: null, severity: { in: ["high", "alta"] } },
    }),
    prisma.signatureRequest.count({
      where: { status: { in: [...PENDING_SIGNATURE_STATUSES] } },
    }),
    prisma.signatureRequest.count({
      where: { status: "EXPIRED" },
    }),
    prisma.signatureRequest.count({
      where: {
        escalatedAt: { not: null },
        status: { in: [...PENDING_SIGNATURE_STATUSES] },
      },
    }),
    prisma.colaboradorHito.count({
      where: {
        slaVenceAt: { lt: now },
        estado: { in: ["PENDIENTE", "EN_PROGRESO", "BLOQUEADO"] },
      },
    }),
    prisma.commercialVisitFact.count({
      where: {
        scheduledAt: { gte: now, lte: nextWeek },
      },
    }),
    prisma.postventaSurveySession.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const pipeline: Record<string, number> = Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage, 0]),
  );
  for (const row of operationStates) {
    if (row.estado in pipeline) {
      pipeline[row.estado] = row._count._all;
    }
  }

  const leads: Record<string, number> = Object.fromEntries(
    LEAD_STAGES.map((stage) => [stage, 0]),
  );
  for (const row of leadStates) {
    if (row.leadStatus in leads) {
      leads[row.leadStatus] = row._count._all;
    }
  }

  const postventa: Record<string, number> = {
    PENDING: 0,
    SENT: 0,
    COMPLETED: 0,
    EXPIRED: 0,
  };
  for (const row of postventaStates) {
    if (row.status in postventa) {
      postventa[row.status] = row._count._all;
    }
  }

  return {
    ok: true as const,
    kpis: {
      activeOperations,
      closedThisMonth,
      staleOperations,
      cancelledThisMonth,
      openAlerts,
      highAlerts,
      pendingSignatures,
      expiredSignatures,
      escalatedSignatures,
      overdueCollaboratorMilestones,
      visitsNextWeek,
    },
    pipeline,
    leads,
    postventa,
  };
}

export const getCachedPlatformSummary = unstable_cache(
  fetchPlatformSummary,
  ["platform-summary"],
  { revalidate: 60, tags: ["platform-summary"] },
);
