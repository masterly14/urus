import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeUpdate = vi.fn();
vi.mock("@/lib/inmovilla/rest/client", () => ({
  createInmovillaRestClient: () => ({ get: vi.fn(), post: vi.fn() }),
}));
vi.mock("@/lib/inmovilla/rest/safe-update", () => ({
  safeUpdateProperty: (...args: unknown[]) => mockSafeUpdate(...args),
}));

import { handleUpdatePropertyStatusInmovilla } from "../inmovilla-property-status-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-test-001",
    type: "UPDATE_PROPERTY_STATUS_INMOVILLA",
    payload,
    status: "IN_PROGRESS",
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey: null,
    sourceEventId: null,
    scheduledFor: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    lastError: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleUpdatePropertyStatusInmovilla", () => {
  it("passes estadoficha only when no buyerClientCode", async () => {
    mockSafeUpdate.mockResolvedValue({ ok: true, removedFields: [] });

    const result = await handleUpdatePropertyStatusInmovilla(
      makeJob({ propertyCode: "URUS100", estadoficha: 3 }),
    );

    expect(result.success).toBe(true);
    expect(mockSafeUpdate).toHaveBeenCalledOnce();
    const [, , patch] = mockSafeUpdate.mock.calls[0];
    expect(patch).toEqual({ estadoficha: "3" });
  });

  it("includes keycli when buyerClientCode is provided", async () => {
    mockSafeUpdate.mockResolvedValue({ ok: true, removedFields: [] });

    const result = await handleUpdatePropertyStatusInmovilla(
      makeJob({ propertyCode: "URUS200", estadoficha: 3, buyerClientCode: "12345" }),
    );

    expect(result.success).toBe(true);
    const [, , patch] = mockSafeUpdate.mock.calls[0];
    expect(patch).toEqual({ estadoficha: "3", keycli: "12345" });
  });

  it("returns permanent error when propertyCode is missing", async () => {
    const result = await handleUpdatePropertyStatusInmovilla(
      makeJob({ estadoficha: 3 }),
    );

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(mockSafeUpdate).not.toHaveBeenCalled();
  });

  it("returns permanent error when estadoficha is missing", async () => {
    const result = await handleUpdatePropertyStatusInmovilla(
      makeJob({ propertyCode: "URUS300" }),
    );

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("returns failure when safeUpdateProperty returns ok=false", async () => {
    mockSafeUpdate.mockResolvedValue({ ok: false, removedFields: [] });

    const result = await handleUpdatePropertyStatusInmovilla(
      makeJob({ propertyCode: "URUS400", estadoficha: 2 }),
    );

    expect(result.success).toBe(false);
    expect(result.permanent).toBeUndefined();
  });

  it("returns failure when safeUpdateProperty throws", async () => {
    mockSafeUpdate.mockRejectedValue(new Error("REST timeout"));

    const result = await handleUpdatePropertyStatusInmovilla(
      makeJob({ propertyCode: "URUS500", estadoficha: 6 }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("REST timeout");
  });
});
