import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandCurrentFindUnique = vi.fn();
const mockDemandSnapshotFindUnique = vi.fn();
const mockDemandCurrentUpdate = vi.fn();
const mockAppendEvent = vi.fn();
const mockUpdateClient = vi.fn();
const mockSearchClient = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSession(...args),
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockDemandCurrentFindUnique(...args),
      update: (...args: unknown[]) => mockDemandCurrentUpdate(...args),
    },
    demandSnapshot: {
      findUnique: (...args: unknown[]) => mockDemandSnapshotFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/inmovilla/rest/client", () => ({
  createInmovillaRestClient: () => ({ token: "test-token" }),
}));

vi.mock("@/lib/inmovilla/rest/clients", () => ({
  updateClient: (...args: unknown[]) => mockUpdateClient(...args),
  searchClient: (...args: unknown[]) => mockSearchClient(...args),
}));

describe("POST /api/demands/[codigo]/update-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "c@example.com",
    });
    mockDemandCurrentFindUnique.mockResolvedValue({ comercialId: "com-1" });
    mockDemandSnapshotFindUnique.mockResolvedValue({ raw: { keycli: "123" } });
    mockSearchClient.mockResolvedValue([]);
    mockUpdateClient.mockResolvedValue({});
    mockAppendEvent.mockResolvedValue({ id: "evt-1", type: "DEMANDA_ACTUALIZADA" });
  });

  it("bloquea a un comercial que intenta editar datos de otra demanda", async () => {
    mockDemandCurrentFindUnique.mockResolvedValue({ comercialId: "com-2" });
    const { POST } = await import("../route");

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ telefono1: 600111222 }),
      }),
      { params: Promise.resolve({ codigo: "DEM-001" }) },
    );

    expect(res.status).toBe(403);
    expect(mockDemandSnapshotFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateClient).not.toHaveBeenCalled();
    expect(mockDemandCurrentUpdate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});
