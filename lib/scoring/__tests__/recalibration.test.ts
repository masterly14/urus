import { describe, it, expect } from "vitest";
import {
  fitLogisticRegression,
  normalizeCoefficients,
  brierScore,
  computeAccuracy,
} from "../recalibration";
import type { LabeledSample } from "../recalibration";

function makeSamples(): LabeledSample[] {
  return [
    { pclose: 90, value: 80, urgency: 70, closed: true },
    { pclose: 85, value: 75, urgency: 60, closed: true },
    { pclose: 70, value: 60, urgency: 50, closed: true },
    { pclose: 60, value: 50, urgency: 40, closed: false },
    { pclose: 30, value: 20, urgency: 10, closed: false },
    { pclose: 20, value: 15, urgency: 5, closed: false },
    { pclose: 10, value: 10, urgency: 5, closed: false },
    { pclose: 80, value: 70, urgency: 65, closed: true },
    { pclose: 15, value: 10, urgency: 10, closed: false },
    { pclose: 50, value: 40, urgency: 30, closed: false },
  ];
}

describe("fitLogisticRegression", () => {
  it("produces non-zero weights from valid samples", () => {
    const samples = makeSamples();
    const { w1, w2, w3 } = fitLogisticRegression(samples);

    expect(w1).not.toBe(0);
    expect(w2).not.toBe(0);
    expect(w3).not.toBe(0);
  });

  it("produces weights that sum to ~1 after normalization", () => {
    const samples = makeSamples();
    const { w1, w2, w3 } = fitLogisticRegression(samples);
    const normalized = normalizeCoefficients(w1, w2, w3);

    const sum = normalized.pclose + normalized.value + normalized.urgency;
    expect(sum).toBeCloseTo(1, 1);
    expect(normalized.pclose).toBeGreaterThan(0);
    expect(normalized.value).toBeGreaterThan(0);
    expect(normalized.urgency).toBeGreaterThan(0);
  });
});

describe("normalizeCoefficients", () => {
  it("weights sum to ~1.0", () => {
    const result = normalizeCoefficients(0.8, 0.4, 0.2);
    const sum = result.pclose + result.value + result.urgency;
    expect(sum).toBeCloseTo(1, 1);
  });

  it("handles all-zero coefficients by returning defaults", () => {
    const result = normalizeCoefficients(0, 0, 0);
    expect(result.pclose).toBe(0.55);
    expect(result.value).toBe(0.3);
    expect(result.urgency).toBe(0.15);
  });

  it("uses absolute values (negative coefficients become positive weights)", () => {
    const result = normalizeCoefficients(-0.6, 0.3, 0.1);
    expect(result.pclose).toBeGreaterThan(0);
    expect(result.value).toBeGreaterThan(0);
    expect(result.urgency).toBeGreaterThan(0);
  });
});

describe("brierScore", () => {
  it("returns 0 for perfect predictions", () => {
    const samples: LabeledSample[] = [
      { pclose: 100, value: 100, urgency: 100, closed: true },
      { pclose: 0, value: 0, urgency: 0, closed: false },
    ];

    const weights = { pclose: 0.34, value: 0.33, urgency: 0.33 };
    const score = brierScore(samples, weights);
    expect(score).toBeLessThan(0.01);
  });

  it("returns 1 for empty samples", () => {
    expect(brierScore([], { pclose: 0.55, value: 0.3, urgency: 0.15 })).toBe(1);
  });

  it("lower is better — good weights score lower than bad weights", () => {
    const samples = makeSamples();

    const goodWeights = { pclose: 0.55, value: 0.3, urgency: 0.15 };
    const badWeights = { pclose: 0.1, value: 0.1, urgency: 0.8 };

    const goodScore = brierScore(samples, goodWeights);
    const badScore = brierScore(samples, badWeights);

    expect(goodScore).toBeLessThanOrEqual(badScore);
  });
});

describe("computeAccuracy", () => {
  it("returns 1.0 for perfectly separable data", () => {
    const samples: LabeledSample[] = [
      { pclose: 80, value: 70, urgency: 60, closed: true },
      { pclose: 10, value: 10, urgency: 10, closed: false },
    ];

    const acc = computeAccuracy(samples, { pclose: 0.55, value: 0.3, urgency: 0.15 });
    expect(acc).toBe(1);
  });

  it("returns 0 for empty samples", () => {
    expect(computeAccuracy([], { pclose: 0.55, value: 0.3, urgency: 0.15 })).toBe(0);
  });
});
