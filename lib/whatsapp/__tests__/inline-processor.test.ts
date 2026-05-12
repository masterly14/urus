import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/types/domain";

const mockHandleConversationalFlow = vi.fn();
vi.mock("@/lib/workers/consumer/conversational-handler", () => ({
  handleConversationalFlow: (...args: unknown[]) => mockHandleConversationalFlow(...args),
}));

const mockEnqueueJob = vi.fn();
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

vi.mock("@/lib/workers/consumer/mental-health-handler", () => ({
  isCoachActivation: vi.fn().mockReturnValue(false),
  getActiveSession: vi.fn().mockResolvedValue(null),
  handleMentalHealthMessage: vi.fn(),
}));

vi.mock("@/lib/dev-program/exercise-router", () => ({
  isExerciseRequest: vi.fn().mockReturnValue(false),
  routeToDevProgramIfApplicable: vi.fn(),
}));

vi.mock("@/lib/visit-scheduling/session-manager", () => ({
  getActiveSessionForBuyer: vi.fn().mockResolvedValue(null),
  getActiveSessionForComercial: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/visit-scheduling/handle-visit-message", () => ({
  handleVisitMessage: vi.fn(),
}));

vi.mock("@/lib/agents/visit-intent-classifier", () => ({
  classifyButtonReply: vi.fn(),
  classifyVisitIntent: vi.fn(),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendTextMessage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppBuyerSession: {
      findUnique: vi.fn().mockResolvedValue({
        demandId: "DEM-1",
        selectionId: "SEL-1",
      }),
    },
  },
}));

import { tryInlineProcessing } from "../inline-processor";

function makeIncomingEvent(): Event {
  return {
    id: "evt-inline-1",
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: "34600111222",
    payload: {
      type: "text",
      text: { body: "Hola, me interesa" },
    },
    metadata: null,
    correlationId: null,
    causationId: null,
    version: 1,
    position: BigInt(1),
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

describe("tryInlineProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONVERSATIONAL_AGENT_ENABLED = "true";
    mockHandleConversationalFlow.mockResolvedValue({ success: true });
  });

  it("procesa inline cuando el handler conversacional tiene éxito", async () => {
    const result = await tryInlineProcessing(makeIncomingEvent());

    expect(result.processed).toBe(true);
    expect(result.handler).toBe("conversational-agent");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("devuelve processed=false si el handler retorna success=false para permitir fallback a cola", async () => {
    mockHandleConversationalFlow.mockResolvedValue({
      success: false,
      error: "Meta API 429",
    });

    const result = await tryInlineProcessing(makeIncomingEvent());

    expect(result.processed).toBe(false);
    expect(result.handler).toBe("conversational-agent");
    expect(result.error).toBe("Meta API 429");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});
