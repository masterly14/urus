/**
 * M5 — Lógica de scoring para cruce de demandas contra propiedades.
 *
 * Cada criterio produce un score 0–1 y una razón explicativa.
 * El score total ponderado (0–100) determina si hay match.
 */

import type {
  CriterionScore,
  MatchScore,
  MatchConfig,
  PropertyForMatching,
  DemandForMatching,
} from "./types";

export const DEFAULT_CONFIG: MatchConfig = {
  weights: {
    zone: 0.30,
    price: 0.30,
    type: 0.20,
    size: 0.10,
    rooms: 0.10,
  },
  minScoreThreshold: 50,
  priceTolerancePercent: 10,
  sizeFallbackRangePercent: 20,
};

// ── Helpers de parsing ───────────────────────────────────────────────────────

function parseList(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ── Criterio: Zona ───────────────────────────────────────────────────────────
// Fallback por nombre de zona (case-insensitive, accent-insensitive).
// TODO: Integrar lib/geo/ para point-in-polygon cuando existan polígonos.

export function scoreZone(
  property: PropertyForMatching,
  demand: DemandForMatching,
): CriterionScore {
  const demandZones = parseList(demand.zonas).map(normalize);
  if (demandZones.length === 0) {
    return { matched: true, score: 0.5, reason: "Demanda sin zonas definidas — match parcial" };
  }

  const propZone = normalize(property.zona);
  const propCity = normalize(property.ciudad);

  if (!propZone && !propCity) {
    return { matched: false, score: 0, reason: "Propiedad sin zona ni ciudad" };
  }

  const exactMatch = demandZones.some((z) => z === propZone);
  if (exactMatch) {
    return { matched: true, score: 1.0, reason: `Zona exacta: ${property.zona}` };
  }

  const partialMatch = demandZones.some(
    (z) => propZone.includes(z) || z.includes(propZone) || z === propCity,
  );
  if (partialMatch) {
    return { matched: true, score: 0.7, reason: `Zona parcial: ${property.zona} ~ ${demand.zonas}` };
  }

  return { matched: false, score: 0, reason: `Sin coincidencia: ${property.zona} vs ${demand.zonas}` };
}

// ── Criterio: Precio ─────────────────────────────────────────────────────────

export function scorePrice(
  property: PropertyForMatching,
  demand: DemandForMatching,
  tolerancePercent: number = DEFAULT_CONFIG.priceTolerancePercent,
): CriterionScore {
  const precio = property.precio;
  const { presupuestoMin, presupuestoMax } = demand;

  if (presupuestoMin <= 0 && presupuestoMax <= 0) {
    return { matched: true, score: 0.5, reason: "Demanda sin presupuesto definido — match parcial" };
  }

  if (precio <= 0) {
    return { matched: false, score: 0, reason: "Propiedad sin precio" };
  }

  const effectiveMin = presupuestoMin > 0 ? presupuestoMin : 0;
  const effectiveMax = presupuestoMax > 0 ? presupuestoMax : Infinity;
  const tolerance = effectiveMax !== Infinity
    ? effectiveMax * (tolerancePercent / 100)
    : effectiveMin * (tolerancePercent / 100);

  if (precio >= effectiveMin && precio <= effectiveMax) {
    const range = effectiveMax - effectiveMin;
    if (range <= 0) return { matched: true, score: 1.0, reason: `Precio ${precio}€ = presupuesto` };

    const center = (effectiveMin + effectiveMax) / 2;
    const distanceFromCenter = Math.abs(precio - center) / (range / 2);
    const score = Math.max(0.7, 1 - distanceFromCenter * 0.3);
    return { matched: true, score, reason: `Precio ${precio}€ dentro del rango [${effectiveMin}–${effectiveMax}]€` };
  }

  if (precio > effectiveMax && precio <= effectiveMax + tolerance) {
    const overAmount = precio - effectiveMax;
    const score = 0.4 * (1 - overAmount / tolerance);
    return { matched: true, score: Math.max(0.1, score), reason: `Precio ${precio}€ ligeramente sobre máx. ${effectiveMax}€ (+${Math.round(overAmount)}€)` };
  }

  if (precio < effectiveMin && precio >= effectiveMin - tolerance) {
    return { matched: true, score: 0.6, reason: `Precio ${precio}€ por debajo del mín. ${effectiveMin}€ (beneficio)` };
  }

  return { matched: false, score: 0, reason: `Precio ${precio}€ fuera de rango [${effectiveMin}–${effectiveMax}]€` };
}

// ── Criterio: Tipología ──────────────────────────────────────────────────────

const TYPE_SYNONYMS: Record<string, string[]> = {
  piso: ["piso", "flat", "apartamento", "apartment"],
  casa: ["casa", "chalet", "villa", "house", "unifamiliar", "adosado", "pareado"],
  atico: ["atico", "ático", "penthouse", "duplex", "dúplex"],
  estudio: ["estudio", "studio", "loft"],
  local: ["local", "comercial", "oficina", "office"],
  terreno: ["terreno", "solar", "parcela", "land"],
};

function normalizeType(raw: string): string {
  const n = normalize(raw);
  for (const [canonical, synonyms] of Object.entries(TYPE_SYNONYMS)) {
    if (synonyms.some((s) => n.includes(s))) return canonical;
  }
  return n;
}

export function scoreType(
  property: PropertyForMatching,
  demand: DemandForMatching,
): CriterionScore {
  const demandTypes = parseList(demand.tipos).map(normalizeType);
  if (demandTypes.length === 0) {
    return { matched: true, score: 0.5, reason: "Demanda sin tipología definida — match parcial" };
  }

  const propType = normalizeType(property.tipoOfer);
  if (!propType) {
    return { matched: false, score: 0, reason: "Propiedad sin tipología" };
  }

  if (demandTypes.includes(propType)) {
    return { matched: true, score: 1.0, reason: `Tipología coincide: ${property.tipoOfer}` };
  }

  return { matched: false, score: 0, reason: `Tipología ${property.tipoOfer} no coincide con ${demand.tipos}` };
}

// ── Criterio: Metros ─────────────────────────────────────────────────────────

export function scoreSize(
  property: PropertyForMatching,
  demand: DemandForMatching,
  fallbackRangePercent: number = DEFAULT_CONFIG.sizeFallbackRangePercent,
): CriterionScore {
  const metros = property.metrosConstruidos;

  if (metros <= 0) {
    return { matched: true, score: 0.3, reason: "Propiedad sin metros registrados" };
  }

  // DemandCurrent no tiene metrosMin/Max — derivamos del precio+tipo un rango razonable
  // Por ahora, match parcial si no tenemos criterio de metros en la demanda
  // TODO: Añadir metrosMin/metrosMax a DemandCurrent cuando el NLU los extraiga
  const hasSizeData = false; // Placeholder — se activará al enriquecer DemandCurrent

  if (!hasSizeData) {
    return { matched: true, score: 0.5, reason: `Propiedad ${metros}m² — demanda sin criterio de metros` };
  }

  return { matched: true, score: 0.5, reason: `${metros}m²` };
}

// ── Criterio: Habitaciones ───────────────────────────────────────────────────

export function scoreRooms(
  property: PropertyForMatching,
  demand: DemandForMatching,
): CriterionScore {
  const propRooms = property.habitaciones;
  const minRooms = demand.habitacionesMin;

  if (minRooms <= 0) {
    return { matched: true, score: 0.5, reason: "Demanda sin mínimo de habitaciones" };
  }

  if (propRooms <= 0) {
    return { matched: true, score: 0.3, reason: "Propiedad sin habitaciones registradas" };
  }

  if (propRooms >= minRooms) {
    const bonus = propRooms === minRooms ? 1.0 : Math.max(0.7, 1 - (propRooms - minRooms) * 0.1);
    return { matched: true, score: bonus, reason: `${propRooms} hab. ≥ mín. ${minRooms}` };
  }

  if (propRooms === minRooms - 1) {
    return { matched: true, score: 0.3, reason: `${propRooms} hab. — 1 menos que mín. ${minRooms}` };
  }

  return { matched: false, score: 0, reason: `${propRooms} hab. < mín. ${minRooms}` };
}

// ── Score total ──────────────────────────────────────────────────────────────

export function computeMatchScore(
  property: PropertyForMatching,
  demand: DemandForMatching,
  config: MatchConfig = DEFAULT_CONFIG,
): { totalScore: number; matchScore: MatchScore; isMatch: boolean } {
  const matchScore: MatchScore = {
    zone: scoreZone(property, demand),
    price: scorePrice(property, demand, config.priceTolerancePercent),
    type: scoreType(property, demand),
    size: scoreSize(property, demand, config.sizeFallbackRangePercent),
    rooms: scoreRooms(property, demand),
  };

  const { weights } = config;
  const totalScore = Math.round(
    (matchScore.zone.score * weights.zone +
      matchScore.price.score * weights.price +
      matchScore.type.score * weights.type +
      matchScore.size.score * weights.size +
      matchScore.rooms.score * weights.rooms) *
      100,
  );

  return {
    totalScore,
    matchScore,
    isMatch: totalScore >= config.minScoreThreshold,
  };
}
