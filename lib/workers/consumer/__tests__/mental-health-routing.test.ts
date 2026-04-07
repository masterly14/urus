import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mentalHealthSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    event: { findMany: vi.fn().mockResolvedValue([]) },
    comercial: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

const mockAppendEvent = vi.fn().mockResolvedValue({ id: "evt-mh-1" });
vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

const mockSendTextMessage = vi.fn().mockResolvedValue({
  messaging_product: "whatsapp",
  contacts: [],
  messages: [{ id: "msg-1" }],
});
vi.mock("@/lib/whatsapp", () => ({
  sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
}));

const mockProcessMentalHealth = vi.fn().mockResolvedValue({
  responseText: "Dime, ¿qué te ronda?",
  classification: {
    flujo: "saludo",
    subtipoBloqueo: null,
    nivelEnergia: 3,
    focoDispersion: "centrado",
    urgencia: "baja",
    reasoning: "Es un saludo",
  },
});
vi.mock("@/lib/agents/mental-health-graph", () => ({
  processMentalHealthMessage: (...args: unknown[]) => mockProcessMentalHealth(...args),
}));

import {
  isCoachActivation,
  isCoachExit,
  getActiveSession,
} from "../mental-health-handler";
import { prisma } from "@/lib/prisma";

describe("isCoachActivation", () => {
  it("detecta /coach como activación", () => {
    expect(isCoachActivation("/coach")).toBe(true);
  });

  it("detecta /coach con texto adicional", () => {
    expect(isCoachActivation("/coach estoy bloqueado")).toBe(true);
  });

  it("detecta coach sin barra", () => {
    expect(isCoachActivation("coach")).toBe(true);
  });

  it("no detecta texto normal", () => {
    expect(isCoachActivation("hola")).toBe(false);
    expect(isCoachActivation("me interesa la propiedad")).toBe(false);
  });

  it("no detecta coaching como activación (word boundary)", () => {
    expect(isCoachActivation("coaching session")).toBe(false);
  });
});

describe("isCoachExit", () => {
  it("detecta /salir", () => {
    expect(isCoachExit("/salir")).toBe(true);
  });

  it("detecta salir sin barra", () => {
    expect(isCoachExit("salir")).toBe(true);
  });

  it("no detecta texto normal", () => {
    expect(isCoachExit("quiero salir a vender")).toBe(false);
  });
});

describe("getActiveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna null si no hay sesión", async () => {
    vi.mocked(prisma.mentalHealthSession.findUnique).mockResolvedValue(null);
    const result = await getActiveSession("34600111222");
    expect(result).toBeNull();
  });

  it("retorna null si la sesión está cerrada", async () => {
    vi.mocked(prisma.mentalHealthSession.findUnique).mockResolvedValue({
      id: "s1",
      waId: "34600111222",
      comercialId: null,
      flujoActivo: "bloqueo",
      subtipoBloqueo: null,
      nivelEnergia: 3,
      turnCount: 5,
      lastMessageAt: new Date(),
      closedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await getActiveSession("34600111222");
    expect(result).toBeNull();
  });

  it("retorna null y cierra sesión expirada (>30 min)", async () => {
    const expiredDate = new Date(Date.now() - 31 * 60 * 1000);
    vi.mocked(prisma.mentalHealthSession.findUnique).mockResolvedValue({
      id: "s1",
      waId: "34600111222",
      comercialId: null,
      flujoActivo: "bloqueo",
      subtipoBloqueo: null,
      nivelEnergia: 3,
      turnCount: 5,
      lastMessageAt: expiredDate,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getActiveSession("34600111222");
    expect(result).toBeNull();
    expect(prisma.mentalHealthSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { waId: "34600111222" },
        data: expect.objectContaining({ closedAt: expect.any(Date) }),
      }),
    );
  });

  it("retorna sesión activa si está dentro del timeout", async () => {
    const recentDate = new Date(Date.now() - 5 * 60 * 1000);
    const session = {
      id: "s1",
      waId: "34600111222",
      comercialId: null,
      flujoActivo: "preparacion",
      subtipoBloqueo: null,
      nivelEnergia: 4,
      turnCount: 2,
      lastMessageAt: recentDate,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(prisma.mentalHealthSession.findUnique).mockResolvedValue(session);

    const result = await getActiveSession("34600111222");
    expect(result).toEqual(session);
  });
});
