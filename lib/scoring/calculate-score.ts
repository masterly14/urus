import type { ScoringInput, ScoringResult } from "./types";
import { WEIGHT_PCLOSE, WEIGHT_VALUE, WEIGHT_URGENCY } from "./types";
import { computePoints, RANGES } from "./rules";
import { getActiveWeights } from "./weights-loader";

export async function calculateScore(input: ScoringInput): Promise<ScoringResult> {
  const weights = await getActiveWeights();
  const raw = computePoints(input);
  const ranges = RANGES[input.tipo];

  const pclose = normalize(raw.pclose, ranges.pclose.min, ranges.pclose.max);
  const value = normalize(raw.value, ranges.value.min, ranges.value.max);
  const urgency = normalize(raw.urgency, ranges.urgency.min, ranges.urgency.max);

  const score = clamp(
    Math.round(
      weights.pclose * pclose + weights.value * value + weights.urgency * urgency,
    ),
  );

  return { score, pclose, value, urgency, reasons: raw.reasons, weightsVersion: weights.version };
}

/**
 * Synchronous variant that uses static default weights.
 * Useful in tests and contexts where async is not available.
 */
export function calculateScoreSync(input: ScoringInput): ScoringResult {
  const raw = computePoints(input);
  const ranges = RANGES[input.tipo];

  const pclose = normalize(raw.pclose, ranges.pclose.min, ranges.pclose.max);
  const value = normalize(raw.value, ranges.value.min, ranges.value.max);
  const urgency = normalize(raw.urgency, ranges.urgency.min, ranges.urgency.max);

  const score = clamp(
    Math.round(
      WEIGHT_PCLOSE * pclose + WEIGHT_VALUE * value + WEIGHT_URGENCY * urgency,
    ),
  );

  return { score, pclose, value, urgency, reasons: raw.reasons, weightsVersion: null };
}

function normalize(sum: number, min: number, max: number): number {
  if (max === min) return clamp(sum, 0, 100);
  const ratio = (sum - min) / (max - min);
  return clamp(Math.round(ratio * 100));
}

function clamp(n: number, a = 0, b = 100) {
  if (Number.isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}
