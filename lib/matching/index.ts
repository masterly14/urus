/**
 * M5 — Módulo de cruce de demandas contra propiedades.
 * Punto de entrada público.
 *
 * Función principal: matchDemandsToProperty(property) → MatchDemandsResult
 * Alternativa por ID: matchDemandsToPropertyById(propertyId) → MatchDemandsResult | null
 *
 * Scoring: computeMatchScore(property, demand) → { totalScore, matchScore, isMatch }
 */

export { matchDemandsToProperty, matchDemandsToPropertyById } from "./match-demands";
export { computeMatchScore, DEFAULT_CONFIG } from "./scoring";
export type {
  MatchResult,
  MatchScore,
  MatchDemandsResult,
  MatchConfig,
  MatchWeights,
  CriterionScore,
  PropertyForMatching,
  DemandForMatching,
} from "./types";
