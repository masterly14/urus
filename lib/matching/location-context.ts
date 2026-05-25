import { prisma } from "@/lib/prisma";
import { extractConcreteLocationTokens, normalizeLocation } from "./location";
import type { DemandForMatching, LocationMatchContext } from "./types";

interface ZoneProfileLite {
  suggestedZoneCode: string;
  keyLoca: number;
  zoneNameCanonical: string;
  zonaInmovilla: string;
  comparableWithZoneCodes: string[];
  notComparableWithZoneCodes: string[];
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizedZoneNames(profile: Pick<ZoneProfileLite, "zoneNameCanonical" | "zonaInmovilla">): string[] {
  return uniq([
    normalizeLocation(profile.zoneNameCanonical),
    normalizeLocation(profile.zonaInmovilla),
  ]);
}

export async function buildDemandLocationContext(
  demand: Pick<DemandForMatching, "zonas">,
): Promise<LocationMatchContext> {
  const tokens = extractConcreteLocationTokens(demand.zonas);
  if (tokens.length === 0) return {};

  const aliases = await prisma.marketZoneAlias.findMany({
    where: {
      isActive: true,
      aliasNormalized: { in: tokens },
    },
    select: { zoneCode: true },
  });

  const aliasZoneCodes = aliases.map((alias) => alias.zoneCode);
  const profiles = await prisma.marketZoneProfile.findMany({
    where: {
      isActive: true,
      OR: [
        ...(aliasZoneCodes.length > 0
          ? [{ suggestedZoneCode: { in: aliasZoneCodes } }]
          : []),
        ...tokens.flatMap((token) => [
          { zoneNameCanonical: { contains: token, mode: "insensitive" as const } },
          { zonaInmovilla: { contains: token, mode: "insensitive" as const } },
        ]),
      ],
    },
    select: {
      suggestedZoneCode: true,
      keyLoca: true,
      zoneNameCanonical: true,
      zonaInmovilla: true,
      comparableWithZoneCodes: true,
      notComparableWithZoneCodes: true,
    },
  });

  if (profiles.length === 0) return {};

  const exactZoneCodes = uniq(profiles.map((profile) => profile.suggestedZoneCode));
  const relationRows = await prisma.marketZoneRelation.findMany({
    where: {
      fromZoneCode: { in: exactZoneCodes },
      relationType: { in: ["comparable", "not_comparable"] },
    },
    select: {
      fromZoneCode: true,
      toZoneCode: true,
      relationType: true,
    },
  });

  const comparableCodes = new Set<string>();
  const excludedCodes = new Set<string>();
  for (const profile of profiles) {
    for (const code of profile.comparableWithZoneCodes) comparableCodes.add(code);
    for (const code of profile.notComparableWithZoneCodes) excludedCodes.add(code);
  }
  for (const relation of relationRows) {
    if (relation.relationType === "comparable") comparableCodes.add(relation.toZoneCode);
    if (relation.relationType === "not_comparable") excludedCodes.add(relation.toZoneCode);
  }
  for (const code of exactZoneCodes) {
    comparableCodes.delete(code);
    excludedCodes.delete(code);
  }
  for (const code of excludedCodes) comparableCodes.delete(code);

  const relatedProfiles = await prisma.marketZoneProfile.findMany({
    where: {
      suggestedZoneCode: { in: uniq([...exactZoneCodes, ...comparableCodes, ...excludedCodes]) },
    },
    select: {
      suggestedZoneCode: true,
      zoneNameCanonical: true,
      zonaInmovilla: true,
    },
  });

  const profileByCode = new Map(relatedProfiles.map((profile) => [profile.suggestedZoneCode, profile]));
  const exactZones = profiles.flatMap(normalizedZoneNames);
  const nearbyZones = [...comparableCodes].flatMap((code) => {
    const profile = profileByCode.get(code);
    return profile ? normalizedZoneNames(profile) : [];
  });
  const excludedZones = [...excludedCodes].flatMap((code) => {
    const profile = profileByCode.get(code);
    return profile ? normalizedZoneNames(profile) : [];
  });

  const keyLocas = uniq(profiles.map((profile) => String(profile.keyLoca)));
  let demandCity: string | undefined;
  if (keyLocas.length === 1) {
    const city = await prisma.inmovillaEnumCiudad.findUnique({
      where: { key_loca: Number(keyLocas[0]) },
      select: { ciudad: true },
    });
    demandCity = city?.ciudad;
  }

  return {
    ...(demandCity ? { demandCity } : {}),
    exactZones: uniq(exactZones),
    nearbyZones: uniq(nearbyZones),
    excludedZones: uniq(excludedZones),
  };
}

