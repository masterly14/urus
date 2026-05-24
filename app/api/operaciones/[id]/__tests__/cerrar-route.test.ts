import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionFromRequest,
  mockOperacionFindUnique,
  mockCloseOperacion,
} = vi.hoisted(() => ({
  mockGetSessionFromRequest: vi.fn(),
  mockOperacionFindUnique: vi.fn(),
  mockCloseOperacion: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSessionFromRequest(...args),
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operacion: {
      findUnique: (...args: unknown[]) => mockOperacionFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/operacion/close", () => ({
  closeOperacion: (...args: unknown[]) => mockCloseOperacion(...args),
}));

import { PATCH } from "../cerrar/route";

describe("PATCH /api/operaciones/[id]/cerrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFromRequest.mockResolvedValue({
      userId: "user-comercial",
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial Test",
      email: "comercial@example.com",
    });
    mockOperacionFindUnique.mockResolvedValue({ comercialId: "com-1" });
    mockCloseOperacion.mockResolvedValue({ ok: true });
  });

  it("devuelve 403 si un comercial intenta cerrar una operación ajena", async () => {
    mockOperacionFindUnique.mockResolvedValueOnce({ comercialId: "com-2" });

    const res = await PATCH(
      new Request("http://localhost/api/operaciones/op-2/cerrar", {
        method: "PATCH",
        body: JSON.stringify({ tipoCierre: "CERRADA_VENTA" }),
      }),
      { params: Promise.resolve({ id: "op-2" }) },
    );

    expect(res.status).toBe(403);
    expect(mockCloseOperacion).not.toHaveBeenCalled();
  });

  it("permite a CEO/admin cerrar cualquier operación", async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce({
      userId: "user-admin",
      role: "admin",
      comercialId: null,
      nombre: "Admin Test",
      email: "admin@example.com",
    });
    mockOperacionFindUnique.mockResolvedValueOnce({ comercialId: "com-2" });

    const res = await PATCH(
      new Request("http://localhost/api/operaciones/op-2/cerrar", {
        method: "PATCH",
        body: JSON.stringify({ tipoCierre: "CERRADA_VENTA" }),
      }),
      { params: Promise.resolve({ id: "op-2" }) },
    );

    expect(res.status).toBe(200);
    expect(mockCloseOperacion).toHaveBeenCalledWith(
      expect.objectContaining({
        operacionId: "op-2",
        tipoCierre: "CERRADA_VENTA",
      }),
    );
  });
});
