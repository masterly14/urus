import { prisma } from "@/lib/prisma";
import type {
  ComparabilityConfidenceLevel,
  ComparabilityRelationRule,
  ComparabilityResolutionMethod,
  PricingPropertyInput,
  PropertyComparabilityProfile,
} from "@/lib/pricing/types";

const DEFAULT_KEY_LOCA = 224499;
const DEFAULT_CATALOG_VERSION = "v1.1";
const MAX_REDIRECT_HOPS = 5;

type ZoneProfile = Awaited<ReturnType<typeof prisma.marketZoneProfile.findUnique>>;
type ZoneProfileFound = NonNullable<ZoneProfile>;
type ZoneRelation = Awaited<ReturnType<typeof prisma.marketZoneRelation.findMany>>[number];

function normalizeAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ");
}

function fallbackUnknown(
  input: PricingPropertyInput,
  flags: string[],
  resolutionMethod: ComparabilityResolutionMethod = "unknown",
): PropertyComparabilityProfile {
  return {
    propertyCode: input.propertyCode,
    catalogVersion: DEFAULT_CATALOG_VERSION,
    resolutionMethod,
    confidenceLevel: "low",
    confidenceFlags: [...new Set(["UNKNOWN_ZONE", ...flags])],
    zoneRaw: input.zonaRaw || input.zona,
    zoneCode: null,
    zoneNameCanonical: null,
    keyLoca: input.keyLoca,
    keyZona: input.keyZona,
    macroArea: null,
    marketSegment: null,
    qualityProfile: null,
    pricingProfileStatus: "unknown",
    coverageStatus: "unknown",
    comparableRadiusMode: null,
    allowedZoneCodes: [],
    excludedZoneCodes: [],
    comparableRelations: [],
    excludedRelations: [],
    priceBandM2Min: null,
    priceBandM2Max: null,
    builtAt: new Date().toISOString(),
  };
}

function computeConfidence(
  resolutionMethod: ComparabilityResolutionMethod,
  profile: ZoneProfileFound,
  extraFlags: string[],
): { level: ComparabilityConfidenceLevel; flags: string[] } {
  const flags = [...extraFlags];
  let level: ComparabilityConfidenceLevel = "medium";

  if (resolutionMethod === "key_zona") level = "high";
  if (resolutionMethod === "alias" || resolutionMethod === "canonical_name") level = "medium";

  if (profile.pricingProfileStatus === "heuristic") {
    level = "low";
    flags.push("HEURISTIC_PROFILE");
  }
  if (profile.coverageStatus === "known_unprofiled") {
    flags.push("KNOWN_UNPROFILED");
  }
  if (profile.sourceQuality === "baja") {
    flags.push("LOW_SOURCE_QUALITY");
    if (level === "high") level = "medium";
  }
  if (profile.validationPriority !== "P1_active_inventory") {
    flags.push("NON_P1_PRIORITY");
  }

  return { level, flags: [...new Set(flags)] };
}

async function findProfileByKeyZona(keyLoca: number, keyZona: number): Promise<ZoneProfile> {
  return prisma.marketZoneProfile.findFirst({
    where: {
      catalogVersion: DEFAULT_CATALOG_VERSION,
      keyLoca,
      keyZona,
    },
  });
}

async function findProfileByAlias(keyLoca: number, zoneRaw: string): Promise<ZoneProfile> {
  const aliasNormalized = normalizeAlias(zoneRaw);
  if (!aliasNormalized) return null;

  const alias = await prisma.marketZoneAlias.findFirst({
    where: {
      keyLoca,
      aliasNormalized,
      isActive: true,
    },
    orderBy: [
      { aliasType: "asc" },
      { updatedAt: "desc" },
    ],
  });
  if (!alias) return null;

  return prisma.marketZoneProfile.findFirst({
    where: {
      catalogVersion: DEFAULT_CATALOG_VERSION,
      suggestedZoneCode: alias.zoneCode,
    },
  });
}

async function findProfileByCanonicalName(keyLoca: number, zoneRaw: string): Promise<ZoneProfile> {
  const normalized = zoneRaw.trim();
  if (!normalized) return null;
  return prisma.marketZoneProfile.findFirst({
    where: {
      catalogVersion: DEFAULT_CATALOG_VERSION,
      keyLoca,
      zoneNameCanonical: { equals: normalized, mode: "insensitive" },
    },
  });
}

async function resolveActiveProfile(initial: ZoneProfile): Promise<{
  profile: ZoneProfile;
  redirectApplied: boolean;
  redirectChain: string[];
}> {
  if (!initial) {
    return { profile: null, redirectApplied: false, redirectChain: [] };
  }

  let current: ZoneProfile = initial;
  const chain: string[] = [];
  let hops = 0;
  while (current && !current.isActive && current.redirectToZoneCode && hops < MAX_REDIRECT_HOPS) {
    chain.push(current.suggestedZoneCode);
    current = await prisma.marketZoneProfile.findFirst({
      where: {
        catalogVersion: DEFAULT_CATALOG_VERSION,
        suggestedZoneCode: current.redirectToZoneCode,
      },
    });
    hops += 1;
  }

  return {
    profile: current,
    redirectApplied: chain.length > 0,
    redirectChain: chain,
  };
}

function relationToRule(relation: ZoneRelation): ComparabilityRelationRule {
  return {
    toZoneCode: relation.toZoneCode,
    strength: relation.strength,
    reason: relation.reason ?? null,
  };
}

export async function buildPropertyComparabilityProfile(
  input: PricingPropertyInput,
): Promise<PropertyComparabilityProfile> {
  const keyLoca = input.keyLoca ?? DEFAULT_KEY_LOCA;
  const zoneRaw = input.zonaRaw || input.zona;
  const flags: string[] = [];
  let resolutionMethod: ComparabilityResolutionMethod = "unknown";

  let profile: ZoneProfile = null;
  if (input.keyZona != null && Number.isFinite(input.keyZona)) {
    const byKey = await findProfileByKeyZona(keyLoca, input.keyZona);
    if (byKey) {
      profile = byKey;
      resolutionMethod = "key_zona";
    }
  }

  if (!profile) {
    const byAlias = await findProfileByAlias(keyLoca, zoneRaw);
    if (byAlias) {
      profile = byAlias;
      resolutionMethod = "alias";
    }
  }

  if (!profile) {
    const byCanonical = await findProfileByCanonicalName(keyLoca, zoneRaw);
    if (byCanonical) {
      profile = byCanonical;
      resolutionMethod = "canonical_name";
    }
  }

  if (!profile) {
    return fallbackUnknown(input, ["ZONE_NOT_MAPPED"]);
  }

  const { profile: activeProfile, redirectApplied, redirectChain } = await resolveActiveProfile(profile);
  if (!activeProfile || !activeProfile.isActive) {
    return fallbackUnknown(input, ["INACTIVE_WITHOUT_VALID_REDIRECT"], resolutionMethod);
  }
  if (redirectApplied) {
    flags.push("REDIRECT_APPLIED");
    flags.push(`REDIRECT_CHAIN:${redirectChain.join("->")}`);
  }

  const validPricingStatus =
    activeProfile.pricingProfileStatus === "ready" ||
    activeProfile.pricingProfileStatus === "heuristic";

  if (!validPricingStatus) {
    return {
      ...fallbackUnknown(input, [`PRICING_STATUS_${activeProfile.pricingProfileStatus.toUpperCase()}`], resolutionMethod),
      catalogVersion: activeProfile.catalogVersion,
      zoneCode: activeProfile.suggestedZoneCode,
      zoneNameCanonical: activeProfile.zoneNameCanonical,
      keyLoca: activeProfile.keyLoca,
      keyZona: activeProfile.keyZona,
      coverageStatus: activeProfile.coverageStatus,
      pricingProfileStatus: activeProfile.pricingProfileStatus,
    };
  }

  const outgoingRelations = await prisma.marketZoneRelation.findMany({
    where: {
      catalogVersion: activeProfile.catalogVersion,
      fromZoneCode: activeProfile.suggestedZoneCode,
    },
    orderBy: [{ relationType: "asc" }, { toZoneCode: "asc" }],
  });

  const activeZoneCodes = new Set(
    (
      await prisma.marketZoneProfile.findMany({
        where: {
          catalogVersion: activeProfile.catalogVersion,
          isActive: true,
        },
        select: { suggestedZoneCode: true },
      })
    ).map((item) => item.suggestedZoneCode),
  );

  const excluded = new Set(
    [...activeProfile.notComparableWithZoneCodes].filter((code) => activeZoneCodes.has(code)),
  );
  const comparable = new Set(
    [...activeProfile.comparableWithZoneCodes].filter((code) => activeZoneCodes.has(code)),
  );

  const comparableRelations = outgoingRelations.filter((relation) => relation.relationType === "comparable");
  for (const relation of comparableRelations) {
    if (activeZoneCodes.has(relation.toZoneCode)) comparable.add(relation.toZoneCode);
  }

  const excludedRelations = outgoingRelations.filter((relation) => relation.relationType === "not_comparable");
  for (const relation of excludedRelations) {
    if (activeZoneCodes.has(relation.toZoneCode)) excluded.add(relation.toZoneCode);
  }

  // Guardrail: not_comparable siempre prevalece.
  for (const excludedCode of excluded) comparable.delete(excludedCode);

  let allowedZoneCodes: string[] = [activeProfile.suggestedZoneCode];
  if (activeProfile.comparableRadiusMode === "zone_plus_mirrors" || activeProfile.comparableRadiusMode === "dynamic") {
    allowedZoneCodes = [activeProfile.suggestedZoneCode, ...[...comparable].sort()];
  }

  const confidence = computeConfidence(resolutionMethod, activeProfile, flags);

  return {
    propertyCode: input.propertyCode,
    catalogVersion: activeProfile.catalogVersion,
    resolutionMethod,
    confidenceLevel: confidence.level,
    confidenceFlags: confidence.flags,
    zoneRaw,
    zoneCode: activeProfile.suggestedZoneCode,
    zoneNameCanonical: activeProfile.zoneNameCanonical,
    keyLoca: activeProfile.keyLoca,
    keyZona: activeProfile.keyZona,
    macroArea: activeProfile.macroArea,
    marketSegment: activeProfile.marketSegment,
    qualityProfile: activeProfile.qualityProfile,
    pricingProfileStatus: activeProfile.pricingProfileStatus,
    coverageStatus: activeProfile.coverageStatus,
    comparableRadiusMode: activeProfile.comparableRadiusMode,
    allowedZoneCodes,
    excludedZoneCodes: [...excluded].sort(),
    comparableRelations: comparableRelations.map(relationToRule),
    excludedRelations: excludedRelations.map(relationToRule),
    priceBandM2Min: activeProfile.priceBandM2Min,
    priceBandM2Max: activeProfile.priceBandM2Max,
    builtAt: new Date().toISOString(),
  };
}
