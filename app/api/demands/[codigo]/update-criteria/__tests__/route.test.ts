import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockDemandFindUnique = vi.fn();
const mockDemandUpdate = vi.fn();
const mockAppendEvent = vi.fn();
const mockEnqueueJob = vi.fn();

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
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

describe("POST /api/demands/[codigo]/update-criteria", () => {
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
    });
    mockDemandUpdate.mockResolvedValue({});
    mockAppendEvent.mockResolvedValue({ id: "evt-criteria", type: "DEMANDA_ACTUALIZADA" });
    mockEnqueueJob.mockResolvedValue({ id: "job-criteria" });
  });

  it("permite editar criterios de una demanda propia", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ presupuestoMax: 250000 }),
      }),
      { params: Promise.resolve({ codigo: "DEM-001" }) },
    );

    expect(res.status).toBe(200);
    expect(mockDemandUpdate).toHaveBeenCalledWith({
      where: { codigo: "DEM-001" },
      data: { presupuestoMax: 250000 },
    });
    expect(mockAppendEvent).toHaveBeenCalled();
  });

  it("bloquea la edición de criterios de otra comercial", async () => {
    mockDemandFindUnique.mockResolvedValue({
      codigo: "DEM-001",
      comercialId: "com-2",
    });

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ presupuestoMax: 250000 }),
      }),
      { params: Promise.resolve({ codigo: "DEM-001" }) },
    );

    expect(res.status).toBe(403);
    expect(mockDemandUpdate).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});
