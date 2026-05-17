import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDemandCurrentFindMany, mockDemandCurrentGroupBy, mockDemandSnapshotFindMany, mockGetSession } =
  vi.hoisted(() => ({
    mockDemandCurrentFindMany: vi.fn(),
    mockDemandCurrentGroupBy: vi.fn(),
    mockDemandSnapshotFindMany: vi.fn(),
    mockGetSession: vi.fn(),
  }));

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
      findMany: (...args: unknown[]) => mockDemandCurrentFindMany(...args),
      groupBy: (...args: unknown[]) => mockDemandCurrentGroupBy(...args),
    },
    demandSnapshot: {
      findMany: (...args: unknown[]) => mockDemandSnapshotFindMany(...args),
    },
  },
}));

const baseDemand = {
  telefono: "",
  zonas: "",
  tipos: "",
  presupuestoMin: 0,
  presupuestoMax: 0,
  habitacionesMin: 0,
  metrosMin: null,
  metrosMax: null,
  agente: "",
  comercialId: null,
  leadStatus: "NUEVO",
  fechaActualizacion: "",
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  lastEventAt: new Date("2026-05-01T00:00:00Z"),
};

describe("GET /api/demands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      userId: "user-ceo",
      role: "ceo",
      comercialId: null,
      nombre: "CEO",
      email: "ceo@example.com",
    });
    mockDemandCurrentGroupBy.mockResolvedValue([
      { leadStatus: "NUEVO", _count: { _all: 2 } },
    ]);
  });

  it("ordena el listado por la última sincronización registrada en snapshots", async () => {
    mockDemandCurrentFindMany
      .mockResolvedValueOnce([{ codigo: "DEM-OLD" }, { codigo: "DEM-NEW" }])
      .mockResolvedValueOnce([
        { ...baseDemand, codigo: "DEM-OLD", nombre: "Demanda antigua" },
        { ...baseDemand, codigo: "DEM-NEW", nombre: "Demanda reciente" },
      ]);
    mockDemandSnapshotFindMany.mockResolvedValue([
      { codigo: "DEM-NEW" },
      { codigo: "DEM-OLD" },
    ]);

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/demands?limit=2"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.demands.map((demand: { codigo: string }) => demand.codigo)).toEqual([
      "DEM-NEW",
      "DEM-OLD",
    ]);
    expect(mockDemandSnapshotFindMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [
        { lastSeenAt: "desc" },
        { fechaActualizacion: "desc" },
        { updatedAt: "desc" },
        { codigo: "desc" },
      ],
    }));
  });
});
