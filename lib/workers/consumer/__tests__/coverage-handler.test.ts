/**
 * Tests del handler EVALUATE_DEMAND_COVERAGE.
 *
 * Mockea Prisma y funciones de matching/dedup para validar la lógica
 * de decisión (covered, dedup_skip, enqueued_microsite) y el payload
 * del follow-up GENERATE_MICROSITE.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";
import type { DemandCoverageResult } from "@/lib/matching/types";

vi.mock("@/lib/matching", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matching")>("@/lib/matching");
  return {
    ...actual,
    evaluateDemandCoverage: vi.fn(),
    COVERAGE_MIN_SCORE: 60,
  };
});

vi.mock("@/lib/microsite/coverage-dedup", () => ({
  hasRecentCoverageSelection: vi.fn(),
}));

vi.mock("@/lib/routing/resolve-comercial", () => ({
  resolveComercialByDemand: vi.fn(),
}));

import { handleEvaluateDemandCoverage } from "../coverage-handler";
import { evaluateDemandCoverage } from "@/lib/matching";
import { hasRecentCoverageSelection } from "@/lib/microsite/coverage-dedup";
import { resolveComercialByDemand } from "@/lib/routing/resolve-comercial";

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-cov-001",
    type: "EVALUATE_DEMAND_COVERAGE",
    status: "IN_PROGRESS",
    payload: { demandId: "DEM-001", sourceEventId: "evt-123" },
    priority: 50,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "worker-1",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: "evt-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCoverageResult(overrides: Partial<DemandCoverageResult> = {}): DemandCoverageResult {
  return {
    demandId: "DEM-001",
    bestScore: 0,
    totalCandidates: 0,
    topMatch: null,
    executionMs: 5,
    ...overrides,
  };
}

describe("handleEvaluateDemandCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falla permanente si no hay demandId en payload", async () => {
    const job = makeJob({ payload: {} });
    const result = await handleEvaluateDemandCoverage(job);
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("success=true si demanda no encontrada (skip graceful)", async () => {
    vi.mocked(evaluateDemandCoverage).mockResolvedValue(null);
    const result = await handleEvaluateDemandCoverage(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("no-op si bestScore >= COVERAGE_MIN_SCORE (60)", async () => {
    vi.mocked(evaluateDemandCoverage).mockResolvedValue(
      makeCoverageResult({ bestScore: 75 }),
    );
    const result = await handleEvaluateDemandCoverage(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("skip si hay selección de coverage reciente (dedup)", async () => {
    vi.mocked(evaluateDemandCoverage).mockResolvedValue(
      makeCoverageResult({ bestScore: 40 }),
    );
    vi.mocked(hasRecentCoverageSelection).mockResolvedValue(true);

    const result = await handleEvaluateDemandCoverage(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("encola GENERATE_MICROSITE con source=coverage_scan cuando bestScore < 60 y sin dedup", async () => {
    vi.mocked(evaluateDemandCoverage).mockResolvedValue(
      makeCoverageResult({ bestScore: 45 }),
    );
    vi.mocked(hasRecentCoverageSelection).mockResolvedValue(false);
    vi.mocked(resolveComercialByDemand).mockResolvedValue({
      id: "com-abc",
      nombre: "Antonio",
      telefono: "34600111222",
      email: "a@test.com",
      ciudad: "Córdoba",
      waId: "34600111222",
      composioConnectionId: null,
      activo: true,
      inmovillaAgentId: 12326,
      inmovillaRefCode: "MA",
    });

    const result = await handleEvaluateDemandCoverage(makeJob());

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toHaveLength(1);

    const followUp = result.followUpJobs![0];
    expect(followUp.type).toBe("GENERATE_MICROSITE");

    const p = followUp.payload as Record<string, unknown>;
    expect(p.demandId).toBe("DEM-001");
    expect(p.comercialId).toBe("com-abc");
    expect(p.source).toBe("coverage_scan");
    expect(p.notifyOnEmpty).toBe(false);
    expect(p.coverageReason).toBe("low_score");
  });

  it("reason es zero_matches cuando bestScore es 0", async () => {
    vi.mocked(evaluateDemandCoverage).mockResolvedValue(
      makeCoverageResult({ bestScore: 0 }),
    );
    vi.mocked(hasRecentCoverageSelection).mockResolvedValue(false);
    vi.mocked(resolveComercialByDemand).mockResolvedValue(null);

    const result = await handleEvaluateDemandCoverage(makeJob());

    const p = result.followUpJobs![0].payload as Record<string, unknown>;
    expect(p.coverageReason).toBe("zero_matches");
    expect(p.comercialId).toBe("system");
  });

  it("bestScore en frontera exacta 60 es no-op (>= es covered)", async () => {
    vi.mocked(evaluateDemandCoverage).mockResolvedValue(
      makeCoverageResult({ bestScore: 60 }),
    );
    const result = await handleEvaluateDemandCoverage(makeJob());
    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });
});
