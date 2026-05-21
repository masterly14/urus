import { prisma } from "@/lib/prisma";
import type { PricingPropertyInput, PropertyComparabilityProfile, ZoneDemographicsSummary } from "@/lib/pricing/types";

export function resolveDensityBucket(value: number | null): ZoneDemographicsSummary["densityBucket"] {
  if (value == null) return "sin_datos";
  if (value < 2000) return "baja";
  if (value < 5000) return "media";
  if (value < 9000) return "alta";
  return "muy_alta";
}

export async function buildDemographicsSummary(
  input: PricingPropertyInput,
  comparabilityProfile?: PropertyComparabilityProfile,
): Promise<ZoneDemographicsSummary> {
  const zoneCode = comparabilityProfile?.zoneCode ?? null;
  const city = input.ciudad || "Sin ciudad";
  const normalizedZone = input.zona?.trim() || null;

  const row = await prisma.demographicZoneIndex.findFirst({
    where: {
      city,
      OR: [
        zoneCode ? { zoneCode } : undefined,
        normalizedZone ? { zoneName: { equals: normalizedZone, mode: "insensitive" } } : undefined,
      ].filter(Boolean) as Array<Record<string, unknown>>,
    },
    orderBy: [{ year: "desc" }, { updatedAt: "desc" }],
  });

  if (!row) {
    return {
      available: false,
      city,
      districtCode: null,
      districtName: null,
      zoneCode,
      zoneName: normalizedZone,
      population: null,
      surfaceKm2: null,
      densityPerKm2: null,
      densityBucket: "sin_datos",
      year: null,
      source: null,
    };
  }

  return {
    available: true,
    city: row.city,
    districtCode: row.districtCode,
    districtName: row.districtName,
    zoneCode: row.zoneCode,
    zoneName: row.zoneName,
    population: row.population,
    surfaceKm2: row.surfaceKm2,
    densityPerKm2: row.densityPerKm2,
    densityBucket: row.densityBucket ?? resolveDensityBucket(row.densityPerKm2),
    year: row.year,
    source: row.source,
  };
}
