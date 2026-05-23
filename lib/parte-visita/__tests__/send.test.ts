import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockPropertyFindUnique = vi.fn();
const mockVisitSchedulingFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parteVisitaSession: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    propertyCurrent: {
      findUnique: (...args: unknown[]) => mockPropertyFindUnique(...args),
    },
    visitSchedulingSession: {
      findUnique: (...args: unknown[]) => mockVisitSchedulingFindUnique(...args),
    },
  },
}));

const mockResolveComercial = vi.fn();
const mockNormalizePhone = vi.fn();
vi.mock("@/lib/routing/resolve-comercial", () => ({
  resolveComercial: (...args: unknown[]) => mockResolveComercial(...args),
}));
vi.mock("@/lib/routing/comercial-whatsapp", () => ({
  normalizeComercialWhatsappPhone: (...args: unknown[]) =>
    mockNormalizePhone(...args),
}));

const mockSendContexto = vi.fn();
const mockSendFlow = vi.fn();
vi.mock("@/lib/parte-visita/whatsapp", () => ({
  sendParteVisitaContexto: (...args: unknown[]) => mockSendContexto(...args),
  sendParteVisitaFlow: (...args: unknown[]) => mockSendFlow(...args),
}));

const mockResolveBuyerName = vi.fn();
vi.mock("@/lib/parte-visita/resolve-buyer-name", () => ({
  resolveParteVisitaBuyerName: (...args: unknown[]) =>
    mockResolveBuyerName(...args),
}));

import { sendParteVisitaForSession } from "../send";

function makeSession(overrides: Partial<{ state: string }> = {}) {
  return {
    id: "parte-1",
    visitSessionId: "visit-1",
    state: overrides.state ?? "PENDING",
    comercialId: "com-1",
    buyerPhone: "34600000000",
    propertyCode: "P1",
    propertyRef: "REF-1",
    direccion: "Calle 1",
    tipoOperacion: "VENTA",
    precio: 100_000,
    buyerNombre: "Test Buyer",
    draftDemandId: null,
    visitDateTime: new Date("2026-06-01T10:00:00Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveComercial.mockResolvedValue({
    id: "com-1",
    nombre: "Miguel",
    activo: true,
  });
  mockNormalizePhone.mockReturnValue("34601000000");
  mockResolveBuyerName.mockResolvedValue("Amalia");
  mockPropertyFindUnique.mockResolvedValue({
    titulo: "Piso 3 hab",
    portalUrl: "https://idealista.com/x",
  });
  mockVisitSchedulingFindUnique.mockResolvedValue({ state: "VISIT_CONFIRMED" });
  mockSendContexto.mockResolvedValue({});
  mockSendFlow.mockResolvedValue({});
});

describe("sendParteVisitaForSession — race condition fix", () => {
  it("envía contexto y flow y marca como FORMULARIO_ENVIADO (camino feliz)", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession());
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({ ok: true, status: "sent" });
    expect(mockSendContexto).toHaveBeenCalledOnce();
    expect(mockSendFlow).toHaveBeenCalledOnce();
    expect(mockUpdateMany).toHaveBeenCalledOnce();
    const claimArgs = mockUpdateMany.mock.calls[0][0];
    expect(claimArgs.where).toEqual({ id: "parte-1", state: "PENDING" });
    expect(claimArgs.data).toEqual({ state: "FORMULARIO_ENVIADO" });
  });

  it("si el claim falla (count=0), NO envía el Flow — otro proceso ganó la carrera", async () => {
    mockFindUnique
      .mockResolvedValueOnce(makeSession())
      // Re-lectura tras claim fallido:
      .mockResolvedValueOnce({ state: "FORMULARIO_ENVIADO" });
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: true,
      status: "already_sent",
      sessionState: "FORMULARIO_ENVIADO",
    });
    expect(mockSendContexto).toHaveBeenCalledOnce(); // contexto sí salió
    expect(mockSendFlow).not.toHaveBeenCalled(); // flow NO duplicado
  });

  it("si el envío del Flow falla, hace rollback FORMULARIO_ENVIADO → PENDING", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession());
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockSendFlow.mockRejectedValueOnce(new Error("Meta timeout"));

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: false,
      permanent: false,
      error: "flow: Meta timeout",
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    const rollbackArgs = mockUpdateMany.mock.calls[1][0];
    expect(rollbackArgs.where).toEqual({
      id: "parte-1",
      state: "FORMULARIO_ENVIADO",
    });
    expect(rollbackArgs.data).toEqual({ state: "PENDING" });
  });

  it("si el envío del contexto falla, NO hace claim ni envía Flow", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession());
    mockSendContexto.mockRejectedValueOnce(new Error("Meta 500"));

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: false,
      permanent: false,
      error: "contexto: Meta 500",
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockSendFlow).not.toHaveBeenCalled();
  });

  it("si la visita ya fue cancelada, cancela el parte y no envía WhatsApp", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession());
    mockVisitSchedulingFindUnique.mockResolvedValueOnce({ state: "VISIT_CANCELLED" });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: true,
      status: "not_pending",
      sessionState: "CANCELADA",
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "parte-1",
        state: { in: ["PENDING", "FORMULARIO_ENVIADO"] },
      },
      data: { state: "CANCELADA" },
    });
    expect(mockSendContexto).not.toHaveBeenCalled();
    expect(mockSendFlow).not.toHaveBeenCalled();
  });

  it("si la visita se cancela tras el claim, no envía el Flow", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession());
    mockVisitSchedulingFindUnique
      .mockResolvedValueOnce({ state: "VISIT_CONFIRMED" })
      .mockResolvedValueOnce({ state: "VISIT_CANCELLED" });
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: true,
      status: "not_pending",
      sessionState: "CANCELADA",
    });
    expect(mockSendContexto).toHaveBeenCalledOnce();
    expect(mockSendFlow).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "parte-1",
        state: { in: ["PENDING", "FORMULARIO_ENVIADO"] },
      },
      data: { state: "CANCELADA" },
    });
  });

  it("si la sesión ya no está en PENDING al leerla, devuelve already_sent sin enviar", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession({ state: "FORMULARIO_ENVIADO" }));

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: true,
      status: "already_sent",
      sessionState: "FORMULARIO_ENVIADO",
    });
    expect(mockSendContexto).not.toHaveBeenCalled();
    expect(mockSendFlow).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("sin teléfono de comercial, devuelve error permanente", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSession());
    mockNormalizePhone.mockReturnValueOnce(null);

    const result = await sendParteVisitaForSession("parte-1");

    expect(result).toEqual({
      ok: false,
      permanent: true,
      error: expect.stringContaining("sin teléfono WhatsApp"),
    });
  });
});
