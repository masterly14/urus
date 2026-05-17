import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";

const {
  mockDemandCurrentFindUnique,
  mockEventFindFirst,
  mockAppendEvent,
  mockMatchPropertiesToDemand,
  mockIsMatchingPaused,
} = vi.hoisted(() => ({
  mockDemandCurrentFindUnique: vi.fn(),
  mockEventFindFirst: vi.fn(),
  mockAppendEvent: vi.fn(),
  mockMatchPropertiesToDemand: vi.fn(),
  mockIsMatchingPaused: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockDemandCurrentFindUnique(...args),
    },
    event: {
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/matching/match-properties", () => ({
  matchPropertiesToDemand: (...args: unknown[]) =>
    mockMatchPropertiesToDemand(...args),
}));

vi.mock("@/lib/matching/pause", () => ({
  isMatchingPaused: () => mockIsMatchingPaused(),
  MATCHING_PAUSED_REASON: "test pause reason",
}));

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-1",
    type: "MATCH_DEMAND_AGAINST_INTERNAL",
    status: "IN_PROGRESS",
    payload: {
      demandId: "DEM-100",
      source: "auto_demand_creada",
      sourceEventId: "evt-source-1",
      causationId: "evt-source-1",
      correlationId: "corr-1",
    },
    priority: 100,
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "worker-1",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: "match_internal:evt-source-1",
    sourceEventId: "evt-source-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDemandRow(overrides: Record<string, unknown> = {}) {
  return {
    codigo: "DEM-100",
    ref: "D-100",
    nombre: "Test buyer",
    presupuestoMin: 100_000,
    presupuestoMax: 200_000,
    habitacionesMin: 2,
    tipos: "piso",
    zonas: "Centro,Norte",
    metrosMin: 60,
    metrosMax: 100,
    tipoOperacion: "venta",
    estadoId: "1",
    ...overrides,
  };
}

function makeMatch(propertyId: string, totalScore: number) {
  return {
    demandId: "DEM-100",
    demandRef: "D-100",
    demandNombre: "Test buyer",
    propertyId,
    propertyRef: `P-${propertyId}`,
    totalScore,
    matchScore: { zone: 1, price: 1 },
    isMatch: true,
  };
}

describe("handleMatchDemandAgainstInternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMatchingPaused.mockReturnValue(false);
    mockDemandCurrentFindUnique.mockResolvedValue(makeDemandRow());
    mockEventFindFirst.mockResolvedValue(null);
    mockAppendEvent.mockImplementation(async (args: { aggregateId: string }) => ({
      id: `evt-${args.aggregateId}`,
    }));
    mockMatchPropertiesToDemand.mockResolvedValue({
      demand: makeDemandRow(),
      totalProperties: 50,
      filteredOut: 10,
      matches: [makeMatch("PROP-1", 85), makeMatch("PROP-2", 72)],
      executionMs: 12,
    });
  });

  it("rechaza permanentemente jobs sin demandId", async () => {
    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(
      makeJob({ payload: {} }),
    );
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(mockMatchPropertiesToDemand).not.toHaveBeenCalled();
  });

  it("hace no-op cuando isMatchingPaused()", async () => {
    mockIsMatchingPaused.mockReturnValue(true);
    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());
    expect(result.success).toBe(true);
    expect(mockMatchPropertiesToDemand).not.toHaveBeenCalled();
  });

  it("hace no-op si la demanda no existe en demand_current", async () => {
    mockDemandCurrentFindUnique.mockResolvedValue(null);
    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());
    expect(result.success).toBe(true);
    expect(mockMatchPropertiesToDemand).not.toHaveBeenCalled();
  });

  it("hace no-op si la demanda no está en ACTIVE_DEMAND_STATES", async () => {
    mockDemandCurrentFindUnique.mockResolvedValue(
      makeDemandRow({ estadoId: "99" }),
    );
    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());
    expect(result.success).toBe(true);
    expect(mockMatchPropertiesToDemand).not.toHaveBeenCalled();
  });

  it("hace no-op si la demanda no tiene tipoOperacion", async () => {
    mockDemandCurrentFindUnique.mockResolvedValue(
      makeDemandRow({ tipoOperacion: null }),
    );
    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());
    expect(result.success).toBe(true);
    expect(mockMatchPropertiesToDemand).not.toHaveBeenCalled();
  });

  it("emite N MATCH_GENERADO con source=auto_demand_creada y encola coverage con bestScoreOverride", async () => {
    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledTimes(2);
    for (const call of mockAppendEvent.mock.calls) {
      const args = call[0] as { type: string; payload: Record<string, unknown> };
      expect(args.type).toBe("MATCH_GENERADO");
      expect(args.payload.source).toBe("auto_demand_creada");
      expect(args.payload.sourceEventId).toBe("evt-source-1");
    }

    const followUpTypes = (result.followUpJobs ?? []).map((j) => j.type);
    expect(followUpTypes.filter((t) => t === "PROCESS_EVENT").length).toBe(2);
    expect(followUpTypes).toContain("EVALUATE_DEMAND_COVERAGE");

    const coverageJob = result.followUpJobs!.find(
      (j) => j.type === "EVALUATE_DEMAND_COVERAGE",
    )!;
    const coveragePayload = coverageJob.payload as Record<string, unknown>;
    expect(coveragePayload.bestScoreOverride).toBe(85);
    expect(coveragePayload.matchesEmitted).toBe(2);
    expect(coverageJob.idempotencyKey).toBe(
      "evaluate_coverage:demand:evt-source-1",
    );
  });

  it("salta MATCH_GENERADO cuando |Δscore| < 5 vs evento previo", async () => {
    mockEventFindFirst.mockImplementation(
      async ({ where }: { where: { aggregateId: string } }) => {
        if (where.aggregateId === "DEM-100:PROP-1") {
          return { payload: { totalScore: 83 } };
        }
        return null;
      },
    );

    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    const appended = mockAppendEvent.mock.calls[0][0] as {
      aggregateId: string;
      payload: Record<string, unknown>;
    };
    expect(appended.aggregateId).toBe("DEM-100:PROP-2");
    const processEvents = (result.followUpJobs ?? []).filter(
      (j) => j.type === "PROCESS_EVENT",
    );
    expect(processEvents).toHaveLength(1);

    const coverageJob = result.followUpJobs!.find(
      (j) => j.type === "EVALUATE_DEMAND_COVERAGE",
    )!;
    const coveragePayload = coverageJob.payload as Record<string, unknown>;
    // bestScore se calcula sobre todos los matches del motor, no solo los emitidos
    expect(coveragePayload.bestScoreOverride).toBe(85);
    expect(coveragePayload.matchesEmitted).toBe(1);
  });

  it("emite source=auto_demand_modificada cuando el payload lo indica", async () => {
    mockMatchPropertiesToDemand.mockResolvedValue({
      demand: makeDemandRow(),
      totalProperties: 50,
      filteredOut: 10,
      matches: [makeMatch("PROP-1", 90)],
      executionMs: 8,
    });

    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(
      makeJob({
        payload: {
          demandId: "DEM-100",
          source: "auto_demand_modificada",
          sourceEventId: "evt-mod-1",
        },
      }),
    );

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    const appended = mockAppendEvent.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(appended.payload.source).toBe("auto_demand_modificada");
  });

  it("encola EVALUATE_DEMAND_COVERAGE con bestScoreOverride=0 cuando no hay matches", async () => {
    mockMatchPropertiesToDemand.mockResolvedValue({
      demand: makeDemandRow(),
      totalProperties: 50,
      filteredOut: 50,
      matches: [],
      executionMs: 5,
    });

    const { handleMatchDemandAgainstInternal } = await import(
      "../match-demand-internal-job-handler"
    );
    const result = await handleMatchDemandAgainstInternal(makeJob());

    expect(result.success).toBe(true);
    expect(mockAppendEvent).not.toHaveBeenCalled();
    const coverageJob = result.followUpJobs!.find(
      (j) => j.type === "EVALUATE_DEMAND_COVERAGE",
    )!;
    const coveragePayload = coverageJob.payload as Record<string, unknown>;
    expect(coveragePayload.bestScoreOverride).toBe(0);
    expect(coveragePayload.matchesEmitted).toBe(0);
  });
});
