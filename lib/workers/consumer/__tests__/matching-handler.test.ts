import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/types/domain";
import type { EventRecord } from "@/lib/event-store/types";

const {
  mockEventFindFirst,
  mockAppendEvent,
  mockMatchDemandsToPropertyById,
  mockMatchDemandsToProperty,
  mockIsMatchingPaused,
} = vi.hoisted(() => ({
  mockEventFindFirst: vi.fn(),
  mockAppendEvent: vi.fn(),
  mockMatchDemandsToPropertyById: vi.fn(),
  mockMatchDemandsToProperty: vi.fn(),
  mockIsMatchingPaused: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/matching", () => ({
  matchDemandsToPropertyById: (...args: unknown[]) =>
    mockMatchDemandsToPropertyById(...args),
  matchDemandsToProperty: (...args: unknown[]) =>
    mockMatchDemandsToProperty(...args),
}));

vi.mock("@/lib/matching/pause", () => ({
  isMatchingPaused: () => mockIsMatchingPaused(),
  MATCHING_PAUSED_REASON: "test pause reason",
}));

function makeEvent(
  type: "PROPIEDAD_CREADA" | "PROPIEDAD_MODIFICADA",
  payload: Record<string, unknown> = { snapshot: {} },
): Event {
  return {
    id: `evt-${type}`,
    position: BigInt(1),
    type,
    aggregateType: "PROPERTY",
    aggregateId: "PROP-1",
    version: null,
    payload,
    metadata: null,
    correlationId: "corr-1",
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  } as EventRecord as Event;
}

function makeMatch(totalScore: number, propertyId = "PROP-1") {
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

describe("handlePropertyMatching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMatchingPaused.mockReturnValue(false);
    mockEventFindFirst.mockResolvedValue(null);
    mockAppendEvent.mockImplementation(async (args: { aggregateId: string }) => ({
      id: `evt-match-${args.aggregateId}`,
    }));
    mockMatchDemandsToPropertyById.mockResolvedValue({
      property: { codigo: "PROP-1" },
      totalDemands: 10,
      filteredOut: 8,
      matches: [makeMatch(85)],
      executionMs: 10,
    });
    mockMatchDemandsToProperty.mockResolvedValue(null);
  });

  it("etiqueta matches automáticos de PROPIEDAD_CREADA y encola PROCESS_EVENT", async () => {
    const { handlePropertyMatching } = await import("../matching-handler");

    const result = await handlePropertyMatching(makeEvent("PROPIEDAD_CREADA"));

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    const appended = mockAppendEvent.mock.calls[0][0] as {
      aggregateId: string;
      payload: Record<string, unknown>;
      causationId?: string;
    };
    expect(appended.aggregateId).toBe("DEM-100:PROP-1");
    expect(appended.payload.source).toBe("auto_property_creada");
    expect(appended.payload.sourceEventId).toBe("evt-PROPIEDAD_CREADA");
    expect(appended.causationId).toBe("evt-PROPIEDAD_CREADA");

    const processEvents = (result.followUpJobs ?? []).filter(
      (job) => job.type === "PROCESS_EVENT",
    );
    expect(processEvents).toHaveLength(1);
  });

  it("etiqueta matches automáticos de PROPIEDAD_MODIFICADA", async () => {
    const { handlePropertyMatching } = await import("../matching-handler");

    await handlePropertyMatching(
      makeEvent("PROPIEDAD_MODIFICADA", { changedFields: ["precio"] }),
    );

    const appended = mockAppendEvent.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(appended.payload.source).toBe("auto_property_modificada");
  });

  it("no reemite MATCH_GENERADO si el score cambió menos del umbral", async () => {
    mockEventFindFirst.mockImplementation(
      async ({ where }: { where: { type: string; aggregateId?: string } }) => {
        if (where.type === "MATCH_GENERADO" && where.aggregateId === "DEM-100:PROP-1") {
          return { payload: { totalScore: 83 } };
        }
        return null;
      },
    );

    const { handlePropertyMatching } = await import("../matching-handler");

    const result = await handlePropertyMatching(
      makeEvent("PROPIEDAD_MODIFICADA", { changedFields: ["precio"] }),
    );

    expect(result.success).toBe(true);
    expect(mockAppendEvent).not.toHaveBeenCalled();
    const processEvents = (result.followUpJobs ?? []).filter(
      (job) => job.type === "PROCESS_EVENT",
    );
    expect(processEvents).toHaveLength(0);
  });
});
