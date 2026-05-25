/**
 * M5 — Lógica de scoring para cruce de demandas contra propiedades.
 *
 * Cada criterio produce un score 0–1 y una razón explicativa.
 * El score total ponderado (0–100) determina si hay match.
 *
 * Criterios:
 *  1. Zona — coincidencia textual normalizada (accent/case-insensitive) con
 *     soporte multi-zona, fallback por ciudad, y penalización gradual.
 *  2. Precio — rango con tolerancia asimétrica configurable.
 *  3. Tipología — sinónimos inmobiliarios españoles.
 *  4. Superficie — rango metrosMin/metrosMax cuando la demanda lo especifica.
 *  5. Habitaciones — mínimo con penalización gradual.
 */

import type {
  CriterionScore,
  MatchScore,
  MatchConfig,
  PropertyForMatching,
  DemandForMatching,
} from "./types";
import {
  demandHasConcreteZones,
  evaluateLocationMatch,
  normalizeLocation,
  parseLocationList,
} from "./location";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseList(raw: string): string[] {
  return parseLocationList(raw);
}

export function normalize(s: string): string {
  return normalizeLocation(s);
}

// ── Criterio: Zona ───────────────────────────────────────────────────────────
// Estrategia: decisión geográfica explícita. Si la demanda trae barrios/zonas
// concretas, una coincidencia solo por ciudad no es suficiente.

export function scoreZone(
  property: PropertyForMatching,
  demand: DemandForMatching,
  context: MatchConfig["location"] = {},
): CriterionScore {
  return evaluateLocationMatch(property, demand, context);
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

  // Dentro del rango: score proporcional a cercanía al centro
  if (precio >= effectiveMin && precio <= effectiveMax) {
    if (effectiveMax === Infinity) {
      return { matched: true, score: 0.9, reason: `Precio ${precio}€ ≥ mín. ${effectiveMin}€ (sin tope)` };
    }
    const range = effectiveMax - effectiveMin;
    if (range <= 0) return { matched: true, score: 1.0, reason: `Precio ${precio}€ = presupuesto` };

    const center = (effectiveMin + effectiveMax) / 2;
    const distanceFromCenter = Math.abs(precio - center) / (range / 2);
    const score = Math.max(0.7, 1 - distanceFromCenter * 0.3);
    return { matched: true, score, reason: `Precio ${precio}€ dentro del rango [${effectiveMin}–${effectiveMax}]€` };
  }

  // Por encima con tolerancia
  const upperTolerance = effectiveMax !== Infinity
    ? effectiveMax * (tolerancePercent / 100)
    : 0;
  if (precio > effectiveMax && effectiveMax !== Infinity && precio <= effectiveMax + upperTolerance) {
    const overAmount = precio - effectiveMax;
    const score = 0.4 * (1 - overAmount / upperTolerance);
    return { matched: true, score: Math.max(0.1, score), reason: `Precio ${precio}€ ligeramente sobre máx. ${effectiveMax}€ (+${Math.round(overAmount)}€)` };
  }

  // Por debajo del mín con tolerancia (beneficio para el comprador)
  const lowerTolerance = effectiveMin > 0 ? effectiveMin * (tolerancePercent / 100) : 0;
  if (precio < effectiveMin && effectiveMin > 0 && precio >= effectiveMin - lowerTolerance) {
    return { matched: true, score: 0.6, reason: `Precio ${precio}€ por debajo del mín. ${effectiveMin}€ (beneficio)` };
  }

  return { matched: false, score: 0, reason: `Precio ${precio}€ fuera de rango [${effectiveMin}–${effectiveMax === Infinity ? "∞" : effectiveMax}]€` };
}

// ── Criterio: Tipología ──────────────────────────────────────────────────────

/**
 * Inmovilla key_tipo codes → human-readable name.
 * Used as fallback when tipoOfer is stored as the numeric code.
 */
const KEY_TIPO_NAMES: Record<string, string> = {
  "199": "Adosado", "299": "Bungalow", "399": "Casa", "499": "Chalet",
  "599": "Cortijo", "999": "Pareado", "1299": "Local comercial",
  "1399": "Oficina", "1599": "Almacén", "1699": "Edificio",
  "2099": "Nave industrial", "2399": "Garaje", "2599": "Parking",
  "2699": "Trastero", "2799": "Apartamento", "2899": "Ático",
  "2999": "Dúplex", "3099": "Estudio", "3299": "Loft", "3399": "Piso",
  "3499": "Planta baja", "3599": "Tríplex", "3699": "Finca rústica",
  "3899": "Solar", "3999": "Terreno industrial", "4099": "Terreno rural",
  "4199": "Terreno urbano", "4399": "Ático Dúplex", "4599": "Casa de campo",
  "4999": "Villa", "5099": "Parcela",
};

// Order matters: more specific entries first to avoid substring conflicts
// (e.g. "penthouse" contains "house", so "atico" must precede "casa").
const TYPE_SYNONYMS: [string, string[]][] = [
  ["atico", ["atico", "ático", "penthouse", "duplex", "dúplex", "triplex", "tríplex", "sobreatido"]],
  ["piso", ["piso", "flat", "apartamento", "apartment", "planta baja", "entresuelo", "buhardilla", "semiatico"]],
  ["casa", ["casa", "chalet", "villa", "house", "unifamiliar", "adosado", "pareado", "finca", "cortijo"]],
  ["estudio", ["estudio", "studio", "loft"]],
  ["local", ["local", "comercial", "oficina", "office", "nave", "almacen", "despacho"]],
  ["terreno", ["terreno", "solar", "parcela", "land", "rustica", "rústica", "monte"]],
  ["garaje", ["garaje", "garage", "parking", "plaza de garaje", "trastero"]],
];

export function normalizeType(raw: string): string {
  const resolved = KEY_TIPO_NAMES[raw.trim()] ?? raw;
  const n = normalize(resolved);
  for (const [canonical, synonyms] of TYPE_SYNONYMS) {
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

// ── Criterio: Superficie ─────────────────────────────────────────────────────

export function scoreSize(
  property: PropertyForMatching,
  demand: DemandForMatching,
  fallbackRangePercent: number = DEFAULT_CONFIG.sizeFallbackRangePercent,
): CriterionScore {
  const metros = property.metrosConstruidos;
  const { metrosMin, metrosMax } = demand;

  if (metros <= 0) {
    return { matched: true, score: 0.3, reason: "Propiedad sin metros registrados" };
  }

  const hasMinSize = typeof metrosMin === "number" && metrosMin > 0;
  const hasMaxSize = typeof metrosMax === "number" && metrosMax > 0;

  if (!hasMinSize && !hasMaxSize) {
    return { matched: true, score: 0.5, reason: `Propiedad ${metros}m² — demanda sin criterio de metros` };
  }

  const effMin = hasMinSize ? metrosMin! : 0;
  const effMax = hasMaxSize ? metrosMax! : Infinity;

  // Dentro del rango exacto
  if (metros >= effMin && metros <= effMax) {
    if (effMax === Infinity) {
      return { matched: true, score: 0.9, reason: `${metros}m² ≥ mín. ${effMin}m²` };
    }
    const range = effMax - effMin;
    if (range <= 0) return { matched: true, score: 1.0, reason: `${metros}m² = objetivo` };

    const center = (effMin + effMax) / 2;
    const dist = Math.abs(metros - center) / (range / 2);
    const score = Math.max(0.7, 1 - dist * 0.3);
    return { matched: true, score, reason: `${metros}m² dentro de [${effMin}–${effMax}]m²` };
  }

  // Fuera de rango con tolerancia
  const toleranceM = effMax !== Infinity
    ? effMax * (fallbackRangePercent / 100)
    : effMin * (fallbackRangePercent / 100);

  if (metros > effMax && effMax !== Infinity && metros <= effMax + toleranceM) {
    const overPct = Math.round(((metros - effMax) / effMax) * 100);
    return { matched: true, score: 0.4, reason: `${metros}m² ligeramente sobre máx. ${effMax}m² (+${overPct}%)` };
  }

  if (metros < effMin && effMin > 0 && metros >= effMin - toleranceM) {
    const underPct = Math.round(((effMin - metros) / effMin) * 100);
    return { matched: true, score: 0.35, reason: `${metros}m² ligeramente bajo mín. ${effMin}m² (-${underPct}%)` };
  }

  return { matched: false, score: 0, reason: `${metros}m² fuera de [${effMin}–${effMax === Infinity ? "∞" : effMax}]m²` };
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
    if (propRooms === minRooms) {
      return { matched: true, score: 1.0, reason: `${propRooms} hab. = mín. ${minRooms}` };
    }
    const excess = propRooms - minRooms;
    const score = Math.max(0.7, 1 - excess * 0.1);
    return { matched: true, score, reason: `${propRooms} hab. ≥ mín. ${minRooms}` };
  }

  if (propRooms === minRooms - 1) {
    return { matched: true, score: 0.3, reason: `${propRooms} hab. — 1 menos que mín. ${minRooms}` };
  }

  return { matched: false, score: 0, reason: `${propRooms} hab. < mín. ${minRooms}` };
}

// ── Filtro duro: operación ───────────────────────────────────────────────────

export function operationMatches(
  property: PropertyForMatching,
  demand: DemandForMatching,
): boolean {
  const propOp = normalize(property.tipoOperacion ?? "");
  const demOp = normalize(demand.tipoOperacion ?? "");
  // Neither side specified → no filter
  if (!propOp && !demOp) return true;
  // One side empty → still allow (no strict rejection when one side is unspecified)
  if (!propOp || !demOp) return true;
  // Both specified → must match
  return propOp === demOp;
}

// ── Score total ──────────────────────────────────────────────────────────────

export function computeMatchScore(
  property: PropertyForMatching,
  demand: DemandForMatching,
  config: MatchConfig = DEFAULT_CONFIG,
): { totalScore: number; matchScore: MatchScore; isMatch: boolean; blockedByLocation: boolean } {
  const matchScore: MatchScore = {
    zone: scoreZone(property, demand, config.location),
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
  const blockedByLocation = demandHasConcreteZones(demand.zonas) && !matchScore.zone.matched;

  return {
    totalScore,
    matchScore,
    isMatch: totalScore >= config.minScoreThreshold && !blockedByLocation,
    blockedByLocation,
  };
}
