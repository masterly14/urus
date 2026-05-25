import type {
  CriterionScore,
  DemandForMatching,
  LocationMatchContext,
  PropertyForMatching,
} from "./types";

export type LocationMatchStatus = "accepted" | "rejected" | "unknown";

export type LocationMatchMethod =
  | "missing_demand_zone"
  | "missing_property_location"
  | "exact_zone"
  | "partial_zone"
  | "segment_overlap"
  | "nearby_zone"
  | "excluded_zone"
  | "city"
  | "city_partial"
  | "city_without_concrete_zone"
  | "different_city"
  | "different_zone";

export interface LocationMatchDecision extends CriterionScore {
  status: LocationMatchStatus;
  confidence: number;
  matchedBy: LocationMatchMethod;
  demandHasConcreteZones: boolean;
}

const CITY_NAMES = new Set([
  "cordoba",
  "sevilla",
  "malaga",
  "granada",
  "jaen",
  "cadiz",
  "huelva",
  "almeria",
  "madrid",
  "barcelona",
  "valencia",
  "murcia",
]);

const GENERIC_LOCATION_NAMES = new Set([
  "andalucia",
  "andalusia",
  "espana",
  "spain",
  "provincia",
  "capital",
  "todas las zonas",
  "todas zonas",
  "todas",
  "cualquier zona",
  "indistinto",
]);

export function parseLocationList(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeLocation(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function splitLocationParts(raw: string): string[] {
  return raw
    .split(/[-–—/]+/)
    .map((part) => normalizeLocation(part))
    .filter((part) => part.length > 1);
}

function isKnownCity(value: string): boolean {
  return CITY_NAMES.has(value);
}

function isGenericLocation(value: string): boolean {
  return GENERIC_LOCATION_NAMES.has(value) || isKnownCity(value);
}

function isConcreteZone(value: string): boolean {
  return value.length > 1 && !isGenericLocation(value);
}

function demandZoneCandidates(rawZone: string): string[] {
  const parts = splitLocationParts(rawZone);
  const source = parts.length > 0 ? parts : [normalizeLocation(rawZone)];
  return [...new Set(source.filter(isConcreteZone))];
}

export function extractConcreteLocationTokens(zonas: string): string[] {
  return [...new Set(parseLocationList(zonas).flatMap(demandZoneCandidates))];
}

function demandCityHints(rawZone: string): string[] {
  return splitLocationParts(rawZone).filter(isKnownCity);
}

function includesEitherSide(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

function segmentOverlap(propZoneNorm: string, rawDemandZone: string): number {
  const segments = demandZoneCandidates(rawDemandZone);
  if (segments.length === 0) return 0;
  const hits = segments.filter((segment) => propZoneNorm.includes(segment)).length;
  return hits / segments.length;
}

export function demandHasConcreteZones(zonas: string): boolean {
  return parseLocationList(zonas).some((zone) => demandZoneCandidates(zone).length > 0);
}

export function evaluateLocationMatch(
  property: PropertyForMatching,
  demand: DemandForMatching,
  context: LocationMatchContext = {},
): LocationMatchDecision {
  const demandZonesRaw = parseLocationList(demand.zonas);
  if (demandZonesRaw.length === 0) {
    return {
      matched: true,
      score: 0.5,
      reason: "Demanda sin zonas definidas — match parcial",
      status: "unknown",
      confidence: 0.5,
      matchedBy: "missing_demand_zone",
      demandHasConcreteZones: false,
    };
  }

  const propZone = normalizeLocation(property.zona ?? "");
  const propCity = normalizeLocation(property.ciudad ?? "");
  const demandCity = context.demandCity ? normalizeLocation(context.demandCity) : "";
  if (!propZone && !propCity) {
    return {
      matched: false,
      score: 0,
      reason: "Propiedad sin zona ni ciudad",
      status: "rejected",
      confidence: 1,
      matchedBy: "missing_property_location",
      demandHasConcreteZones: demandHasConcreteZones(demand.zonas),
    };
  }

  const demandZoneCandidatesList = demandZonesRaw.flatMap(demandZoneCandidates);
  const uniqueDemandZones = [...new Set(demandZoneCandidatesList)];
  const cityHints = [...new Set(demandZonesRaw.flatMap(demandCityHints))];
  const exactZones = new Set((context.exactZones ?? []).map(normalizeLocation));
  const nearbyZones = new Set((context.nearbyZones ?? []).map(normalizeLocation));
  const excludedZones = new Set((context.excludedZones ?? []).map(normalizeLocation));
  const demandCityOnly = uniqueDemandZones.length === 0;

  if (demandCityOnly) {
    const demandCities = demandZonesRaw.map(normalizeLocation).filter(isKnownCity);
    if (propCity && demandCities.some((city) => city === propCity)) {
      return {
        matched: true,
        score: 0.85,
        reason: `Ciudad exacta: ${property.ciudad}`,
        status: "accepted",
        confidence: 0.85,
        matchedBy: "city",
        demandHasConcreteZones: false,
      };
    }

    if (propCity && demandCities.some((city) => includesEitherSide(propCity, city))) {
      return {
        matched: true,
        score: 0.6,
        reason: `Ciudad parcial: ${property.ciudad} ~ ${demand.zonas}`,
        status: "accepted",
        confidence: 0.6,
        matchedBy: "city_partial",
        demandHasConcreteZones: false,
      };
    }

    return {
      matched: false,
      score: 0,
      reason: `Sin coincidencia: ${property.zona} (${property.ciudad}) vs ${demand.zonas}`,
      status: "rejected",
      confidence: 1,
      matchedBy: propCity ? "different_city" : "different_zone",
      demandHasConcreteZones: false,
    };
  }

  if (propZone && !isGenericLocation(propZone)) {
    if (excludedZones.has(propZone)) {
      return {
        matched: false,
        score: 0,
        reason: `Zona no comparable por catálogo: ${property.zona} vs ${demand.zonas}`,
        status: "rejected",
        confidence: 1,
        matchedBy: "excluded_zone",
        demandHasConcreteZones: true,
      };
    }

    if (exactZones.has(propZone)) {
      return {
        matched: true,
        score: 1,
        reason: `Zona exacta por catálogo: ${property.zona}`,
        status: "accepted",
        confidence: 1,
        matchedBy: "exact_zone",
        demandHasConcreteZones: true,
      };
    }

    if (nearbyZones.has(propZone)) {
      return {
        matched: true,
        score: 0.78,
        reason: `Zona cercana/comparable por catálogo: ${property.zona} ~ ${demand.zonas}`,
        status: "accepted",
        confidence: 0.78,
        matchedBy: "nearby_zone",
        demandHasConcreteZones: true,
      };
    }

    if (uniqueDemandZones.some((zone) => zone === propZone)) {
      return {
        matched: true,
        score: 1,
        reason: `Zona exacta: ${property.zona}`,
        status: "accepted",
        confidence: 1,
        matchedBy: "exact_zone",
        demandHasConcreteZones: true,
      };
    }

    if (uniqueDemandZones.some((zone) => includesEitherSide(propZone, zone))) {
      return {
        matched: true,
        score: 0.7,
        reason: `Zona parcial: ${property.zona} ~ ${demand.zonas}`,
        status: "accepted",
        confidence: 0.7,
        matchedBy: "partial_zone",
        demandHasConcreteZones: true,
      };
    }

    let bestOverlap = 0;
    for (const rawZone of demandZonesRaw) {
      const overlap = segmentOverlap(propZone, rawZone);
      if (overlap > bestOverlap) bestOverlap = overlap;
    }

    if (bestOverlap >= 0.5) {
      const score = Math.min(0.65, 0.5 + bestOverlap * 0.2);
      return {
        matched: true,
        score,
        reason: `Zona segmento compartido (${Math.round(bestOverlap * 100)}%): ${property.zona} ~ ${demand.zonas}`,
        status: "accepted",
        confidence: score,
        matchedBy: "segment_overlap",
        demandHasConcreteZones: true,
      };
    }
  }

  if (demandCity && propCity && propCity !== demandCity) {
    return {
      matched: false,
      score: 0,
      reason: `Ciudad distinta: ${property.ciudad} vs ${context.demandCity} (${demand.zonas})`,
      status: "rejected",
      confidence: 1,
      matchedBy: "different_city",
      demandHasConcreteZones: true,
    };
  }

  if (demandCity && propCity === demandCity) {
    return {
      matched: false,
      score: 0,
      reason: `Ciudad coincide (${property.ciudad}) pero no es zona exacta ni cercana: ${property.zona} vs ${demand.zonas}`,
      status: "rejected",
      confidence: 1,
      matchedBy: "city_without_concrete_zone",
      demandHasConcreteZones: true,
    };
  }

  if (cityHints.length > 0 && propCity && !cityHints.includes(propCity)) {
    return {
      matched: false,
      score: 0,
      reason: `Ciudad distinta: ${property.ciudad} vs ${cityHints.join(", ")} (${demand.zonas})`,
      status: "rejected",
      confidence: 1,
      matchedBy: "different_city",
      demandHasConcreteZones: true,
    };
  }

  if (cityHints.length > 0 && propCity && cityHints.includes(propCity)) {
    return {
      matched: false,
      score: 0,
      reason: `Ciudad coincide (${property.ciudad}) pero ninguna zona concreta coincide: ${property.zona} vs ${demand.zonas}`,
      status: "rejected",
      confidence: 1,
      matchedBy: "city_without_concrete_zone",
      demandHasConcreteZones: true,
    };
  }

  return {
    matched: false,
    score: 0,
    reason: `Sin coincidencia: ${property.zona} (${property.ciudad}) vs ${demand.zonas}`,
    status: "rejected",
    confidence: 1,
    matchedBy: "different_zone",
    demandHasConcreteZones: true,
  };
}

