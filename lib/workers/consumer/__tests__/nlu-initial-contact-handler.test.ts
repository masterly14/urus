import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";

const mockStartInitialContact = vi.fn();

vi.mock("@/lib/nlu/initial-contact", () => ({
  startNluInitialContactForDemand: (...args: unknown[]) => mockStartInitialContact(...args),
}));

function makeEvent(): EventRecord {
  return {
    id: "evt-demand-created",
    position: BigInt(1),
    type: "DEMANDA_CREADA",
    aggregateType: "DEMAND",
    aggregateId: "DEM-001",
    version: null,
    payload: {},
    metadata: null,
    correlationId: "corr-1",
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

describe("handleDemandaCreadaNluInitialContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartInitialContact.mockResolvedValue({
      ok: true,
      demandId: "DEM-001",
      sent: true,
      eventId: "evt-nlu-contact",
    });
  });

  it("dispara primer contacto NLU con causation/correlation del evento de demanda", async () => {
    const { handleDemandaCreadaNluInitialContact } = await import("../nlu-initial-contact-handler");
    const result = await handleDemandaCreadaNluInitialContact(makeEvent());

    expect(result.success).toBe(true);
    expect(mockStartInitialContact).toHaveBeenCalledWith({
      demandId: "DEM-001",
      causationId: "evt-demand-created",
      correlationId: "corr-1",
    });
  });
});
