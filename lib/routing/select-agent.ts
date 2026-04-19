import type { AgentProfile, RoutingInput, RoutingResult } from "./types";

/**
 * Weight for available capacity (lower load ratio = better).
 * Weight for historical conversion rate (higher = better).
 * The algorithm maximizes: w_capacity * capacityScore + w_conversion * conversionScore
 */
const W_CAPACITY = 0.6;
const W_CONVERSION = 0.4;

/**
 * Selects the best commercial agent for a lead based on:
 * 1. City match (hard filter)
 * 2. Active + not at max capacity (hard filter)
 * 3. Specialty match (soft bonus)
 * 4. Available capacity ratio (weighted)
 * 5. Historical conversion rate (weighted)
 */
export function selectBestAgent(
  agents: AgentProfile[],
  input: RoutingInput,
): RoutingResult {
  const eligible = agents.filter(
    (a) =>
      a.activo &&
      a.ciudad.toLowerCase() === input.ciudad.toLowerCase() &&
      a.cargaActual < a.cargaMaxima,
  );

  if (eligible.length === 0) {
    return {
      assigned: false,
      agent: null,
      reason: `Sin comerciales disponibles en ${input.ciudad}`,
    };
  }

  let best: AgentProfile | null = null;
  let bestScore = -Infinity;

  for (const agent of eligible) {
    const capacityScore =
      agent.cargaMaxima > 0
        ? (agent.cargaMaxima - agent.cargaActual) / agent.cargaMaxima
        : 0;

    const raw = agent.tasaConversion;
    const conversionScore = raw > 1 ? raw / 100 : raw;

    let score = W_CAPACITY * capacityScore + W_CONVERSION * conversionScore;

    if (
      input.especialidad &&
      agent.especialidad.toLowerCase() === input.especialidad.toLowerCase()
    ) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }

  return {
    assigned: true,
    agent: best,
    reason: `Asignado a ${best!.nombre} (${best!.ciudad}) — capacidad ${best!.cargaActual}/${best!.cargaMaxima}, conversión ${(best!.tasaConversion * 100).toFixed(1)}%`,
  };
}

export { W_CAPACITY, W_CONVERSION };
