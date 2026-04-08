import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectEnergyDropFromRows,
  detectRecurrentBlockFromRows,
  detectOverloadFromRows,
  deduplicateMentalHealthAlerts,
  type EnergyDropRow,
  type RecurrentBlockRow,
  type OverloadRow,
  type MentalHealthAlertCandidate,
} from "@/lib/dashboard/mental-health/alert-scanner";

// ---------------------------------------------------------------------------
// Mock Prisma (solo necesario para deduplicateMentalHealthAlerts)
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dashboardAlert: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnergyRow(overrides: Partial<EnergyDropRow> = {}): EnergyDropRow {
  return {
    comercialId: "c1",
    comercialNombre: "Agente Test",
    lowEnergyCount: 3,
    avgEnergia: 1.8,
    ...overrides,
  };
}

function makeBlockRow(overrides: Partial<RecurrentBlockRow> = {}): RecurrentBlockRow {
  return {
    comercialId: "c1",
    comercialNombre: "Agente Test",
    blockCount: 3,
    subtipos: ["miedo", "fatiga"],
    ...overrides,
  };
}

function makeOverloadRow(overrides: Partial<OverloadRow> = {}): OverloadRow {
  return {
    comercialId: "c1",
    comercialNombre: "Agente Test",
    sessionCount: 5,
    avgEnergia: 2.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectEnergyDropFromRows
// ---------------------------------------------------------------------------

describe("detectEnergyDropFromRows", () => {
  const THRESHOLD = 3;
  const LOOKBACK = 14;

  it("returns empty array when no rows provided", () => {
    expect(detectEnergyDropFromRows([], THRESHOLD, LOOKBACK)).toHaveLength(0);
  });

  it("returns empty when count is below threshold", () => {
    const rows = [makeEnergyRow({ lowEnergyCount: 2 })];
    expect(detectEnergyDropFromRows(rows, THRESHOLD, LOOKBACK)).toHaveLength(0);
  });

  it("generates alert when count equals threshold", () => {
    const rows = [makeEnergyRow({ lowEnergyCount: 3 })];
    const result = detectEnergyDropFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("energy_drop");
    expect(result[0].comercialId).toBe("c1");
    expect(result[0].severity).toBe("medium");
  });

  it("escalates to high severity when count >= 2x threshold", () => {
    const rows = [makeEnergyRow({ lowEnergyCount: 6 })];
    const result = detectEnergyDropFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].severity).toBe("high");
  });

  it("includes avgEnergia as currentValue", () => {
    const rows = [makeEnergyRow({ lowEnergyCount: 4, avgEnergia: 1.5 })];
    const result = detectEnergyDropFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].currentValue).toBe(1.5);
  });

  it("populates details with lowEnergySessionCount and lookbackDays", () => {
    const rows = [makeEnergyRow({ lowEnergyCount: 4 })];
    const result = detectEnergyDropFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].details.lowEnergySessionCount).toBe(4);
    expect(result[0].details.lookbackDays).toBe(LOOKBACK);
  });

  it("handles multiple comerciales independently", () => {
    const rows = [
      makeEnergyRow({ comercialId: "c1", lowEnergyCount: 5 }),
      makeEnergyRow({ comercialId: "c2", lowEnergyCount: 1 }),
      makeEnergyRow({ comercialId: "c3", lowEnergyCount: 3 }),
    ];
    const result = detectEnergyDropFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.comercialId);
    expect(ids).toContain("c1");
    expect(ids).toContain("c3");
    expect(ids).not.toContain("c2");
  });
});

// ---------------------------------------------------------------------------
// detectRecurrentBlockFromRows
// ---------------------------------------------------------------------------

describe("detectRecurrentBlockFromRows", () => {
  const THRESHOLD = 3;
  const LOOKBACK = 14;

  it("returns empty array when no rows provided", () => {
    expect(detectRecurrentBlockFromRows([], THRESHOLD, LOOKBACK)).toHaveLength(0);
  });

  it("returns empty when count is below threshold", () => {
    const rows = [makeBlockRow({ blockCount: 2 })];
    expect(detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK)).toHaveLength(0);
  });

  it("generates alert when count equals threshold", () => {
    const rows = [makeBlockRow({ blockCount: 3 })];
    const result = detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("recurrent_block");
    expect(result[0].severity).toBe("medium");
  });

  it("escalates to high severity when count >= 2x threshold", () => {
    const rows = [makeBlockRow({ blockCount: 6 })];
    const result = detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].severity).toBe("high");
  });

  it("includes subtipos in message when present", () => {
    const rows = [makeBlockRow({ subtipos: ["miedo", "fatiga"] })];
    const result = detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].message).toContain("miedo");
    expect(result[0].message).toContain("fatiga");
  });

  it("handles empty subtipos gracefully", () => {
    const rows = [makeBlockRow({ subtipos: [] })];
    const result = detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result).toHaveLength(1);
    expect(result[0].message).not.toContain("(");
  });

  it("sets currentValue to blockCount", () => {
    const rows = [makeBlockRow({ blockCount: 4 })];
    const result = detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].currentValue).toBe(4);
  });

  it("populates details with subtipos array", () => {
    const rows = [makeBlockRow({ subtipos: ["ego"] })];
    const result = detectRecurrentBlockFromRows(rows, THRESHOLD, LOOKBACK);
    expect(result[0].details.subtipos).toEqual(["ego"]);
  });
});

// ---------------------------------------------------------------------------
// detectOverloadFromRows
// ---------------------------------------------------------------------------

describe("detectOverloadFromRows", () => {
  const OVERLOAD_SESSIONS = 5;
  const LOOKBACK = 7;

  it("returns empty array when no rows provided", () => {
    expect(detectOverloadFromRows([], OVERLOAD_SESSIONS, LOOKBACK)).toHaveLength(0);
  });

  it("returns empty when session count is below threshold", () => {
    const rows = [makeOverloadRow({ sessionCount: 4 })];
    expect(detectOverloadFromRows(rows, OVERLOAD_SESSIONS, LOOKBACK)).toHaveLength(0);
  });

  it("generates high severity alert when count equals threshold", () => {
    const rows = [makeOverloadRow({ sessionCount: 5 })];
    const result = detectOverloadFromRows(rows, OVERLOAD_SESSIONS, LOOKBACK);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("overload");
    expect(result[0].severity).toBe("high");
  });

  it("always produces high severity regardless of count magnitude", () => {
    const rows = [makeOverloadRow({ sessionCount: 20 })];
    const result = detectOverloadFromRows(rows, OVERLOAD_SESSIONS, LOOKBACK);
    expect(result[0].severity).toBe("high");
  });

  it("sets currentValue to sessionCount", () => {
    const rows = [makeOverloadRow({ sessionCount: 7 })];
    const result = detectOverloadFromRows(rows, OVERLOAD_SESSIONS, LOOKBACK);
    expect(result[0].currentValue).toBe(7);
  });

  it("includes avgEnergia in details", () => {
    const rows = [makeOverloadRow({ sessionCount: 6, avgEnergia: 2.3 })];
    const result = detectOverloadFromRows(rows, OVERLOAD_SESSIONS, LOOKBACK);
    expect(result[0].details.avgEnergia).toBe(2.3);
    expect(result[0].details.sessionCount).toBe(6);
  });

  it("handles multiple comerciales independently", () => {
    const rows = [
      makeOverloadRow({ comercialId: "c1", sessionCount: 6 }),
      makeOverloadRow({ comercialId: "c2", sessionCount: 3 }),
    ];
    const result = detectOverloadFromRows(rows, OVERLOAD_SESSIONS, LOOKBACK);
    expect(result).toHaveLength(1);
    expect(result[0].comercialId).toBe("c1");
  });
});

// ---------------------------------------------------------------------------
// deduplicateMentalHealthAlerts
// ---------------------------------------------------------------------------

describe("deduplicateMentalHealthAlerts", () => {
  const NOW = new Date("2026-04-08T10:00:00Z");
  const WINDOW_DAYS = 7;

  function makeCandidate(
    comercialId: string,
    type: MentalHealthAlertCandidate["type"],
  ): MentalHealthAlertCandidate {
    return {
      comercialId,
      comercialNombre: "Agente",
      type,
      severity: "medium",
      metric: "nivelEnergia",
      message: "test",
      currentValue: 1.5,
      baselineValue: null,
      threshold: 3,
      details: {},
    };
  }

  it("returns all candidates when no recent alerts exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const candidates = [
      makeCandidate("c1", "energy_drop"),
      makeCandidate("c2", "recurrent_block"),
    ];
    const result = await deduplicateMentalHealthAlerts(candidates, WINDOW_DAYS, NOW);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when input is empty", async () => {
    const result = await deduplicateMentalHealthAlerts([], WINDOW_DAYS, NOW);
    expect(result).toHaveLength(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("filters out candidates that already have a recent alert", async () => {
    mockFindMany.mockResolvedValue([
      { comercialId: "c1", type: "energy_drop" },
    ]);
    const candidates = [
      makeCandidate("c1", "energy_drop"),
      makeCandidate("c2", "recurrent_block"),
    ];
    const result = await deduplicateMentalHealthAlerts(candidates, WINDOW_DAYS, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].comercialId).toBe("c2");
  });

  it("only deduplicates the same (comercialId, type) combination", async () => {
    mockFindMany.mockResolvedValue([
      { comercialId: "c1", type: "energy_drop" },
    ]);
    const candidates = [
      makeCandidate("c1", "energy_drop"),
      makeCandidate("c1", "recurrent_block"),
    ];
    const result = await deduplicateMentalHealthAlerts(candidates, WINDOW_DAYS, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("recurrent_block");
  });

  it("passes correct window filter to DB query", async () => {
    mockFindMany.mockResolvedValue([]);
    await deduplicateMentalHealthAlerts(
      [makeCandidate("c1", "energy_drop")],
      WINDOW_DAYS,
      NOW,
    );
    const callArgs = mockFindMany.mock.calls[0][0];
    const windowStart = callArgs.where.createdAt.gte as Date;
    const expectedStart = new Date(NOW.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    expect(Math.abs(windowStart.getTime() - expectedStart.getTime())).toBeLessThan(1000);
  });
});
