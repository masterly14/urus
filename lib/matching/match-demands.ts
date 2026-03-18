/**
 * M5 — Cruce de demandas activas contra una propiedad.
 *
 * Consulta todas las demandas activas en `demands_current` (Neon),
 * evalúa cada una contra la propiedad y devuelve los matches
 * ordenados por score descendente.
 *
 * Criterios de cruce:
 * 1. Zona: coincidencia por nombre (fallback). TODO: point-in-polygon vía lib/geo/.
 * 2. Precio: propiedad dentro del rango presupuestoMin–presupuestoMax (±tolerancia).
 * 3. Tipología: match por tipo de inmueble con sinónimos.
 * 4. Metros: pendiente de enriquecimiento de DemandCurrent.
 * 5. Habitaciones: propiedad ≥ mínimo requerido.
 */

import { prisma } from "@/lib/prisma";
import { computeMatchScore, DEFAULT_CONFIG } from "./scoring";
import type {
  MatchConfig,
  MatchResult,
  MatchDemandsResult,
  PropertyForMatching,
  DemandForMatching,
} from "./types";

const ACTIVE_DEMAND_STATES = ["1", "activa", "active"];

/**
 * Carga demandas activas de `demands_current`.
 * Filtra por estadoId ∈ ACTIVE_DEMAND_STATES o, si no hay datos de estado,
 * incluye todas (para no perder cruces en la fase MVP).
 */
async function loadActiveDemands(): Promise<DemandForMatching[]> {
  const demands = await prisma.demandCurrent.findMany({
    select: {
      codigo: true,
      ref: true,
      nombre: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
      tipos: true,
      zonas: true,
      estadoId: true,
    },
  });

  return demands.filter((d) => {
    if (!d.estadoId || d.estadoId === "") return true;
    return ACTIVE_DEMAND_STATES.includes(d.estadoId.toLowerCase());
  });
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

  const demands = await loadActiveDemands();

  const matches: MatchResult[] = [];

  for (const demand of demands) {
    const { totalScore, matchScore, isMatch } = computeMatchScore(
      property,
      demand,
      config,
    );

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
    `[matching] Propiedad ${property.ref} (${property.zona}, ${property.precio}€) → ` +
    `${matches.length}/${demands.length} matches (${executionMs}ms)`,
  );

  return {
    property,
    totalDemands: demands.length,
    matches,
    executionMs,
  };
}

/**
 * Carga una propiedad desde `properties_current` y la cruza contra demandas activas.
 * Útil para invocación desde el consumer al procesar eventos PROPIEDAD_CREADA.
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
