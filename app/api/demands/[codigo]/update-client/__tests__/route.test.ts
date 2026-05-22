import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandCurrentFindUnique = vi.fn();
const mockDemandCurrentUpdate = vi.fn();
const mockDemandSnapshotFindUnique = vi.fn();
const mockCreateRestClient = vi.fn();
const mockSearchClient = vi.fn();
const mockUpdateClient = vi.fn();
const mockAppendEvent = vi.fn();

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

vi.mock("@/lib/inmovilla/rest/client", () => ({
  createInmovillaRestClient: (...args: unknown[]) => mockCreateRestClient(...args),
}));

vi.mock("@/lib/inmovilla/rest/clients", () => ({
  searchClient: (...args: unknown[]) => mockSearchClient(...args),
  updateClient: (...args: unknown[]) => mockUpdateClient(...args),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
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
    vi.stubEnv("INMOVILLA_API_TOKEN", "test-token");
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "c@example.com",
    });
    mockDemandCurrentFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-1",
    });
    mockDemandCurrentUpdate.mockResolvedValue({ codigo: "DEM-001" });
    mockDemandSnapshotFindUnique.mockResolvedValue({
      raw: { keycli: "123" },
    });
    mockCreateRestClient.mockReturnValue({ token: "test-token" });
    mockSearchClient.mockResolvedValue([]);
    mockUpdateClient.mockResolvedValue({});
    mockAppendEvent.mockResolvedValue({ id: "evt-update-client" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("actualiza cliente de Inmovilla para demanda propia", async () => {
    const { POST } = await import("../route");
    const res = await POST(request({ telefono1: 600111222, prefijotel1: 34 }), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true });
    expect(mockUpdateClient).toHaveBeenCalledWith(
      { token: "test-token" },
      123,
      expect.objectContaining({ telefono1: 600111222, prefijotel1: 34 }),
    );
    expect(mockDemandCurrentUpdate).toHaveBeenCalledWith({
      where: { codigo: "DEM-001" },
      data: { telefono: "34600111222" },
    });
  });

  it("bloquea a comerciales que intentan actualizar demandas ajenas", async () => {
    mockDemandCurrentFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-2",
    });

    const { POST } = await import("../route");
    const res = await POST(request({ telefono1: 600111222, prefijotel1: 34 }), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(403);
    expect(mockDemandSnapshotFindUnique).not.toHaveBeenCalled();
    expect(mockSearchClient).not.toHaveBeenCalled();
    expect(mockUpdateClient).not.toHaveBeenCalled();
    expect(mockDemandCurrentUpdate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("permite a admin actualizar una demanda de otro comercial", async () => {
    mockGetSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      comercialId: null,
      nombre: "Admin",
      email: "admin@example.com",
    });
    mockDemandCurrentFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-2",
    });

    const { POST } = await import("../route");
    const res = await POST(request({ telefono1: 600111222, prefijotel1: 34 }), {
      params: Promise.resolve({ codigo: "DEM-001" }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateClient).toHaveBeenCalled();
  });
});
