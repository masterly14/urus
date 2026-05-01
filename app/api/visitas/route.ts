import { NextResponse } from "next/server";
import { VisitWorkItemStatus } from "@prisma/client";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { listVisitInterestPackages } from "@/lib/visitas/interest-package";
import {
  listVisitWorkItems,
  serializeLegacyVisitInterest,
  serializeVisitWorkItem,
} from "@/lib/visitas/work-items";

function parseStatus(value: string | null): VisitWorkItemStatus | undefined {
  if (!value) return undefined;
  return Object.values(VisitWorkItemStatus).includes(value as VisitWorkItemStatus)
    ? (value as VisitWorkItemStatus)
    : undefined;
}

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const visitId = url.searchParams.get("visitId")?.trim() || undefined;
  const demandId = url.searchParams.get("demandId")?.trim() || undefined;
  const selectionId = url.searchParams.get("selectionId")?.trim() || undefined;
  const propertyId =
    url.searchParams.get("propertyId")?.trim() ||
    url.searchParams.get("propertyCode")?.trim() ||
    undefined;
  const status = parseStatus(url.searchParams.get("status"));
  const requestedComercialId = url.searchParams.get("comercialId");
  const comercialId = isCeoOrAdmin(session.role)
    ? requestedComercialId
    : session.comercialId;
  if (!isCeoOrAdmin(session.role) && !comercialId) {
    return NextResponse.json({ ok: true, workItems: [], legacyFallback: false });
  }

  const workItems = await listVisitWorkItems({
    visitId,
    comercialId,
    status,
    demandId,
    selectionId,
    propertyId,
    limit,
  });

  if (workItems.length > 0 || visitId) {
    const scheduledSessionIds = workItems
      .map((item) => item.scheduledSessionId)
      .filter((id): id is string => Boolean(id));
    const scheduledSessions = scheduledSessionIds.length > 0
      ? await prisma.visitSchedulingSession.findMany({
          where: { id: { in: scheduledSessionIds } },
          select: {
            id: true,
            confirmedSlotStart: true,
            confirmedSlotEnd: true,
          },
        })
      : [];
    const scheduledSessionById = new Map(
      scheduledSessions.map((session) => [session.id, session]),
    );

    return NextResponse.json({
      ok: true,
      workItems: workItems.map((item) =>
        serializeVisitWorkItem(
          item,
          item.scheduledSessionId ? scheduledSessionById.get(item.scheduledSessionId) : null,
        ),
      ),
      legacyFallback: false,
    });
  }

  const packages = await listVisitInterestPackages({
    comercialId,
    limit,
  });
  const fallbackItems = packages.flatMap((pkg) =>
    pkg.properties
      .filter(() => !demandId || pkg.demand.demandId === demandId)
      .filter(() => !selectionId || pkg.selectionId === selectionId)
      .filter((property) => !propertyId || property.propertyId === propertyId)
      .map((property) =>
        serializeLegacyVisitInterest({
          demand: pkg.demand,
          selectionId: pkg.selectionId,
          property,
        }),
      ),
  );

  return NextResponse.json({
    ok: true,
    workItems: fallbackItems,
    legacyFallback: fallbackItems.length > 0,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/visitas" },
  getHandler,
);
