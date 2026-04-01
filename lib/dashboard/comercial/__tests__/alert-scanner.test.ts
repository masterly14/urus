import { describe, it, expect } from "vitest";
import type { ComercialesDashboardRow } from "@/lib/dashboard/comercial/queries";
import {
  detectPerformanceDrop,
  detectTeamDeviation,
  type AlertCandidate,
} from "@/lib/dashboard/comercial/alert-scanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ComercialesDashboardRow> = {}): ComercialesDashboardRow {
  return {
    comercialId: "c1",
    comercialNombre: "Test Agent",
    ciudad: "Madrid",
    leadsAssigned: 20,
    leadsContacted: 15,
    leadsLostNoFollowUp: 2,
    visits: 10,
    closings: 3,
    grossVolumeEur: 900_000,
    estimatedRevenueEur: 27_000,
    avgCloseDays: 30,
    conversionLeadToVisit: 0.50,
    conversionVisitToClose: 0.30,
    revenuePerOperationEur: 9_000,
    revenuePerLeadAssignedEur: 1_350,
    lostLeadRate: 0.10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectPerformanceDrop
// ---------------------------------------------------------------------------

describe("detectPerformanceDrop", () => {
  const THRESHOLD = 0.30;

  it("returns empty when no drops exceed threshold", () => {
    const recent = [makeRow({ comercialId: "c1", estimatedRevenueEur: 25_000 })];
    const baseline = [makeRow({ comercialId: "c1", estimatedRevenueEur: 27_000 })];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(0);
  });

  it("detects a single metric drop as severity medium", () => {
    const recent = [makeRow({ comercialId: "c1", estimatedRevenueEur: 10_000 })];
    const baseline = [makeRow({ comercialId: "c1", estimatedRevenueEur: 27_000 })];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("medium");
    expect(result[0].type).toBe("drop");
    expect(result[0].comercialId).toBe("c1");
  });

  it("detects multi-metric drop as severity high", () => {
    const recent = [makeRow({
      comercialId: "c1",
      estimatedRevenueEur: 5_000,
      conversionLeadToVisit: 0.10,
    })];
    const baseline = [makeRow({
      comercialId: "c1",
      estimatedRevenueEur: 27_000,
      conversionLeadToVisit: 0.50,
    })];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("high");
    const drops = result[0].details.drops as Array<{ metric: string }>;
    expect(drops.length).toBeGreaterThanOrEqual(2);
  });

  it("skips comercial with no baseline data", () => {
    const recent = [makeRow({ comercialId: "c1", estimatedRevenueEur: 5_000 })];
    const baseline = [makeRow({ comercialId: "other" })];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(0);
  });

  it("ignores zero baseline (no division-by-zero)", () => {
    const recent = [makeRow({ comercialId: "c1", estimatedRevenueEur: 0 })];
    const baseline = [makeRow({ comercialId: "c1", estimatedRevenueEur: 0 })];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(0);
  });

  it("detects activity (leads+visits) drop", () => {
    const recent = [makeRow({ comercialId: "c1", leadsAssigned: 2, visits: 1 })];
    const baseline = [makeRow({ comercialId: "c1", leadsAssigned: 20, visits: 10 })];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(1);
    const drops = result[0].details.drops as Array<{ metric: string }>;
    expect(drops.some((d) => d.metric === "activity")).toBe(true);
  });

  it("handles multiple comerciales independently", () => {
    const recent = [
      makeRow({ comercialId: "c1", estimatedRevenueEur: 5_000 }),
      makeRow({ comercialId: "c2", estimatedRevenueEur: 26_000 }),
    ];
    const baseline = [
      makeRow({ comercialId: "c1", estimatedRevenueEur: 27_000 }),
      makeRow({ comercialId: "c2", estimatedRevenueEur: 27_000 }),
    ];
    const result = detectPerformanceDrop(recent, baseline, THRESHOLD);
    expect(result).toHaveLength(1);
    expect(result[0].comercialId).toBe("c1");
  });
});

// ---------------------------------------------------------------------------
// detectTeamDeviation
// ---------------------------------------------------------------------------

describe("detectTeamDeviation", () => {
  const Z_THRESHOLD = 1.5;
  const MIN_LEADS = 3;

  it("returns empty when fewer than 2 eligible comerciales", () => {
    const rows = [makeRow({ comercialId: "c1", leadsAssigned: 5 })];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    expect(result).toHaveLength(0);
  });

  it("returns empty when all comerciales are similar", () => {
    const rows = [
      makeRow({ comercialId: "c1", conversionLeadToVisit: 0.30, leadsAssigned: 10 }),
      makeRow({ comercialId: "c2", conversionLeadToVisit: 0.32, leadsAssigned: 10 }),
      makeRow({ comercialId: "c3", conversionLeadToVisit: 0.28, leadsAssigned: 10 }),
    ];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    expect(result).toHaveLength(0);
  });

  it("detects significant negative deviation in conversion", () => {
    const rows = [
      makeRow({ comercialId: "c1", conversionLeadToVisit: 0.50, leadsAssigned: 10 }),
      makeRow({ comercialId: "c2", conversionLeadToVisit: 0.48, leadsAssigned: 10 }),
      makeRow({ comercialId: "c3", conversionLeadToVisit: 0.45, leadsAssigned: 10 }),
      makeRow({ comercialId: "c4", conversionLeadToVisit: 0.05, leadsAssigned: 10 }),
    ];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    const c4Alert = result.find((a) => a.comercialId === "c4");
    expect(c4Alert).toBeDefined();
    expect(c4Alert!.type).toBe("deviation");
  });

  it("detects high lostLeadRate as deviation (inverted metric)", () => {
    const rows = [
      makeRow({ comercialId: "c1", lostLeadRate: 0.05, leadsAssigned: 10 }),
      makeRow({ comercialId: "c2", lostLeadRate: 0.08, leadsAssigned: 10 }),
      makeRow({ comercialId: "c3", lostLeadRate: 0.06, leadsAssigned: 10 }),
      makeRow({ comercialId: "bad", lostLeadRate: 0.70, leadsAssigned: 10 }),
    ];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    const badAlert = result.find((a) => a.comercialId === "bad");
    expect(badAlert).toBeDefined();
  });

  it("escalates to high severity when multiple metrics deviate", () => {
    const rows = [
      makeRow({
        comercialId: "c1",
        conversionLeadToVisit: 0.50,
        conversionVisitToClose: 0.30,
        revenuePerLeadAssignedEur: 1500,
        lostLeadRate: 0.05,
        leadsAssigned: 10,
      }),
      makeRow({
        comercialId: "c2",
        conversionLeadToVisit: 0.48,
        conversionVisitToClose: 0.28,
        revenuePerLeadAssignedEur: 1400,
        lostLeadRate: 0.06,
        leadsAssigned: 10,
      }),
      makeRow({
        comercialId: "c3",
        conversionLeadToVisit: 0.45,
        conversionVisitToClose: 0.26,
        revenuePerLeadAssignedEur: 1300,
        lostLeadRate: 0.07,
        leadsAssigned: 10,
      }),
      makeRow({
        comercialId: "outlier",
        conversionLeadToVisit: 0.02,
        conversionVisitToClose: 0.01,
        revenuePerLeadAssignedEur: 10,
        lostLeadRate: 0.80,
        leadsAssigned: 10,
      }),
    ];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    const outlierAlert = result.find((a) => a.comercialId === "outlier");
    expect(outlierAlert).toBeDefined();
    expect(outlierAlert!.severity).toBe("high");
  });

  it("excludes comerciales below minLeads", () => {
    const rows = [
      makeRow({ comercialId: "c1", conversionLeadToVisit: 0.50, leadsAssigned: 10 }),
      makeRow({ comercialId: "c2", conversionLeadToVisit: 0.48, leadsAssigned: 10 }),
      makeRow({ comercialId: "few", conversionLeadToVisit: 0.01, leadsAssigned: 2 }),
    ];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    const fewAlert = result.find((a) => a.comercialId === "few");
    expect(fewAlert).toBeUndefined();
  });

  it("aggregates multiple deviating metrics into one alert per comercial", () => {
    const rows = [
      makeRow({
        comercialId: "c1",
        conversionLeadToVisit: 0.50,
        revenuePerLeadAssignedEur: 1500,
        leadsAssigned: 10,
      }),
      makeRow({
        comercialId: "c2",
        conversionLeadToVisit: 0.48,
        revenuePerLeadAssignedEur: 1400,
        leadsAssigned: 10,
      }),
      makeRow({
        comercialId: "c3",
        conversionLeadToVisit: 0.45,
        revenuePerLeadAssignedEur: 1300,
        leadsAssigned: 10,
      }),
      makeRow({
        comercialId: "bad",
        conversionLeadToVisit: 0.02,
        revenuePerLeadAssignedEur: 10,
        leadsAssigned: 10,
      }),
    ];
    const result = detectTeamDeviation(rows, Z_THRESHOLD, MIN_LEADS);
    const badAlerts = result.filter((a) => a.comercialId === "bad");
    expect(badAlerts).toHaveLength(1);
    const deviating = badAlerts[0].details.deviatingMetrics as string[];
    expect(deviating.length).toBeGreaterThanOrEqual(2);
  });
});
