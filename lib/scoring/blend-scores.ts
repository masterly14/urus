import type { ScoringResult } from "./types";
import type { AIScoringResult } from "./ai-types";

const AI_WEIGHT = parseFloat(process.env.SCORING_AI_WEIGHT ?? "0.3");

/**
 * Blends rule-based sub-scores with AI adjustments.
 *
 * The AI adjustments are applied proportionally to `aiWeight`:
 *   blended_sub = rule_sub + aiWeight * ai_adjustment
 *
 * The final score is recalculated from blended sub-scores using the same
 * weights as the original rule result (preserving weightsVersion).
 */
export function blendScores(
  ruleResult: ScoringResult,
  aiResult: AIScoringResult,
  weights: { pclose: number; value: number; urgency: number },
  aiWeight: number = AI_WEIGHT,
): ScoringResult {
  const effectiveAiWeight = clamp(aiWeight, 0, 1);

  const pclose = clamp(
    Math.round(ruleResult.pclose + effectiveAiWeight * aiResult.pcloseAdjustment),
  );
  const value = clamp(
    Math.round(ruleResult.value + effectiveAiWeight * aiResult.valueAdjustment),
  );
  const urgency = clamp(
    Math.round(ruleResult.urgency + effectiveAiWeight * aiResult.urgencyAdjustment),
  );

  const score = clamp(
    Math.round(
      weights.pclose * pclose + weights.value * value + weights.urgency * urgency,
    ),
  );

  const aiReasons = aiResult.qualitativeSignals.map((s) => `[IA] ${s}`);

  return {
    score,
    pclose,
    value,
    urgency,
    reasons: [...ruleResult.reasons, ...aiReasons],
    weightsVersion: ruleResult.weightsVersion,
  };
}

function clamp(n: number, a = 0, b = 100) {
  if (Number.isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}
