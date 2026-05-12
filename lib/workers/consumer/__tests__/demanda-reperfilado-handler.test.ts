import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import { handleDemandaReperfiladoSolicitado } from "../demanda-reperfilado-handler";

const mockFindDemand = vi.fn();
const mockSessionUpsert = vi.fn();
const mockSendTextMessage = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockFindDemand(...args),
    },
    whatsAppBuyerSession: {
      upsert: (...args: unknown[]) => mockSessionUpsert(...args),
    },
  },
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
}));

function makeEvent(payload: Record<string, unknown>): EventRecord {
  return {
    id: "evt-reperfilado-1",
    position: BigInt(1),
    type: "DEMANDA_REPERFILADO_SOLICITADO",
    aggregateType: "DEMAND",
    aggregateId: "DEM-001",
    version: null,
    payload,
    metadata: null,
    correlationId: "corr-1",
    causationId: null,
    occurredAt: new Date("2026-05-01T10:00:00.000Z"),
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
  };
}

describe("handleDemandaReperfiladoSolicitado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindDemand.mockResolvedValue({
      telefono: "34600111222",
      nombre: "Comprador Test",
    });
    mockSessionUpsert.mockResolvedValue({});
    mockSendTextMessage.mockResolvedValue({ messages: [{ id: "wamid-1" }] });
  });

  it("usa postVisitContext en buyerDigest y mensaje de recontacto", async () => {
    await handleDemandaReperfiladoSolicitado(makeEvent({
      visitWorkItemId: "vwi-1",
      propertyId: "PROP-001",
      notes: "No le encajo el tamaño",
      postVisitContext: "Quiere 3 habitaciones y mucha luz natural",
      propertySnapshot: { title: "Piso Centro" },
    }));

    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        buyerDigest: "Contexto post-visita del comercial: Quiere 3 habitaciones y mucha luz natural",
        postVisitContextStructured: expect.objectContaining({
          source: "commercial_post_visit",
          hardConstraints: expect.objectContaining({ habitacionesMin: 3 }),
        }),
        postVisitPolicyState: expect.objectContaining({
          mode: "hybrid",
          conflictResolvedBy: "buyer_priority",
        }),
      }),
      update: expect.objectContaining({
        buyerDigest: "Contexto post-visita del comercial: Quiere 3 habitaciones y mucha luz natural",
      }),
    }));

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "34600111222",
      expect.stringContaining('Me comentan este contexto: "mínimo 3 habitaciones; valora luz natural". ¿Lo he entendido bien?'),
      expect.anything(),
    );
  });

  it("mantiene fallback legacy cuando no llega postVisitContext", async () => {
    await handleDemandaReperfiladoSolicitado(makeEvent({
      notes: "Quiere otra zona",
      propertySnapshot: { title: "Piso Centro" },
    }));

    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        buyerDigest: "Quiere otra zona",
      }),
    }));
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "34600111222",
      expect.not.stringContaining("Me comentan este contexto:"),
      expect.anything(),
    );
  });
});
