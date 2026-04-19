import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    visitSchedulingSession: { findFirst: vi.fn() },
    micrositeSelectionFeedback: { findFirst: vi.fn() },
    event: { findFirst: vi.fn() },
  },
}));

import { resolveDemandIdForProperty } from "../resolve-demand";
import { prisma } from "@/lib/prisma";

const mockVisitFind = vi.mocked(prisma.visitSchedulingSession.findFirst);
const mockFeedbackFind = vi.mocked(prisma.micrositeSelectionFeedback.findFirst);
const mockEventFind = vi.mocked(prisma.event.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDemandIdForProperty", () => {
  it("returns demandId from VisitSchedulingSession (highest priority)", async () => {
    mockVisitFind.mockResolvedValue({ demandId: "DEM-VISIT-001" } as never);

    const result = await resolveDemandIdForProperty("PROP-100");

    expect(result).toBe("DEM-VISIT-001");
    expect(mockVisitFind).toHaveBeenCalledWith({
      where: { propertyCode: "PROP-100" },
      orderBy: { updatedAt: "desc" },
      select: { demandId: true },
    });
    expect(mockFeedbackFind).not.toHaveBeenCalled();
    expect(mockEventFind).not.toHaveBeenCalled();
  });

  it("falls back to MicrositeSelectionFeedback when no visit session", async () => {
    mockVisitFind.mockResolvedValue(null);
    mockFeedbackFind.mockResolvedValue({
      selection: { demandId: "DEM-MICRO-002" },
    } as never);

    const result = await resolveDemandIdForProperty("PROP-200");

    expect(result).toBe("DEM-MICRO-002");
    expect(mockVisitFind).toHaveBeenCalledOnce();
    expect(mockFeedbackFind).toHaveBeenCalledOnce();
    expect(mockEventFind).not.toHaveBeenCalled();
  });

  it("falls back to MATCH_GENERADO event when no visit or feedback", async () => {
    mockVisitFind.mockResolvedValue(null);
    mockFeedbackFind.mockResolvedValue(null);
    mockEventFind.mockResolvedValue({
      payload: { demandId: "DEM-MATCH-003", propertyId: "PROP-300" },
    } as never);

    const result = await resolveDemandIdForProperty("PROP-300");

    expect(result).toBe("DEM-MATCH-003");
    expect(mockVisitFind).toHaveBeenCalledOnce();
    expect(mockFeedbackFind).toHaveBeenCalledOnce();
    expect(mockEventFind).toHaveBeenCalledOnce();
  });

  it("returns null when no data source has a link", async () => {
    mockVisitFind.mockResolvedValue(null);
    mockFeedbackFind.mockResolvedValue(null);
    mockEventFind.mockResolvedValue(null);

    const result = await resolveDemandIdForProperty("PROP-ORPHAN");

    expect(result).toBeNull();
  });

  it("prefers visit over microsite even if both exist", async () => {
    mockVisitFind.mockResolvedValue({ demandId: "DEM-VISIT-PRIORITY" } as never);
    mockFeedbackFind.mockResolvedValue({
      selection: { demandId: "DEM-MICRO-IGNORED" },
    } as never);

    const result = await resolveDemandIdForProperty("PROP-BOTH");

    expect(result).toBe("DEM-VISIT-PRIORITY");
    expect(mockFeedbackFind).not.toHaveBeenCalled();
  });

  it("handles MATCH_GENERADO event with missing demandId in payload", async () => {
    mockVisitFind.mockResolvedValue(null);
    mockFeedbackFind.mockResolvedValue(null);
    mockEventFind.mockResolvedValue({
      payload: { propertyId: "PROP-NO-DEM" },
    } as never);

    const result = await resolveDemandIdForProperty("PROP-NO-DEM");

    expect(result).toBeNull();
  });
});
