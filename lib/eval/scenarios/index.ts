import type { EvalScenario, EvalScenarioCategory } from "../types";
import { PROPERTY_RESOLUTION_SCENARIOS } from "./property-resolution";
import { SENTIMENT_ACCURACY_SCENARIOS } from "./sentiment-accuracy";
import { VARIABLE_EXTRACTION_SCENARIOS } from "./variable-extraction";
import { WANTS_MORE_SCENARIOS } from "./wants-more";
import { MULTI_TURN_SCENARIOS } from "./multi-turn";
import { AMBIGUITY_SCENARIOS } from "./ambiguity";
import { EDGE_CASE_SCENARIOS } from "./edge-cases";

export const ALL_SCENARIOS: EvalScenario[] = [
  ...PROPERTY_RESOLUTION_SCENARIOS,
  ...SENTIMENT_ACCURACY_SCENARIOS,
  ...VARIABLE_EXTRACTION_SCENARIOS,
  ...WANTS_MORE_SCENARIOS,
  ...MULTI_TURN_SCENARIOS,
  ...AMBIGUITY_SCENARIOS,
  ...EDGE_CASE_SCENARIOS,
];

export function filterByCategory(category: EvalScenarioCategory): EvalScenario[] {
  return ALL_SCENARIOS.filter((s) => s.category === category);
}

export function filterByPersona(personaId: string): EvalScenario[] {
  return ALL_SCENARIOS.filter((s) => s.persona.id === personaId);
}

export { MOCK_PROPERTIES, MOCK_PROPERTIES_CORDOBA } from "./mock-properties";
