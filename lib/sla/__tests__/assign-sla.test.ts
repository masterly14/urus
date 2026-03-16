import { describe, it, expect } from "vitest";
import { assignSla } from "@/lib/sla";

describe("assignSla", () => {
  it("score >= 80 => CRITICAL, <5min, notifyImmediately, no cadence", () => {
    const result = assignSla(85);
    expect(result.sla.level).toBe("CRITICAL");
    expect(result.sla.maxResponseMs).toBe(5 * 60_000);
    expect(result.notifyImmediately).toBe(true);
    expect(result.followUpCadence).toBeNull();
  });

  it("score 80 (boundary) => CRITICAL", () => {
    const result = assignSla(80);
    expect(result.sla.level).toBe("CRITICAL");
    expect(result.notifyImmediately).toBe(true);
  });

  it("score 60-79 => HIGH, <30min", () => {
    const result = assignSla(65);
    expect(result.sla.level).toBe("HIGH");
    expect(result.sla.maxResponseMs).toBe(30 * 60_000);
    expect(result.notifyImmediately).toBe(true);
    expect(result.followUpCadence).toBeNull();
  });

  it("score 60 (boundary) => HIGH", () => {
    const result = assignSla(60);
    expect(result.sla.level).toBe("HIGH");
  });

  it("score 40-59 => MEDIUM, <2h", () => {
    const result = assignSla(50);
    expect(result.sla.level).toBe("MEDIUM");
    expect(result.sla.maxResponseMs).toBe(2 * 3_600_000);
    expect(result.notifyImmediately).toBe(true);
    expect(result.followUpCadence).toBeNull();
  });

  it("score 40 (boundary) => MEDIUM", () => {
    const result = assignSla(40);
    expect(result.sla.level).toBe("MEDIUM");
  });

  it("score < 40 => LOW, cadencia D+1/D+3/D+7, no notify immediately", () => {
    const result = assignSla(20);
    expect(result.sla.level).toBe("LOW");
    expect(result.sla.maxResponseMs).toBe(Infinity);
    expect(result.notifyImmediately).toBe(false);
    expect(result.followUpCadence).not.toBeNull();
    expect(result.followUpCadence).toHaveLength(3);
    expect(result.followUpCadence![0].label).toBe("D+1");
    expect(result.followUpCadence![1].label).toBe("D+3");
    expect(result.followUpCadence![2].label).toBe("D+7");
  });

  it("score 0 => LOW", () => {
    const result = assignSla(0);
    expect(result.sla.level).toBe("LOW");
    expect(result.notifyImmediately).toBe(false);
  });

  it("score 39 (boundary) => LOW", () => {
    const result = assignSla(39);
    expect(result.sla.level).toBe("LOW");
  });

  it("score 100 => CRITICAL", () => {
    const result = assignSla(100);
    expect(result.sla.level).toBe("CRITICAL");
  });

  it("preserves score in result", () => {
    const result = assignSla(72);
    expect(result.score).toBe(72);
  });
});
