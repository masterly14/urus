/**
 * Evaluación de cobertura de una demanda por la cartera interna.
 *
 * Cruza una demanda contra todas las propiedades activas en properties_current
 * y devuelve el mejor score alcanzado. Si bestScore < COVERAGE_MIN_SCORE,
 * el handler de coverage puede disparar búsqueda en Statefox.
 */

import { prisma } from "@/lib/prisma";
import { computeMatchScore, DEFAULT_CONFIG } from "./scoring";
import { passesHardFilters } from "./match-demands";
import { buildDemandLocationContext } from "./location-context";
import type {
  MatchConfig,
  MatchResult,
  DemandCoverageResult,
  PropertyForMatching,
  DemandForMatching,
} from "./types";

const envMinScore = process.env.MATCHING_COVERAGE_MIN_SCORE;
export const COVERAGE_MIN_SCORE =
  envMinScore && !isNaN(Number(envMinScore)) ? Number(envMinScore) : 60;

/**
 * Carga propiedades activas de properties_current con pre-filtro SQL básico
 * por precio (mismo margen que loadActiveDemands usa al revés).
 */
async function loadActiveProperties(
  demand: DemandForMatching,
): Promise<PropertyForMatching[]> {
  const PRICE_SQL_MARGIN = 0.25;

  const priceFilter =
    demand.presupuestoMax > 0
      ? {
          AND: [
            {
              OR: [
                { precio: { lte: 0 } },
                { precio: { lte: Math.round(demand.presupuestoMax * (1 + PRICE_SQL_MARGIN)) } },
              ],
            },
            ...(demand.presupuestoMin > 0
              ? [
                  {
                    OR: [
                      { precio: { lte: 0 } },
                      { precio: { gte: Math.round(demand.presupuestoMin * (1 - PRICE_SQL_MARGIN)) } },
                    ],
                  },
                ]
              : []),
          ],
        }
      : {};

  const properties = await prisma.propertyCurrent.findMany({
    where: {
      estado: "Libre",
      nodisponible: false,
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
    titulo: p.titulo ?? "",
    tipoOfer: p.tipoOfer ?? "",
    precio: p.precio,
    metrosConstruidos: p.metrosConstruidos,
    habitaciones: p.habitaciones,
    ciudad: p.ciudad ?? "",
    zona: p.zona ?? "",
  }));
}

/**
 * Evalúa cuánto cubre la cartera interna los criterios de una demanda.
 * Retorna el mejor score y el match top (si existe).
 */
export async function evaluateDemandCoverage(
  demandId: string,
  config: MatchConfig = DEFAULT_CONFIG,
): Promise<DemandCoverageResult | null> {
  const start = performance.now();

  const demandRow = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
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

  if (!demandRow) {
    console.warn(`[coverage] Demanda ${demandId} no encontrada en DemandCurrent`);
    return null;
  }

  const demand: DemandForMatching = {
    codigo: demandRow.codigo,
    ref: demandRow.ref,
    nombre: demandRow.nombre,
    presupuestoMin: demandRow.presupuestoMin,
    presupuestoMax: demandRow.presupuestoMax,
    habitacionesMin: demandRow.habitacionesMin,
    tipos: demandRow.tipos,
    zonas: demandRow.zonas,
    ...(demandRow.metrosMin != null ? { metrosMin: demandRow.metrosMin } : {}),
    ...(demandRow.metrosMax != null ? { metrosMax: demandRow.metrosMax } : {}),
    ...(demandRow.tipoOperacion ? { tipoOperacion: demandRow.tipoOperacion } : {}),
  };

  const properties = await loadActiveProperties(demand);
  const location = await buildDemandLocationContext(demand);
  const scoringConfig: MatchConfig = { ...config, location };

  let bestScore = 0;
  let topMatch: MatchResult | null = null;
  let totalCandidates = 0;

  for (const property of properties) {
    if (!passesHardFilters(property, demand)) continue;

    totalCandidates++;

    const { totalScore, matchScore, isMatch } = computeMatchScore(
      property,
      demand,
      scoringConfig,
    );

    if (isMatch && totalScore > bestScore) {
      bestScore = totalScore;
      topMatch = {
        demandId: demand.codigo,
        demandRef: demand.ref,
        demandNombre: demand.nombre,
        propertyId: property.codigo,
        propertyRef: property.ref,
        totalScore,
        matchScore,
        isMatch,
      };
    }
  }

  const executionMs = Math.round(performance.now() - start);

  console.log(
    `[coverage] demandId=${demandId} bestScore=${bestScore} candidates=${totalCandidates}/${properties.length} (${executionMs}ms)`,
  );

  return {
    demandId,
    bestScore,
    totalCandidates,
    topMatch,
    executionMs,
  };
}
