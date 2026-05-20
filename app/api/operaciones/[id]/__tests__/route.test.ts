import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionFromRequest,
  mockOperacionFindUnique,
  mockLegalDocumentCount,
  mockSignatureRequestCount,
  mockColaboradorAsignacionDeleteMany,
  mockOperacionDelete,
  mockTransaction,
  mockAppendEvent,
} = vi.hoisted(() => ({
  mockGetSessionFromRequest: vi.fn(),
  mockOperacionFindUnique: vi.fn(),
  mockLegalDocumentCount: vi.fn(),
  mockSignatureRequestCount: vi.fn(),
  mockColaboradorAsignacionDeleteMany: vi.fn(),
  mockOperacionDelete: vi.fn(),
  mockTransaction: vi.fn(),
  mockAppendEvent: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSessionFromRequest(...args),
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    operacion: {
      findUnique: (...args: unknown[]) => mockOperacionFindUnique(...args),
      delete: (...args: unknown[]) => mockOperacionDelete(...args),
    },
    colaboradorAsignacion: {
      deleteMany: (...args: unknown[]) => mockColaboradorAsignacionDeleteMany(...args),
    },
    legalDocument: {
      count: (...args: unknown[]) => mockLegalDocumentCount(...args),
    },
    signatureRequest: {
      count: (...args: unknown[]) => mockSignatureRequestCount(...args),
    },
  },
}));

import { DELETE } from "../route";

describe("DELETE /api/operaciones/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFromRequest.mockResolvedValue({
      userId: "user-1",
      role: "admin",
      comercialId: null,
      nombre: "Admin Test",
      email: "admin@example.com",
    });
    mockOperacionFindUnique.mockResolvedValue({
      id: "op-1",
      codigo: "OP-2026-0001",
      propertyCode: "PROP-001",
      estado: "EN_CURSO",
    });
    mockLegalDocumentCount.mockResolvedValue(0);
    mockSignatureRequestCount.mockResolvedValue(0);
    mockColaboradorAsignacionDeleteMany.mockResolvedValue({ count: 0 });
    mockOperacionDelete.mockResolvedValue({ id: "op-1" });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        colaboradorAsignacion: {
          deleteMany: (...args: unknown[]) => mockColaboradorAsignacionDeleteMany(...args),
        },
        operacion: {
          delete: (...args: unknown[]) => mockOperacionDelete(...args),
        },
      }),
    );
    mockAppendEvent.mockResolvedValue({ id: "evt-1" });
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce(null);

    const res = await DELETE(new Request("http://localhost/api/operaciones/op-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "op-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("devuelve 404 cuando la operación no existe", async () => {
    mockOperacionFindUnique.mockResolvedValueOnce(null);

    const res = await DELETE(new Request("http://localhost/api/operaciones/op-missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "op-missing" }),
    });

    expect(res.status).toBe(404);
    expect(mockOperacionDelete).not.toHaveBeenCalled();
  });

  it("devuelve 409 si la operación está cerrada", async () => {
    mockOperacionFindUnique.mockResolvedValueOnce({
      id: "op-2",
      codigo: "OP-2026-0002",
      propertyCode: "PROP-002",
      estado: "CERRADA_VENTA",
    });

    const res = await DELETE(new Request("http://localhost/api/operaciones/op-2", { method: "DELETE" }), {
      params: Promise.resolve({ id: "op-2" }),
    });

    expect(res.status).toBe(409);
    expect(mockOperacionDelete).not.toHaveBeenCalled();
  });

  it("devuelve 409 si hay documentos o firmas asociadas", async () => {
    mockLegalDocumentCount.mockResolvedValueOnce(1);

    const res = await DELETE(new Request("http://localhost/api/operaciones/op-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "op-1" }),
    });

    expect(res.status).toBe(409);
    expect(mockOperacionDelete).not.toHaveBeenCalled();
  });

  it("elimina la operación y registra OPERACION_ELIMINADA", async () => {
    const res = await DELETE(new Request("http://localhost/api/operaciones/op-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "op-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockColaboradorAsignacionDeleteMany).toHaveBeenCalledWith({
      where: { operacionId: "op-1" },
    });
    expect(mockOperacionDelete).toHaveBeenCalledWith({ where: { id: "op-1" } });
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OPERACION_ELIMINADA",
        aggregateType: "OPERACION",
        aggregateId: "PROP-001",
      }),
    );
  });

  it("no revienta si falla el append del evento", async () => {
    mockAppendEvent.mockRejectedValueOnce(new Error("event-store-down"));

    const res = await DELETE(new Request("http://localhost/api/operaciones/op-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "op-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockOperacionDelete).toHaveBeenCalledWith({ where: { id: "op-1" } });
  });
});
