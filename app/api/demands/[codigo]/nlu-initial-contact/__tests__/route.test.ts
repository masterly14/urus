import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandFindUnique = vi.fn();
const mockStartInitialContact = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSession(...args),
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockDemandFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/nlu/initial-contact", () => ({
  startNluInitialContactForDemand: (...args: unknown[]) => mockStartInitialContact(...args),
}));

describe("POST /api/demands/[codigo]/nlu-initial-contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "c@example.com",
    });
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-1",
    });
    mockStartInitialContact.mockResolvedValue({
      ok: true,
      demandId: "DEM-001",
      waId: "34600111222",
      sent: true,
      eventId: "evt-nlu-contact",
      messageId: "wamid.test",
    });
  });

  it("rechaza peticiones sin sesión", async () => {
    mockGetSession.mockResolvedValue(null);

    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(401);
    expect(mockStartInitialContact).not.toHaveBeenCalled();
  });

  it("bloquea demandas de otro comercial", async () => {
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-2",
    });

    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(403);
    expect(mockStartInitialContact).not.toHaveBeenCalled();
  });

  it("devuelve 404 si la demanda no existe", async () => {
    mockDemandFindUnique.mockResolvedValue(null);

    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-404" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Demanda no encontrada");
    expect(mockStartInitialContact).not.toHaveBeenCalled();
  });

  it("inicia contacto NLU manual para demanda propia", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      sent: true,
      messageId: "wamid.test",
    });
    expect(mockStartInitialContact).toHaveBeenCalledWith({
      demandId: "DEM-001",
      source: "manual_ui",
      triggeredBy: {
        userId: "user-1",
        nombre: "Comercial",
      },
    });
  });

  it("propaga skippedReason sin reenviar cuando el servicio lo omite", async () => {
    mockStartInitialContact.mockResolvedValue({
      ok: true,
      demandId: "DEM-001",
      waId: "34600111222",
      sent: false,
      skippedReason: "recent_session",
      eventId: "evt-skip",
    });

    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      sent: false,
      skippedReason: "recent_session",
    });
  });
});
