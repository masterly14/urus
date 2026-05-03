import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandFindUnique = vi.fn();
const mockDeactivateDemand = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSession(...args),
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockDemandFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/demands/deactivate", () => ({
  deactivateDemand: (...args: unknown[]) => mockDeactivateDemand(...args),
}));

describe("POST /api/demands/[codigo]/deactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "c@example.com",
    });
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-1",
      leadStatus: "EN_SELECCION",
    });
    mockDeactivateDemand.mockResolvedValue({
      ok: true,
      leadStatus: "PERDIDO",
      inmovillaSyncQueued: false,
      eventId: "evt-deactivate",
    });
  });

  it("reutiliza el servicio de baja para demandas propias", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(200);
    expect(mockDeactivateDemand).toHaveBeenCalledWith(expect.objectContaining({
      demandId: "DEM-001",
      source: "platform-deactivate",
      updatedBy: "Comercial",
    }));
  });

  it("bloquea demandas de otro comercial", async () => {
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-2",
      leadStatus: "EN_SELECCION",
    });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(403);
    expect(mockDeactivateDemand).not.toHaveBeenCalled();
  });

  it("bloquea comerciales sin vinculacion aunque la demanda no tenga comercial", async () => {
    mockGetSession.mockResolvedValue({
      role: "comercial",
      comercialId: null,
      nombre: "Comercial sin ficha",
      email: "sin-ficha@example.com",
    });
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: null,
      leadStatus: "EN_SELECCION",
    });

    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(403);
    expect(mockDeactivateDemand).not.toHaveBeenCalled();
  });
});
