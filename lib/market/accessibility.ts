import { prisma } from "@/lib/prisma";
import type {
  PricingPropertyInput,
  PropertyComparabilityProfile,
  ZonePoiSummaryItem,
  ZoneStudySummary,
  ZoneTravelModeSummary,
} from "@/lib/pricing/types";

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((acc, v) => acc + v, 0) / values.length) * 10) / 10;
}

function toPoiItem(item: {
  name: string;
  rating: number | null;
  lat: number;
  lng: number;
  address: string | null;
}): ZonePoiSummaryItem {
  return {
    name: item.name,
    rating: item.rating,
    lat: item.lat,
    lng: item.lng,
    address: item.address,
  };
}

function computeAccessibilityScore(byMode: ZoneTravelModeSummary[]): number | null {
  const driving = byMode.find((m) => m.mode === "driving")?.minutesP50 ?? null;
  const transit = byMode.find((m) => m.mode === "transit")?.minutesP50 ?? null;
  const walking = byMode.find((m) => m.mode === "walking")?.minutesP50 ?? null;
  const candidates = [driving, transit, walking].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  if (candidates.length === 0) return null;

  const weightedMinutes =
    (driving ?? 0) * 0.5 +
    (transit ?? 0) * 0.35 +
    (walking ?? 0) * 0.15;
  const usedWeight =
    (driving ? 0.5 : 0) +
    (transit ? 0.35 : 0) +
    (walking ? 0.15 : 0);
  const normalized = usedWeight > 0 ? weightedMinutes / usedWeight : avg(candidates);
  if (normalized == null) return null;

  // 100 = muy accesible (tiempo bajo), 0 = poco accesible (tiempo alto).
  const score = Math.max(0, Math.min(100, 100 - normalized * 2));
  return Math.round(score);
}

export async function buildZoneStudySummary(
  input: PricingPropertyInput,
  comparabilityProfile?: PropertyComparabilityProfile,
): Promise<Omit<ZoneStudySummary, "demographicsSummary">> {
  const city = input.ciudad || "Sin ciudad";
  const zoneCode = comparabilityProfile?.zoneCode ?? null;

  const [transportPois, schoolPois, travelRows] = await Promise.all([
    prisma.zonePoiIndex.findMany({
      where: { city, zoneCode, poiType: "transport" },
      orderBy: [{ rating: "desc" }, { name: "asc" }],
      take: 8,
    }),
    prisma.zonePoiIndex.findMany({
      where: { city, zoneCode, poiType: "school" },
      orderBy: [{ rating: "desc" }, { name: "asc" }],
      take: 8,
    }),
    prisma.zoneTravelTimeIndex.findMany({
      where: { city, originZoneCode: zoneCode ?? "__unknown__" },
      orderBy: [{ mode: "asc" }, { destinationType: "asc" }, { destinationName: "asc" }],
      take: 120,
    }),
  ]);

  const byMode: ZoneTravelModeSummary[] = (["driving", "transit", "walking"] as const).map((mode) => {
    const subset = travelRows.filter((row) => row.mode === mode);
    return {
      mode,
      destinations: subset.length,
      minutesP50: avg(subset.map((row) => row.minutesP50)),
      minutesP90: avg(subset.map((row) => row.minutesP90)),
      distanceKmP50: avg(
        subset
          .map((row) => row.distanceKmP50)
          .filter((value): value is number => typeof value === "number"),
      ),
    };
  });

  const avgSchoolRating = avg(
    schoolPois
      .map((poi) => poi.rating)
      .filter((value): value is number => typeof value === "number"),
  );

  return {
    transportSummary: {
      totalStops: transportPois.length,
      topStops: transportPois.slice(0, 5).map(toPoiItem),
    },
    schoolsSummary: {
      totalSchools: schoolPois.length,
      topSchools: schoolPois.slice(0, 5).map(toPoiItem),
      avgSchoolRating,
    },
    travelTimeSummary: {
      byMode,
      accessibilityScore: computeAccessibilityScore(byMode),
    },
  };
}
