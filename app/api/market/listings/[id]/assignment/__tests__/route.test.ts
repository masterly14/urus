import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFindListing = vi.fn();
const mockUpdateListing = vi.fn();
const mockFindRegisteredUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketListing: {
      findUnique: (...args: unknown[]) => mockFindListing(...args),
      update: (...args: unknown[]) => mockUpdateListing(...args),
    },
    user: {
      findFirst: (...args: unknown[]) => mockFindRegisteredUser(...args),
    },
  },
}));

function request(body: unknown) {
  return new Request("http://localhost/api/market/listings/lst-1/assignment", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/market/listings/[id]/assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      userId: "user-admin",
      role: "admin",
      nombre: "Admin",
      email: "admin@example.com",
      comercialId: null,
    });
    mockFindListing.mockResolvedValue({
      id: "lst-1",
      assignedComercialId: null,
      assignedAt: null,
      assignedByUserId: null,
      assignedComercial: null,
    });
    mockFindRegisteredUser.mockResolvedValue({
      id: "user-com-1",
      comercial: { id: "com-1", nombre: "Marina" },
    });
    mockUpdateListing.mockResolvedValue({
      assignedComercialId: "com-1",
      assignedAt: new Date("2026-05-07T11:00:00Z"),
      assignedByUserId: "user-admin",
      assignedComercial: { id: "com-1", nombre: "Marina" },
    });
  });

  it("devuelve 401 cuando no hay sesion", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const { PATCH } = await import("../route");
    const response = await PATCH(request({ comercialId: "com-1" }), {
      params: Promise.resolve({ id: "lst-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("devuelve 404 si el listing no existe", async () => {
    mockFindListing.mockResolvedValueOnce(null);
    const { PATCH } = await import("../route");
    const response = await PATCH(request({ comercialId: "com-1" }), {
      params: Promise.resolve({ id: "lst-404" }),
    });
    expect(response.status).toBe(404);
  });

  it("asigna comercial registrado", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request({ comercialId: "com-1" }), {
      params: Promise.resolve({ id: "lst-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindRegisteredUser).toHaveBeenCalled();
    expect(mockUpdateListing).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lst-1" },
        data: expect.objectContaining({
          assignedComercialId: "com-1",
          assignedByUserId: "user-admin",
        }),
      }),
    );
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ASSIGNED");
    expect(body.assignment.comercialId).toBe("com-1");
  });

  it("devuelve 422 cuando el comercial no esta registrado o esta inactivo", async () => {
    mockFindRegisteredUser.mockResolvedValueOnce(null);
    const { PATCH } = await import("../route");
    const response = await PATCH(request({ comercialId: "com-missing" }), {
      params: Promise.resolve({ id: "lst-1" }),
    });
    expect(response.status).toBe(422);
    expect(mockUpdateListing).not.toHaveBeenCalled();
  });

  it("desasigna comercial cuando llega null", async () => {
    mockFindListing.mockResolvedValueOnce({
      id: "lst-1",
      assignedComercialId: "com-1",
      assignedAt: new Date("2026-05-07T11:00:00Z"),
      assignedByUserId: "user-admin",
      assignedComercial: { id: "com-1", nombre: "Marina" },
    });
    mockUpdateListing.mockResolvedValueOnce({
      assignedComercialId: null,
      assignedAt: null,
      assignedByUserId: null,
      assignedComercial: null,
    });
    const { PATCH } = await import("../route");
    const response = await PATCH(request({ comercialId: null }), {
      params: Promise.resolve({ id: "lst-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("UNASSIGNED");
    expect(body.assignment.comercialId).toBeNull();
  });
});
