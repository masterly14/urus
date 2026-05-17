import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/types/domain";
import type { EventRecord } from "@/lib/event-store/types";

const {
  mockDemandFindUnique,
  mockPropertyFindUnique,
  mockResolveComercialFromAgente,
  mockSendMatchWhatsAppHot,
} = vi.hoisted(() => ({
  mockDemandFindUnique: vi.fn(),
  mockPropertyFindUnique: vi.fn(),
  mockResolveComercialFromAgente: vi.fn(),
  mockSendMatchWhatsAppHot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: { findUnique: (...a: unknown[]) => mockDemandFindUnique(...a) },
    propertyCurrent: { findUnique: (...a: unknown[]) => mockPropertyFindUnique(...a) },
  },
}));

vi.mock("@/lib/routing/resolve-comercial", () => ({
  resolveComercialFromAgente: (...a: unknown[]) =>
    mockResolveComercialFromAgente(...a),
}));

vi.mock("@/lib/matching/send-match-whatsapp", () => ({
  sendMatchWhatsAppHot: (...a: unknown[]) => mockSendMatchWhatsAppHot(...a),
}));

// `sendMatchNotification` (camino legacy SEND_WHATSAPP_MATCH) y
// `normalizeWhatsAppDigits` no se invocan en este test pero el módulo los importa.
vi.mock("@/lib/whatsapp/send", () => ({
  sendMatchNotification: vi.fn(),
}));
vi.mock("@/lib/microsite/buyer-phone", () => ({
  normalizeWhatsAppDigits: (s: string) => s.replace(/\D/g, ""),
}));

function makeEvent(payload: Record<string, unknown>): Event {
  return {
    id: "evt-match-1",
    position: BigInt(1),
    type: "MATCH_GENERADO",
    aggregateType: "MATCH",
    aggregateId: "DEM-100:PROP-1",
    version: null,
    payload,
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  } as EventRecord as Event;
}

describe("handleMatchGenerado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDemandFindUnique.mockResolvedValue({
      telefono: "34600111222",
      nombre: "Test buyer",
      agente: "Agente1",
    });
    mockPropertyFindUnique.mockResolvedValue({
      titulo: "Piso Centro",
      precio: 150000,
      ciudad: "Córdoba",
      zona: "Centro",
      agente: "Agente1",
    });
    mockResolveComercialFromAgente.mockResolvedValue({
      id: "com-1",
      nombre: "Marta",
      telefono: "34600999000",
    });
    mockSendMatchWhatsAppHot.mockResolvedValue({
      ok: true,
      alreadySent: false,
      wamid: "wamid-1",
    });
  });

  it("source=auto_demand_creada: encola NOTIFY_LEAD_WHATSAPP al comercial y NO envía WhatsApp al comprador", async () => {
    const { handleMatchGenerado } = await import("../match-generado-handler");
    const result = await handleMatchGenerado(
      makeEvent({
        demandId: "DEM-100",
        propertyId: "PROP-1",
        totalScore: 85,
        source: "auto_demand_creada",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockSendMatchWhatsAppHot).not.toHaveBeenCalled();
    const notifyJobs = (result.followUpJobs ?? []).filter(
      (j) => j.type === "NOTIFY_LEAD_WHATSAPP",
    );
    expect(notifyJobs).toHaveLength(1);
  });

  it("source=auto_demand_modificada: tampoco envía WhatsApp al comprador", async () => {
    const { handleMatchGenerado } = await import("../match-generado-handler");
    const result = await handleMatchGenerado(
      makeEvent({
        demandId: "DEM-100",
        propertyId: "PROP-1",
        totalScore: 88,
        source: "auto_demand_modificada",
      }),
    );
    expect(result.success).toBe(true);
    expect(mockSendMatchWhatsAppHot).not.toHaveBeenCalled();
  });

  it("source=rematch_manual: sí envía WhatsApp al comprador", async () => {
    const { handleMatchGenerado } = await import("../match-generado-handler");
    const result = await handleMatchGenerado(
      makeEvent({
        demandId: "DEM-100",
        propertyId: "PROP-1",
        totalScore: 85,
        source: "rematch_manual",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockSendMatchWhatsAppHot).toHaveBeenCalledWith(
      expect.objectContaining({
        matchEventId: "evt-match-1",
        demandId: "DEM-100",
        propertyId: "PROP-1",
        buyerPhone: "34600111222",
      }),
    );
  });

  it("sin source (lado-propiedad legacy): envía WhatsApp al comprador y notifica al comercial", async () => {
    const { handleMatchGenerado } = await import("../match-generado-handler");
    const result = await handleMatchGenerado(
      makeEvent({
        demandId: "DEM-100",
        propertyId: "PROP-1",
        totalScore: 80,
      }),
    );

    expect(result.success).toBe(true);
    expect(mockSendMatchWhatsAppHot).toHaveBeenCalledTimes(1);
    const notifyJobs = (result.followUpJobs ?? []).filter(
      (j) => j.type === "NOTIFY_LEAD_WHATSAPP",
    );
    expect(notifyJobs).toHaveLength(1);
  });

  it("source=auto_demand_creada sin teléfono del comprador: tampoco intenta envío", async () => {
    mockDemandFindUnique.mockResolvedValue({
      telefono: null,
      nombre: "X",
      agente: "Agente1",
    });
    const { handleMatchGenerado } = await import("../match-generado-handler");
    const result = await handleMatchGenerado(
      makeEvent({
        demandId: "DEM-100",
        propertyId: "PROP-1",
        totalScore: 85,
        source: "auto_demand_creada",
      }),
    );
    expect(result.success).toBe(true);
    expect(mockSendMatchWhatsAppHot).not.toHaveBeenCalled();
  });
});
