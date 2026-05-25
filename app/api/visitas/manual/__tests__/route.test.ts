import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandFindUnique = vi.fn();
const mockComercialFindUnique = vi.fn();
const mockEnumTipoFindFirst = vi.fn();
const mockEnumCiudadFindFirst = vi.fn();
const mockCreateManualVisitWorkItem = vi.fn();
const mockSerializeVisitWorkItem = vi.fn();

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
    comercial: {
      findUnique: (...args: unknown[]) => mockComercialFindUnique(...args),
    },
    inmovillaEnumTipo: {
      findFirst: (...args: unknown[]) => mockEnumTipoFindFirst(...args),
    },
    inmovillaEnumCiudad: {
      findFirst: (...args: unknown[]) => mockEnumCiudadFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/visitas/work-items", () => ({
  createManualVisitWorkItem: (...args: unknown[]) => mockCreateManualVisitWorkItem(...args),
  serializeVisitWorkItem: (...args: unknown[]) => mockSerializeVisitWorkItem(...args),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/visitas/manual", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/visitas/manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      role: "comercial",
      comercialId: "com-1",
    });
    mockDemandFindUnique.mockResolvedValue({ comercialId: "com-1", telefono: "34600111222" });
    mockComercialFindUnique.mockResolvedValue({ id: "com-1", ciudad: "Cordoba" });
    mockEnumTipoFindFirst.mockResolvedValue({ valor: 2799 });
    mockEnumCiudadFindFirst.mockResolvedValue({ key_loca: 1 });
    mockCreateManualVisitWorkItem.mockResolvedValue({
      created: true,
      workItem: { id: "vwi-manual" },
    });
    mockSerializeVisitWorkItem.mockReturnValue({ id: "vwi-manual" });
  });

  it("crea una visita manual para demanda propia", async () => {
    const { POST } = await import("../route");
    const res = await POST(request({ demandId: "DEM-1", propertyId: "PROP-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.workItem.id).toBe("vwi-manual");
    expect(mockCreateManualVisitWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      demandId: "DEM-1",
      propertyId: "PROP-1",
      comercialId: "com-1",
    }));
  });

  it("bloquea demanda de otro comercial", async () => {
    mockDemandFindUnique.mockResolvedValue({ comercialId: "com-2" });

    const { POST } = await import("../route");
    const res = await POST(request({ demandId: "DEM-1", propertyId: "PROP-1" }));

    expect(res.status).toBe(403);
    expect(mockCreateManualVisitWorkItem).not.toHaveBeenCalled();
  });

  it("bloquea demanda ajena aunque el payload fuerce el comercial propio", async () => {
    mockDemandFindUnique.mockResolvedValue({
      comercialId: "com-2",
      telefono: "34600111222",
    });

    const { POST } = await import("../route");
    const res = await POST(
      request({
        demandId: "DEM-1",
        propertyId: "PROP-1",
        comercialId: "com-1",
      }),
    );

    expect(res.status).toBe(403);
    expect(mockCreateManualVisitWorkItem).not.toHaveBeenCalled();
  });

  it("rechaza creación manual si la demanda no tiene teléfono", async () => {
    mockDemandFindUnique.mockResolvedValue({ comercialId: "com-1", telefono: "" });

    const { POST } = await import("../route");
    const res = await POST(request({ demandId: "DEM-1", propertyId: "PROP-1" }));

    expect(res.status).toBe(400);
    expect(mockCreateManualVisitWorkItem).not.toHaveBeenCalled();
  });
});
