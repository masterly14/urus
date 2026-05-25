/**
 * M5 — Cruce de demandas activas contra una propiedad.
 *
 * Pipeline:
 *  1. Carga demandas activas desde `demands_current`.
 *  2. Aplica filtros duros (operación, tipología incompatible).
 *  3. Calcula score multidimensional para cada demanda superviviente.
 *  4. Devuelve matches con score ≥ threshold, ordenados por score desc.
 */

import { prisma } from "@/lib/prisma";
import { computeMatchScore, operationMatches, normalizeType, DEFAULT_CONFIG } from "./scoring";
import { buildDemandLocationContext } from "./location-context";
import type {
  MatchConfig,
  MatchResult,
  MatchDemandsResult,
  PropertyForMatching,
  DemandForMatching,
} from "./types";

export const ACTIVE_DEMAND_STATES = ["1", "20", "23", "26", "31", "activa", "active"];

/**
 * Margen de seguridad sobre la tolerancia de precio usada en scoring (10% por defecto).
 * Se aplica al filtro SQL para no excluir demandas que podrían puntuar match por tolerancia
 * o por el bonus "por debajo del mínimo" que permite scorePrice.
 */
const PRICE_SQL_MARGIN = 0.25;

/**
 * Carga demandas activas de `demands_current` con filtros mínimos en SQL:
 *  - `estadoId` incluido en la lista de estados activos (H19).
 *  - Compatibilidad básica de precio cuando la demanda declara presupuesto.
 *
 * El filtrado fino (zonas, tipos con sinónimos, tolerancia exacta) se mantiene en JS
 * dentro de {@link passesHardFilters} y del scoring para preservar la lógica difusa.
 */
async function loadActiveDemands(
  property: PropertyForMatching,
): Promise<DemandForMatching[]> {
  const precio = property.precio;

  const priceFilter =
    precio > 0
      ? {
          AND: [
            {
              OR: [
                { presupuestoMax: { lte: 0 } },
                { presupuestoMax: { gte: precio * (1 - PRICE_SQL_MARGIN) } },
              ],
            },
            {
              OR: [
                { presupuestoMin: { lte: 0 } },
                { presupuestoMin: { lte: precio * (1 + PRICE_SQL_MARGIN) } },
              ],
            },
          ],
        }
      : {};

  const demands = await prisma.demandCurrent.findMany({
    where: {
      estadoId: { in: ACTIVE_DEMAND_STATES },
      ...priceFilter,
    },
    select: {
      codigo: true,
      ref: true,
      nombre: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
      tipos: true,
      zonas: true,
      metrosMin: true,
      metrosMax: true,
      tipoOperacion: true,
    },
  });

  return demands.map((d) => ({
    codigo: d.codigo,
    ref: d.ref,
    nombre: d.nombre,
    presupuestoMin: d.presupuestoMin,
    presupuestoMax: d.presupuestoMax,
    habitacionesMin: d.habitacionesMin,
    tipos: d.tipos,
    zonas: d.zonas,
    ...(d.metrosMin != null ? { metrosMin: d.metrosMin } : {}),
    ...(d.metrosMax != null ? { metrosMax: d.metrosMax } : {}),
    ...(d.tipoOperacion ? { tipoOperacion: d.tipoOperacion } : {}),
  }));
}

/**
 * Filtros duros: descartan demandas sin scoring (operación incompatible, etc.).
 * Devuelve true si la demanda pasa los filtros y debe evaluarse.
 */
export function passesHardFilters(
  property: PropertyForMatching,
  demand: DemandForMatching,
): boolean {
  if (!operationMatches(property, demand)) return false;

  // Tipología incompatible cuando ambas partes la definen
  const propType = normalizeType(property.tipoOfer);
  if (propType && demand.tipos.trim()) {
    const demandTypes = demand.tipos.split(/[,|;]+/).map((s) =>
      normalizeType(s.trim()),
    ).filter(Boolean);
    if (demandTypes.length > 0 && !demandTypes.includes(propType)) {
      return false;
    }
  }

  return true;
}

/**
 * Cruza una propiedad contra todas las demandas activas en Neon.
 * Retorna los matches con score ≥ threshold, ordenados por score desc.
 */
export async function matchDemandsToProperty(
  property: PropertyForMatching,
  config: MatchConfig = DEFAULT_CONFIG,
): Promise<MatchDemandsResult> {
  const start = performance.now();

  const demands = await loadActiveDemands(property);
  const locationContexts = new Map(
    await Promise.all(
      demands.map(async (demand) => [demand.codigo, await buildDemandLocationContext(demand)] as const),
    ),
  );

  const matches: MatchResult[] = [];
  let filteredOut = 0;
  let geographicallyRejected = 0;

  for (const demand of demands) {
    if (!passesHardFilters(property, demand)) {
      filteredOut++;
      continue;
    }

    const { totalScore, matchScore, isMatch, blockedByLocation } = computeMatchScore(
      property,
      demand,
      { ...config, location: locationContexts.get(demand.codigo) },
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

  const executionMs = Math.round(performance.now() - start);

  console.log(
    `[matching] ${property.ref} (${property.zona}, ${property.precio}€) → ` +
    `${matches.length} matches / ${demands.length} demandas (${filteredOut} filtradas, ${geographicallyRejected} geo rechazadas, ${executionMs}ms)`,
  );

  return {
    property,
    totalDemands: demands.length,
    filteredOut,
    geographicallyRejected,
    matches,
    executionMs,
  };
}

/**
 * Carga una propiedad desde `properties_current` y la cruza contra demandas activas.
 */
export async function matchDemandsToPropertyById(
  propertyId: string,
  config: MatchConfig = DEFAULT_CONFIG,
): Promise<MatchDemandsResult | null> {
  const prop = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyId },
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

  if (!prop) {
    console.warn(`[matching] Propiedad ${propertyId} no encontrada en properties_current`);
    return null;
  }

  return matchDemandsToProperty(prop, config);
}
