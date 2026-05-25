/**
 * M5 — Cruce inverso: propiedades activas contra UNA demanda.
 *
 * Pipeline:
 *  1. Carga propiedades elegibles desde `properties_current`
 *     (estado Libre, no disponible=false, datos mínimos: precio>0, ciudad, zona).
 *  2. Aplica filtros duros (operación, tipología incompatible).
 *  3. Calcula score multidimensional para cada propiedad superviviente.
 *  4. Devuelve matches con score ≥ threshold, ordenados por score desc, top-N.
 */

import { prisma } from "@/lib/prisma";
import { computeMatchScore, operationMatches, normalizeType, DEFAULT_CONFIG } from "./scoring";
import { buildDemandLocationContext } from "./location-context";
import type {
  MatchConfig,
  MatchResult,
  PropertyForMatching,
  DemandForMatching,
} from "./types";

export interface MatchPropertiesResult {
  demand: DemandForMatching;
  totalProperties: number;
  filteredOut: number;
  geographicallyRejected: number;
  matches: MatchResult[];
  executionMs: number;
}

const PRICE_SQL_MARGIN = 0.25;
const MAX_MATCHES_PER_DEMAND = 20;

/**
 * Carga propiedades elegibles de `properties_current` con filtros en SQL:
 *  - estado = "Libre", nodisponible = false
 *  - datos mínimos: precio > 0, ciudad y zona no vacíos
 *  - compatibilidad básica de precio con margen amplio
 */
async function loadEligibleProperties(
  demand: DemandForMatching,
): Promise<PropertyForMatching[]> {
  const { presupuestoMin, presupuestoMax } = demand;
  const hasMin = presupuestoMin > 0;
  const hasMax = presupuestoMax > 0;

  const priceFilter: Record<string, unknown> =
    hasMin || hasMax
      ? {
          AND: [
            ...(hasMax
              ? [{ precio: { lte: presupuestoMax * (1 + PRICE_SQL_MARGIN) } }]
              : []),
            ...(hasMin
              ? [{ precio: { gte: presupuestoMin * (1 - PRICE_SQL_MARGIN) } }]
              : []),
          ],
        }
      : {};

  const properties = await prisma.propertyCurrent.findMany({
    where: {
      estado: "Libre",
      nodisponible: false,
      precio: { gt: 0 },
      ciudad: { not: "" },
      zona: { not: "" },
      ...priceFilter,
    },
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      tipoOfer: true,
      precio: true,
      metrosConstruidos: true,
      habitaciones: true,
      ciudad: true,
      zona: true,
    },
  });

  return properties.map((p) => ({
    codigo: p.codigo,
    ref: p.ref,
    titulo: p.titulo,
    tipoOfer: p.tipoOfer,
    precio: p.precio,
    metrosConstruidos: p.metrosConstruidos,
    habitaciones: p.habitaciones,
    ciudad: p.ciudad,
    zona: p.zona,
  }));
}

function passesHardFilters(
  property: PropertyForMatching,
  demand: DemandForMatching,
): boolean {
  if (!operationMatches(property, demand)) return false;

  const propType = normalizeType(property.tipoOfer);
  if (propType && demand.tipos.trim()) {
    const demandTypes = demand.tipos
      .split(/[,|;]+/)
      .map((s) => normalizeType(s.trim()))
      .filter(Boolean);
    if (demandTypes.length > 0 && !demandTypes.includes(propType)) {
      return false;
    }
  }

  return true;
}

/**
 * Cruza una demanda contra todas las propiedades elegibles en Neon.
 * Retorna los top-N matches con score ≥ threshold, ordenados por score desc.
 */
export async function matchPropertiesToDemand(
  demand: DemandForMatching,
  config: MatchConfig = DEFAULT_CONFIG,
): Promise<MatchPropertiesResult> {
  const start = performance.now();

  const properties = await loadEligibleProperties(demand);
  const location = await buildDemandLocationContext(demand);
  const scoringConfig: MatchConfig = { ...config, location };

  const matches: MatchResult[] = [];
  let filteredOut = 0;
  let geographicallyRejected = 0;

  for (const property of properties) {
    if (!passesHardFilters(property, demand)) {
      filteredOut++;
      continue;
    }

    const { totalScore, matchScore, isMatch, blockedByLocation } = computeMatchScore(
      property,
      demand,
      scoringConfig,
    );

    if (blockedByLocation) {
      geographicallyRejected++;
    }

    if (isMatch) {
      matches.push({
        demandId: demand.codigo,
        demandRef: demand.ref,
        demandNombre: demand.nombre,
        propertyId: property.codigo,
        propertyRef: property.ref,
        totalScore,
        matchScore,
        isMatch: true,
      });
    }
  }

  matches.sort((a, b) => b.totalScore - a.totalScore);
  const topMatches = matches.slice(0, MAX_MATCHES_PER_DEMAND);

  const executionMs = Math.round(performance.now() - start);

  console.log(
    `[matching:inverse] Demanda ${demand.ref} → ` +
    `${topMatches.length} matches (de ${matches.length} candidatos) / ` +
    `${properties.length} propiedades (${filteredOut} filtradas, ${geographicallyRejected} geo rechazadas, ${executionMs}ms)`,
  );

  return {
    demand,
    totalProperties: properties.length,
    filteredOut,
    geographicallyRejected,
    matches: topMatches,
    executionMs,
  };
}
