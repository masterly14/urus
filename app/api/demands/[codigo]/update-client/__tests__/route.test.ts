import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandCurrentFindUnique = vi.fn();
const mockDemandCurrentUpdate = vi.fn();
const mockDemandSnapshotFindUnique = vi.fn();
const mockAppendEvent = vi.fn();
const mockCreateInmovillaRestClient = vi.fn();
const mockSearchClient = vi.fn();
const mockUpdateClient = vi.fn();

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
  createInmovillaRestClient: (...args: unknown[]) =>
    mockCreateInmovillaRestClient(...args),
}));

vi.mock("@/lib/inmovilla/rest/clients", () => ({
  searchClient: (...args: unknown[]) => mockSearchClient(...args),
  updateClient: (...args: unknown[]) => mockUpdateClient(...args),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/demands/DEM-001/update-client", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

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
  });

  it("bloquea que un comercial actualice el cliente de una demanda ajena", async () => {
    mockDemandCurrentFindUnique.mockResolvedValue({ comercialId: "com-2" });

    const { POST } = await import("../route");
    const res = await POST(request({ telefono1: 600111222 }), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(403);
    expect(mockDemandSnapshotFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateClient).not.toHaveBeenCalled();
    expect(mockDemandCurrentUpdate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});
