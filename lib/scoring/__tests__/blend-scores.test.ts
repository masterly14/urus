import { describe, it, expect } from "vitest";
import { blendScores } from "../blend-scores";
import type { ScoringResult } from "../types";
import type { AIScoringResult } from "../ai-types";

const baseRule: ScoringResult = {
  score: 75,
  pclose: 80,
  value: 60,
  urgency: 50,
  reasons: ["Preaprobación +25"],
  weightsVersion: null,
};

const defaultWeights = { pclose: 0.55, value: 0.3, urgency: 0.15 };

describe("blendScores", () => {
  it("no-op when aiWeight is 0", () => {
    const ai: AIScoringResult = {
      pcloseAdjustment: 20,
      valueAdjustment: 10,
      urgencyAdjustment: 5,
      qualitativeSignals: ["señal"],
      confidence: 0.9,
      reasoning: "test",
    };

    const result = blendScores(baseRule, ai, defaultWeights, 0);
    expect(result.pclose).toBe(baseRule.pclose);
    expect(result.value).toBe(baseRule.value);
    expect(result.urgency).toBe(baseRule.urgency);
  });

  it("applies full adjustments when aiWeight is 1", () => {
    const ai: AIScoringResult = {
      pcloseAdjustment: 10,
      valueAdjustment: -20,
      urgencyAdjustment: 15,
      qualitativeSignals: [],
      confidence: 0.8,
      reasoning: "test",
    };

    const result = blendScores(baseRule, ai, defaultWeights, 1);
    expect(result.pclose).toBe(90);
    expect(result.value).toBe(40);
    expect(result.urgency).toBe(65);
  });

  it("blends proportionally at 0.3", () => {
    const ai: AIScoringResult = {
      pcloseAdjustment: 10,
      valueAdjustment: 0,
      urgencyAdjustment: 0,
      qualitativeSignals: [],
      confidence: 0.5,
      reasoning: "test",
    };

    const result = blendScores(baseRule, ai, defaultWeights, 0.3);
    expect(result.pclose).toBe(83); // 80 + 0.3*10 = 83
  });

  it("clamps sub-scores to 0-100", () => {
    const highRule: ScoringResult = {
      ...baseRule,
      pclose: 95,
      value: 5,
    };

    const ai: AIScoringResult = {
      pcloseAdjustment: 30,
      valueAdjustment: -30,
      urgencyAdjustment: 0,
      qualitativeSignals: [],
      confidence: 1,
      reasoning: "test",
    };

    const result = blendScores(highRule, ai, defaultWeights, 1);
    expect(result.pclose).toBe(100);
    expect(result.value).toBe(0);
  });

  it("includes AI signals prefixed with [IA]", () => {
    const ai: AIScoringResult = {
      pcloseAdjustment: 0,
      valueAdjustment: 0,
      urgencyAdjustment: 0,
      qualitativeSignals: ["Urgencia implícita en el tono"],
      confidence: 0.7,
      reasoning: "test",
    };

    const result = blendScores(baseRule, ai, defaultWeights, 0.3);
    expect(result.reasons).toContain("[IA] Urgencia implícita en el tono");
    expect(result.reasons).toContain("Preaprobación +25");
  });

  it("preserves weightsVersion from ruleResult", () => {
    const ruleWithVersion: ScoringResult = { ...baseRule, weightsVersion: 3 };
    const ai: AIScoringResult = {
      pcloseAdjustment: 0,
      valueAdjustment: 0,
      urgencyAdjustment: 0,
      qualitativeSignals: [],
      confidence: 0.5,
      reasoning: "test",
    };

    const result = blendScores(ruleWithVersion, ai, defaultWeights, 0.3);
    expect(result.weightsVersion).toBe(3);
  });
});
