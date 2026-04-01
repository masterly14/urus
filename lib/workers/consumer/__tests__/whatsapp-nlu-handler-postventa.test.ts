import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAppendEvent = vi.fn();
vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

const mockEnqueueJob = vi.fn();
vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/agents", () => ({
  classifyWhatsAppResponse: vi.fn().mockResolvedValue({
    intention: "OTRO",
    confidence: 0,
    rawText: "",
    variables: {},
  }),
}));

import {
  handleWhatsAppRecibido,
  extractPostventaPayload,
} from "../whatsapp-nlu-handler";
import type { Event } from "@/types/domain";

function makeEvent(payload: Record<string, unknown>): Event {
  return {
    id: "evt-1",
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: "34600111222",
    payload,
    metadata: null,
    correlationId: null,
    causationId: null,
    version: 1,
    position: BigInt(1),
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

describe("extractPostventaPayload", () => {
  it("extrae POSTVENTA_OK desde button.payload (plantilla Meta)", () => {
    const result = extractPostventaPayload({
      type: "button",
      button: { payload: "POSTVENTA_OK:P-123", text: "Todo OK" },
    });
    expect(result).toEqual({ action: "ok", propertyCode: "P-123" });
  });

  it("extrae POSTVENTA_AYUDA desde button.payload", () => {
    const result = extractPostventaPayload({
      type: "button",
      button: { payload: "POSTVENTA_AYUDA:P-456", text: "Necesito ayuda" },
    });
    expect(result).toEqual({ action: "ayuda", propertyCode: "P-456" });
  });

  it("extrae POSTVENTA_OK desde interactive.button_reply (MVP)", () => {
    const result = extractPostventaPayload({
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "POSTVENTA_OK:P-789", title: "Todo OK" },
      },
    });
    expect(result).toEqual({ action: "ok", propertyCode: "P-789" });
  });

  it("extrae POSTVENTA_AYUDA desde interactive.button_reply", () => {
    const result = extractPostventaPayload({
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "POSTVENTA_AYUDA:P-ABC", title: "Necesito ayuda" },
      },
    });
    expect(result).toEqual({ action: "ayuda", propertyCode: "P-ABC" });
  });

  it("retorna null para payload sin prefijo post-venta", () => {
    const result = extractPostventaPayload({
      type: "button",
      button: { payload: "match:DEM-1:PROP-1:like", text: "Me interesa" },
    });
    expect(result).toBeNull();
  });

  it("retorna null para mensaje de texto normal", () => {
    const result = extractPostventaPayload({
      type: "text",
      text: { body: "Hola, todo bien" },
    });
    expect(result).toBeNull();
  });
});

describe("handleWhatsAppRecibido — botones post-venta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppendEvent.mockResolvedValue({
      id: "inc-evt-1",
      type: "INCIDENCIA_POSTVENTA_ABIERTA",
    });
  });

  it("procesa POSTVENTA_OK sin emitir incidencia", async () => {
    const event = makeEvent({
      type: "button",
      button: { payload: "POSTVENTA_OK:P-100", text: "Todo OK" },
    });

    const result = await handleWhatsAppRecibido(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("procesa POSTVENTA_AYUDA emitiendo INCIDENCIA_POSTVENTA_ABIERTA", async () => {
    process.env.ALERT_WHATSAPP_TO = "34699888777";

    const event = makeEvent({
      type: "button",
      button: { payload: "POSTVENTA_AYUDA:P-200", text: "Necesito ayuda" },
    });

    const result = await handleWhatsAppRecibido(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "INCIDENCIA_POSTVENTA_ABIERTA",
        aggregateType: "PROPERTY",
        aggregateId: "P-200",
      }),
    );

    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTIFY_LEAD_WHATSAPP",
        payload: expect.objectContaining({
          assignedAgentTelefono: "34699888777",
          leadAggregateId: "P-200",
          slaLevel: "INCIDENCIA_POSTVENTA",
        }),
      }),
    );

    expect(result.followUpJobs).toHaveLength(1);
    expect(result.followUpJobs![0].type).toBe("PROCESS_EVENT");

    delete process.env.ALERT_WHATSAPP_TO;
  });

  it("POSTVENTA_AYUDA sin ALERT_WHATSAPP_TO no encola notificacion", async () => {
    delete process.env.ALERT_WHATSAPP_TO;

    const event = makeEvent({
      type: "button",
      button: { payload: "POSTVENTA_AYUDA:P-300", text: "Necesito ayuda" },
    });

    const result = await handleWhatsAppRecibido(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("no intercepta mensajes de texto normales", async () => {
    const event = makeEvent({
      type: "text",
      text: { body: "Hola, tengo una duda" },
    });

    const result = await handleWhatsAppRecibido(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("procesa interactive button_reply con prefijo POSTVENTA_AYUDA", async () => {
    const event = makeEvent({
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "POSTVENTA_AYUDA:P-INT", title: "Necesito ayuda" },
      },
    });

    const result = await handleWhatsAppRecibido(event);

    expect(result.success).toBe(true);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: "P-INT",
      }),
    );
  });
});
