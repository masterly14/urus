/**
 * M5 — Módulo de cruce de demandas contra propiedades.
 * Punto de entrada público.
 *
 * Función principal: matchDemandsToProperty(property) → MatchDemandsResult
 * Alternativa por ID: matchDemandsToPropertyById(propertyId) → MatchDemandsResult | null
 *
 * Scoring: computeMatchScore(property, demand) → { totalScore, matchScore, isMatch }
 */

export { matchDemandsToProperty, matchDemandsToPropertyById, passesHardFilters, ACTIVE_DEMAND_STATES } from "./match-demands";
export { matchPropertiesToDemand } from "./match-properties";
export type { MatchPropertiesResult } from "./match-properties";
export { computeMatchScore, operationMatches, DEFAULT_CONFIG } from "./scoring";
export { evaluateLocationMatch, demandHasConcreteZones } from "./location";
export type { LocationMatchDecision, LocationMatchStatus, LocationMatchMethod } from "./location";
export { evaluateDemandCoverage, COVERAGE_MIN_SCORE } from "./coverage";
export type {
  MatchResult,
  MatchScore,
  MatchDemandsResult,
  MatchConfig,
  MatchWeights,
  LocationMatchContext,
  CriterionScore,
  PropertyForMatching,
  DemandForMatching,
  DemandCoverageResult,
} from "./types";
