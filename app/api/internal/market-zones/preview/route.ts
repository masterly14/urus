import { NextResponse } from "next/server";
import { getSessionFromRequest, isCeoOrAdmin, forbidden, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";

export const runtime = "nodejs";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const url = new URL(request.url);
  const catalogVersion = url.searchParams.get("catalogVersion")?.trim() || "v1.1";
  const keyLocaParam = url.searchParams.get("keyLoca")?.trim();
  const keyLoca = keyLocaParam ? Number(keyLocaParam) : 224499;

  const profiles = await prisma.marketZoneProfile.findMany({
    where: {
      catalogVersion,
      keyLoca: Number.isFinite(keyLoca) ? keyLoca : 224499,
    },
    select: {
      suggestedZoneCode: true,
      keyZona: true,
      zoneNameCanonical: true,
      validationPriority: true,
      coverageStatus: true,
      pricingProfileStatus: true,
      isActive: true,
      redirectToZoneCode: true,
      priorityRank: true,
      inventoryCountActive: true,
      inventoryCountHistorical: true,
    },
    orderBy: { priorityRank: "asc" },
  });

  const zoneCodes = profiles.map((profile) => profile.suggestedZoneCode);

  const relations = await prisma.marketZoneRelation.findMany({
    where: {
      catalogVersion,
      OR: [
        { fromZoneCode: { in: zoneCodes } },
        { toZoneCode: { in: zoneCodes } },
      ],
    },
    select: {
      fromZoneCode: true,
      toZoneCode: true,
      relationType: true,
    },
  });

  const countsBy = <T extends string>(values: T[]): Record<string, number> =>
    values.reduce<Record<string, number>>((acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});

  const activeCodes = new Set(profiles.filter((profile) => profile.isActive).map((profile) => profile.suggestedZoneCode));
  const coverageCounts = countsBy(profiles.map((profile) => profile.coverageStatus));
  const pricingCounts = countsBy(profiles.map((profile) => profile.pricingProfileStatus));
  const priorityCounts = countsBy(profiles.map((profile) => profile.validationPriority));

  const relationTypeByPair = new Map<string, Set<string>>();
  for (const relation of relations) {
    const key = `${relation.fromZoneCode}::${relation.toZoneCode}`;
    if (!relationTypeByPair.has(key)) relationTypeByPair.set(key, new Set());
    relationTypeByPair.get(key)!.add(relation.relationType);
  }

  const relationConflicts = [...relationTypeByPair.entries()]
    .filter(([, relationTypes]) => relationTypes.has("comparable") && relationTypes.has("not_comparable"))
    .map(([pair]) => {
      const [fromZoneCode, toZoneCode] = pair.split("::");
      return { fromZoneCode, toZoneCode };
    });

  const invalidRedirects = profiles
    .filter((profile) => profile.redirectToZoneCode && !activeCodes.has(profile.redirectToZoneCode))
    .map((profile) => ({
      zoneCode: profile.suggestedZoneCode,
      redirectToZoneCode: profile.redirectToZoneCode,
    }));

  const sampleByPriority = {
    P1_active_inventory: profiles
      .filter((profile) => profile.validationPriority === "P1_active_inventory")
      .slice(0, 10),
    P2_historical_inventory: profiles
      .filter((profile) => profile.validationPriority === "P2_historical_inventory")
      .slice(0, 10),
    P3_no_stock: profiles
      .filter((profile) => profile.validationPriority === "P3_no_stock")
      .slice(0, 10),
  };

  return NextResponse.json({
    ok: true,
    catalogVersion,
    keyLoca: Number.isFinite(keyLoca) ? keyLoca : 224499,
    totals: {
      rows: profiles.length,
      active: profiles.filter((profile) => profile.isActive).length,
      relations: relations.length,
      relationConflicts: relationConflicts.length,
      invalidRedirects: invalidRedirects.length,
    },
    counts: {
      coverageStatus: coverageCounts,
      pricingProfileStatus: pricingCounts,
      validationPriority: priorityCounts,
    },
    conflicts: {
      relationConflicts,
      invalidRedirects,
    },
    sample: sampleByPriority,
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/internal/market-zones/preview" },
  getHandler,
);
