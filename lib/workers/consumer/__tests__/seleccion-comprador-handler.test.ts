import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import { handleSeleccionComprador } from "../seleccion-comprador-handler";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    micrositeSelectionFeedback: {
      upsert: vi.fn().mockResolvedValue({ id: "fb-1" }),
    },
    demandCurrent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "evt-sc-001",
    position: BigInt(1),
    type: "SELECCION_COMPRADOR",
    aggregateType: "DEMAND",
    aggregateId: "DEM-001",
    version: null,
    payload: {
      demandId: "DEM-001",
      selectionId: "sel-001",
      propertyId: "prop-sfx-123",
      decision: "ME_INTERESA",
      source: { channel: "whatsapp_feedback", waId: "34600111222" },
    },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("handleSeleccionComprador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persiste feedback ME_INTERESA sin follow-up jobs", async () => {
    const event = makeEvent();
    const result = await handleSeleccionComprador(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("persiste feedback NO_ME_ENCAJA sin follow-up jobs (demand update is handled by DEMANDA_ACTUALIZADA)", async () => {
    const event = makeEvent({
      payload: {
        demandId: "DEM-001",
        selectionId: "sel-001",
        propertyId: "prop-sfx-456",
        decision: "NO_ME_ENCAJA",
        source: { channel: "whatsapp_feedback" },
      },
    });
    const result = await handleSeleccionComprador(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("skip graceful si payload incompleto (sin selectionId)", async () => {
    const event = makeEvent({
      payload: {
        demandId: "DEM-001",
        propertyId: "prop-sfx-789",
        decision: "ME_INTERESA",
      },
    });
    const result = await handleSeleccionComprador(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });

  it("skip graceful si decision invalida", async () => {
    const event = makeEvent({
      payload: {
        demandId: "DEM-001",
        selectionId: "sel-001",
        propertyId: "prop-sfx-789",
        decision: "INVALID",
      },
    });
    const result = await handleSeleccionComprador(event);

    expect(result.success).toBe(true);
    expect(result.followUpJobs).toBeUndefined();
  });
});
