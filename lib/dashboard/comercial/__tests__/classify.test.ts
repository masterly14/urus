import { describe, it, expect } from "vitest";
import type { ComercialesDashboardRow } from "@/lib/dashboard/comercial/queries";
import {
  computeTeamAverages,
  computeHotLeadBias,
  classifyComercial,
  classifyTeam,
  type TeamAverages,
  type LeadScoreStats,
  type ClassificationResult,
} from "@/lib/dashboard/comercial/classify";

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

function makeTeam(): TeamAverages {
  return {
    conversionLV: 0.30,
    conversionVC: 0.20,
    revenuePerLead: 800,
    revenuePerOperation: 6_000,
    lostLeadRate: 0.20,
    avgCloseDays: 35,
    leadsAssigned: 15,
    visits: 8,
  };
}

const DEFAULT_CONFIG = {
  minLeads: 3,
  topMinConvLV: 0.10,
  topMinConvVC: 0.15,
  hotLeadBiasThreshold: 1.5,
};

// ---------------------------------------------------------------------------
// computeTeamAverages
// ---------------------------------------------------------------------------

describe("computeTeamAverages", () => {
  it("returns zeros when no rows meet minLeads", () => {
    const rows = [makeRow({ leadsAssigned: 1 }), makeRow({ leadsAssigned: 2 })];
    const result = computeTeamAverages(rows, 3);
    expect(result.conversionLV).toBe(0);
    expect(result.visits).toBe(0);
    expect(result.avgCloseDays).toBeNull();
  });

  it("computes averages only from eligible rows", () => {
    const eligible = makeRow({
      comercialId: "c1",
      leadsAssigned: 10,
      conversionLeadToVisit: 0.40,
      conversionVisitToClose: 0.25,
      visits: 4,
    });
    const ineligible = makeRow({
      comercialId: "c2",
      leadsAssigned: 2,
      conversionLeadToVisit: 1.0,
      conversionVisitToClose: 1.0,
      visits: 100,
    });
    const result = computeTeamAverages([eligible, ineligible], 3);
    expect(result.conversionLV).toBeCloseTo(0.40);
    expect(result.visits).toBe(4);
  });

  it("averages close days excluding null/zero values", () => {
    const r1 = makeRow({ comercialId: "c1", avgCloseDays: 20, leadsAssigned: 5 });
    const r2 = makeRow({ comercialId: "c2", avgCloseDays: null, leadsAssigned: 5 });
    const r3 = makeRow({ comercialId: "c3", avgCloseDays: 40, leadsAssigned: 5 });
    const result = computeTeamAverages([r1, r2, r3], 3);
    expect(result.avgCloseDays).toBeCloseTo(30);
  });
});

// ---------------------------------------------------------------------------
// computeHotLeadBias
// ---------------------------------------------------------------------------

describe("computeHotLeadBias", () => {
  it("returns 0 when stats are undefined", () => {
    expect(computeHotLeadBias(undefined)).toBe(0);
  });

  it("returns 0 when no high-score leads exist", () => {
    const stats: LeadScoreStats = {
      comercialId: "c1",
      totalLeads: 10,
      highScoreLeads: 0,
      contactedTotal: 5,
      contactedHighScore: 0,
    };
    expect(computeHotLeadBias(stats)).toBe(0);
  });

  it("returns 1 when contact pattern matches base distribution", () => {
    const stats: LeadScoreStats = {
      comercialId: "c1",
      totalLeads: 20,
      highScoreLeads: 5,
      contactedTotal: 10,
      contactedHighScore: 2,
    };
    const bias = computeHotLeadBias(stats);
    expect(bias).toBeCloseTo(0.8);
  });

  it("returns > 1.5 when comercial preferentially contacts high-score leads", () => {
    const stats: LeadScoreStats = {
      comercialId: "c1",
      totalLeads: 20,
      highScoreLeads: 5,
      contactedTotal: 8,
      contactedHighScore: 5,
    };
    const bias = computeHotLeadBias(stats);
    expect(bias).toBeGreaterThan(1.5);
  });
});

// ---------------------------------------------------------------------------
// classifyComercial — sin_datos_suficientes
// ---------------------------------------------------------------------------

describe("classifyComercial — sin_datos_suficientes", () => {
  it("classifies as sin_datos_suficientes when leads < minLeads", () => {
    const row = makeRow({ leadsAssigned: 2 });
    const result = classifyComercial(row, makeTeam(), undefined, DEFAULT_CONFIG);
    expect(result.profile).toBe("sin_datos_suficientes");
    expect(result.confidence).toBe(1);
  });

  it("exactly at minLeads proceeds to classification", () => {
    const row = makeRow({ leadsAssigned: 3 });
    const result = classifyComercial(row, makeTeam(), undefined, DEFAULT_CONFIG);
    expect(result.profile).not.toBe("sin_datos_suficientes");
  });
});

// ---------------------------------------------------------------------------
// classifyComercial — top_performer
// ---------------------------------------------------------------------------

describe("classifyComercial — top_performer", () => {
  it("classifies as top_performer when all metrics are above average", () => {
    const row = makeRow({
      conversionLeadToVisit: 0.50,
      conversionVisitToClose: 0.35,
      revenuePerLeadAssignedEur: 1_500,
      lostLeadRate: 0.05,
      leadsAssigned: 15,
      visits: 8,
    });
    const team = makeTeam();
    const result = classifyComercial(row, team, undefined, DEFAULT_CONFIG);
    expect(result.profile).toBe("top_performer");
    expect(result.scores.top_performer).toBeGreaterThan(0);
  });

  it("does not classify as top_performer when convLV below absolute minimum", () => {
    const row = makeRow({
      conversionLeadToVisit: 0.08,
      conversionVisitToClose: 0.35,
    });
    const team = makeTeam();
    const result = classifyComercial(row, team, undefined, DEFAULT_CONFIG);
    expect(result.profile).not.toBe("top_performer");
    expect(result.scores.top_performer).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyComercial — productivo_ineficiente
// ---------------------------------------------------------------------------

describe("classifyComercial — productivo_ineficiente", () => {
  it("classifies as productivo_ineficiente: lots of activity, poor conversion", () => {
    const row = makeRow({
      leadsAssigned: 30,
      visits: 20,
      conversionLeadToVisit: 0.25,
      conversionVisitToClose: 0.05,
      closings: 1,
      revenuePerLeadAssignedEur: 400,
      revenuePerOperationEur: 5_000,
      estimatedRevenueEur: 5_000,
      lostLeadRate: 0.10,
    });
    const team = makeTeam();
    const result = classifyComercial(row, team, undefined, DEFAULT_CONFIG);
    expect(result.profile).toBe("productivo_ineficiente");
  });
});

// ---------------------------------------------------------------------------
// classifyComercial — dependiente_lead_caliente
// ---------------------------------------------------------------------------

describe("classifyComercial — dependiente_lead_caliente", () => {
  it("classifies when high hot-lead contact bias detected", () => {
    const row = makeRow({
      leadsAssigned: 20,
      conversionLeadToVisit: 0.15,
      conversionVisitToClose: 0.25,
      revenuePerOperationEur: 15_000,
      revenuePerLeadAssignedEur: 500,
      lostLeadRate: 0.40,
      visits: 3,
      closings: 1,
    });
    const team = makeTeam();
    const hotLeadStats: LeadScoreStats = {
      comercialId: "c1",
      totalLeads: 20,
      highScoreLeads: 5,
      contactedTotal: 6,
      contactedHighScore: 5,
    };
    const result = classifyComercial(row, team, hotLeadStats, DEFAULT_CONFIG);
    expect(result.profile).toBe("dependiente_lead_caliente");
  });
});

// ---------------------------------------------------------------------------
// classifyComercial — bajo_rendimiento_estructural
// ---------------------------------------------------------------------------

describe("classifyComercial — bajo_rendimiento_estructural", () => {
  it("classifies when all metrics are below average with low activity", () => {
    const row = makeRow({
      leadsAssigned: 8,
      conversionLeadToVisit: 0.05,
      conversionVisitToClose: 0.05,
      visits: 1,
      closings: 0,
      estimatedRevenueEur: 0,
      revenuePerOperationEur: 0,
      revenuePerLeadAssignedEur: 0,
      lostLeadRate: 0.60,
      avgCloseDays: null,
    });
    const team = makeTeam();
    const result = classifyComercial(row, team, undefined, DEFAULT_CONFIG);
    expect(result.profile).toBe("bajo_rendimiento_estructural");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("classifyComercial — edge cases", () => {
  it("single-person team: compares to self (no division by zero)", () => {
    const row = makeRow({ leadsAssigned: 10 });
    const team = computeTeamAverages([row], 3);
    const result = classifyComercial(row, team, undefined, DEFAULT_CONFIG);
    expect(result.profile).toBeDefined();
    expect(["top_performer", "sin_datos_suficientes"]).toContain(result.profile);
  });

  it("all comerciales have 0 closings", () => {
    const r1 = makeRow({
      comercialId: "c1",
      closings: 0,
      estimatedRevenueEur: 0,
      revenuePerOperationEur: 0,
      revenuePerLeadAssignedEur: 0,
      conversionVisitToClose: 0,
      leadsAssigned: 10,
      conversionLeadToVisit: 0.10,
      lostLeadRate: 0.30,
    });
    const r2 = makeRow({
      comercialId: "c2",
      closings: 0,
      estimatedRevenueEur: 0,
      revenuePerOperationEur: 0,
      revenuePerLeadAssignedEur: 0,
      conversionVisitToClose: 0,
      leadsAssigned: 10,
      conversionLeadToVisit: 0.15,
      lostLeadRate: 0.25,
    });
    const team = computeTeamAverages([r1, r2], 3);
    const result1 = classifyComercial(r1, team, undefined, DEFAULT_CONFIG);
    const result2 = classifyComercial(r2, team, undefined, DEFAULT_CONFIG);
    expect(result1.profile).toBeDefined();
    expect(result2.profile).toBeDefined();
  });

  it("confidence is between 0 and 1 for classified profiles", () => {
    const row = makeRow({ leadsAssigned: 10 });
    const team = makeTeam();
    const result = classifyComercial(row, team, undefined, DEFAULT_CONFIG);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// classifyTeam (batch)
// ---------------------------------------------------------------------------

describe("classifyTeam", () => {
  it("classifies all rows in a team", () => {
    const rows = [
      makeRow({ comercialId: "top", conversionLeadToVisit: 0.50, conversionVisitToClose: 0.35, revenuePerLeadAssignedEur: 1500, lostLeadRate: 0.05 }),
      makeRow({ comercialId: "inef", leadsAssigned: 30, visits: 15, conversionLeadToVisit: 0.10, conversionVisitToClose: 0.05, revenuePerLeadAssignedEur: 100, lostLeadRate: 0.30 }),
      makeRow({ comercialId: "bajo", conversionLeadToVisit: 0.05, conversionVisitToClose: 0.05, lostLeadRate: 0.60, revenuePerLeadAssignedEur: 0 }),
      makeRow({ comercialId: "few", leadsAssigned: 1 }),
    ];

    const statsMap = new Map<string, LeadScoreStats>();
    const classified = classifyTeam(rows, statsMap, DEFAULT_CONFIG);

    expect(classified).toHaveLength(4);
    expect(classified.every((r) => r.classification)).toBe(true);

    const fewData = classified.find((r) => r.comercialId === "few");
    expect(fewData?.classification.profile).toBe("sin_datos_suficientes");
  });

  it("returns classifications with all required fields", () => {
    const rows = [makeRow({ comercialId: "c1", leadsAssigned: 10 })];
    const classified = classifyTeam(rows, new Map(), DEFAULT_CONFIG);

    const c = classified[0].classification;
    expect(c).toHaveProperty("profile");
    expect(c).toHaveProperty("confidence");
    expect(c).toHaveProperty("scores");
    expect(c.scores).toHaveProperty("top_performer");
    expect(c.scores).toHaveProperty("productivo_ineficiente");
    expect(c.scores).toHaveProperty("dependiente_lead_caliente");
    expect(c.scores).toHaveProperty("bajo_rendimiento_estructural");
  });
});
