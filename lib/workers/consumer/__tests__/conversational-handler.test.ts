import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/types/domain";

const mockAppendEvent = vi.fn();
vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

const mockSendTextMessage = vi.fn();
vi.mock("@/lib/whatsapp/send", () => ({
  sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
}));

const mockRunConversationalAgent = vi.fn();
vi.mock("@/lib/agents/conversational-graph", () => ({
  runConversationalAgent: (...args: unknown[]) => mockRunConversationalAgent(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany: vi.fn().mockResolvedValue([]) },
    micrositeSelection: { findUnique: vi.fn().mockResolvedValue(null) },
    whatsAppBuyerSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { handleConversationalFlow } from "../conversational-handler";
import { prisma } from "@/lib/prisma";

function makeIncomingEvent(): Event {
  return {
    id: "evt-in-1",
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: "34600111222",
    payload: { text: { body: "Hola" } },
    metadata: null,
    correlationId: "corr-1",
    causationId: null,
    version: 1,
    position: BigInt(1),
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

describe("handleConversationalFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunConversationalAgent.mockResolvedValue({
      responseText: "Claro, te ayudo con eso.",
      toolResults: [],
      nextPhase: "REVIEWING_OPTIONS",
    });
    mockSendTextMessage.mockResolvedValue({
      messages: [{ id: "wamid.ok" }],
    });
  });

  it("no registra WHATSAPP_ENVIADO ni avanza sesión si falla el envío a Meta", async () => {
    mockSendTextMessage.mockRejectedValue(new Error("Meta API 429"));

    const result = await handleConversationalFlow(
      makeIncomingEvent(),
      "34600111222",
      "Hola",
      { demandId: "DEM-1", selectionId: null },
    );

    expect(result).toEqual({ success: false, error: "Meta API 429" });
    expect(mockAppendEvent).not.toHaveBeenCalled();
    expect(prisma.whatsAppBuyerSession.upsert).not.toHaveBeenCalled();
  });

  it("registra el mensaje y avanza sesión después de un envío correcto", async () => {
    const result = await handleConversationalFlow(
      makeIncomingEvent(),
      "34600111222",
      "Hola",
      { demandId: "DEM-1", selectionId: null },
    );

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "WHATSAPP_ENVIADO",
        aggregateId: "34600111222",
        payload: expect.objectContaining({
          messageId: "wamid.ok",
          body: "Claro, te ayudo con eso.",
          source: "conversational_agent",
        }),
      }),
    );
    expect(prisma.whatsAppBuyerSession.upsert).toHaveBeenCalled();
  });
});
