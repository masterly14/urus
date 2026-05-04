import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandFindUnique = vi.fn();
const mockDemandUpdate = vi.fn();
const mockDemandSnapshotFindUnique = vi.fn();
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
      findUnique: (...args: unknown[]) => mockDemandFindUnique(...args),
      update: (...args: unknown[]) => mockDemandUpdate(...args),
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
    vi.stubEnv("INMOVILLA_API_TOKEN", "test-token");
    mockGetSession.mockResolvedValue({
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "c@example.com",
    });
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-1",
    });
    mockDemandSnapshotFindUnique.mockResolvedValue({
      raw: { keycli: "123" },
    });
    mockSearchClient.mockResolvedValue([]);
    mockUpdateClient.mockResolvedValue({});
    mockDemandUpdate.mockResolvedValue({});
    mockAppendEvent.mockResolvedValue({ id: "evt-1" });
  });

  it("permite actualizar datos del cliente en demandas propias", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ nombre: "Ana", email: "ana@example.com" }),
      }),
      { params: Promise.resolve({ codigo: "DEM-001" }) },
    );

    expect(res.status).toBe(200);
    expect(mockUpdateClient).toHaveBeenCalledWith(
      { token: "test-token" },
      123,
      expect.objectContaining({ nombre: "Ana", email: "ana@example.com" }),
    );
  });

  it("bloquea la edición de clientes vinculados a demandas de otro comercial", async () => {
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-2",
    });

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ nombre: "Ana" }),
      }),
      { params: Promise.resolve({ codigo: "DEM-001" }) },
    );

    expect(res.status).toBe(403);
    expect(mockDemandSnapshotFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateClient).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});
