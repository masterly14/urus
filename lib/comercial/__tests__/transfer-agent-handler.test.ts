import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/inmovilla/rest/client", () => ({
  createInmovillaRestClient: vi.fn(),
}));

vi.mock("@/lib/inmovilla/rest/safe-update", () => ({
  safeUpdateProperty: vi.fn(),
}));

import { handleTransferPropertyAgent } from "../transfer-agent-handler";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { safeUpdateProperty } from "@/lib/inmovilla/rest/safe-update";
import type { JobRecord } from "@/lib/job-queue/types";

const mockSafeUpdate = vi.mocked(safeUpdateProperty);
const mockCreateClient = vi.mocked(createInmovillaRestClient);

const mockPost = vi.fn();
const originalSafeAttemptsEnv = process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS;

function makeJob(
  payload: Record<string, unknown>,
  overrides: Partial<JobRecord> = {},
): JobRecord {
  return {
    id: "job-transfer-001",
    type: "TRANSFER_PROPERTY_AGENT",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 100,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS;
  mockPost.mockResolvedValue({ codigo: 202, mensaje: "Propiedad actualizada" });
  mockCreateClient.mockReturnValue(
    {
      post: mockPost,
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as never,
  );
});

afterEach(() => {
  if (originalSafeAttemptsEnv === undefined) {
    delete process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS;
  } else {
    process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS = originalSafeAttemptsEnv;
  }
});

describe("handleTransferPropertyAgent — validación de payload", () => {
  it("devuelve permanent=true cuando propertyRef está vacío", async () => {
    const job = makeJob({ newKeyagente: 123 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(false);
    expect(res.permanent).toBe(true);
    expect(res.error).toMatch(/propertyRef/);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSafeUpdate).not.toHaveBeenCalled();
  });

  it("devuelve permanent=true cuando newKeyagente no es numérico", async () => {
    const job = makeJob({ propertyRef: "REF-001", newKeyagente: "abc" });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(false);
    expect(res.permanent).toBe(true);
    expect(res.error).toMatch(/newKeyagente/);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSafeUpdate).not.toHaveBeenCalled();
  });
});

describe("handleTransferPropertyAgent — path mínimo (ref + keyagente)", () => {
  it("usa payload mínimo y no llama safeUpdate si el POST mínimo funciona", async () => {
    const job = makeJob({
      propertyRef: "URUS116VMA",
      newKeyagente: 177892,
      comercialTransferId: "com-target-id",
    });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/propiedades/", {
      ref: "URUS116VMA",
      keyagente: "177892",
    });
    expect(mockSafeUpdate).not.toHaveBeenCalled();
  });

  it("acepta newKeyagente como string numérico", async () => {
    const job = makeJob({
      propertyRef: "REF-001",
      newKeyagente: "456",
    });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith("/propiedades/", {
      ref: "REF-001",
      keyagente: "456",
    });
  });

  it("si el POST mínimo devuelve 408 rate-limit, NO hace fallback", async () => {
    mockPost.mockRejectedValueOnce(
      new Error(
        "408 Request Time-out: Has superado el límite de peticiones. Para peticiones de tipo -propiedades- sólo es posible realizar 10 cada 1 minuto/s.",
      ),
    );

    const job = makeJob({ propertyRef: "REF-RL", newKeyagente: 123 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Has superado el límite/);
    expect(mockSafeUpdate).not.toHaveBeenCalled();
  });

  it("si keyagente es inválido, devuelve error permanente sin fallback", async () => {
    mockPost.mockRejectedValueOnce(
      new Error("406 Not Acceptable: El campo keyagente no es valido"),
    );

    const job = makeJob({ propertyRef: "REF-BAD-AGENT", newKeyagente: 999999 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(false);
    expect(res.permanent).toBe(true);
    expect(mockSafeUpdate).not.toHaveBeenCalled();
  });
});

describe("handleTransferPropertyAgent — fallback safeUpdateProperty", () => {
  it("hace fallback cuando el POST mínimo falla por validación estructural (406)", async () => {
    mockPost.mockRejectedValueOnce(
      new Error("406 Not Acceptable: El parametro idArea no es valido"),
    );
    mockSafeUpdate.mockResolvedValue({
      ok: true,
      payload: {},
      removedFields: [],
    });

    const job = makeJob({ propertyRef: "REF-X", newKeyagente: 1 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(true);
    expect(mockSafeUpdate).toHaveBeenCalledTimes(1);
    expect(mockSafeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { ref: "REF-X" },
      { keyagente: "1" },
      { maxAttempts: 12 },
    );
  });

  it("respeta TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS en el fallback", async () => {
    process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS = "4";
    mockPost.mockRejectedValueOnce(new Error("406 Not Acceptable: Campo requerido"));
    mockSafeUpdate.mockResolvedValue({
      ok: true,
      payload: {},
      removedFields: [],
    });

    const job = makeJob({ propertyRef: "REF-ENV", newKeyagente: 99 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(true);
    expect(mockSafeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { ref: "REF-ENV" },
      { keyagente: "99" },
      { maxAttempts: 4 },
    );
  });

  it("devuelve error cuando safeUpdateProperty devuelve ok=false", async () => {
    mockPost.mockRejectedValueOnce(new Error("406 Not Acceptable: El parametro idArea no es valido"));
    mockSafeUpdate.mockResolvedValue({
      ok: false,
      payload: {},
      removedFields: [],
    });

    const job = makeJob({ propertyRef: "REF-FAIL", newKeyagente: 11 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/safeUpdateProperty devolvió ok=false/);
  });

  it("devuelve error cuando safeUpdateProperty lanza excepción", async () => {
    mockPost.mockRejectedValueOnce(new Error("406 Not Acceptable: Campo requerido"));
    mockSafeUpdate.mockRejectedValueOnce(new Error("Inmovilla 500"));

    const job = makeJob({ propertyRef: "REF-ERR", newKeyagente: 22 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(false);
    expect(res.error).toBe("Inmovilla 500");
    expect(res.permanent).toBeUndefined();
  });

  it("loguea removedFields cuando el fallback limpia campos inválidos", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockPost.mockRejectedValueOnce(new Error("406 Not Acceptable: El parametro idArea no es valido"));
    mockSafeUpdate.mockResolvedValue({
      ok: true,
      payload: {},
      removedFields: ["keycli", "precio"],
    });

    const job = makeJob({ propertyRef: "REF-LOG", newKeyagente: 33 });
    const res = await handleTransferPropertyAgent(job);

    expect(res.success).toBe(true);
    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toMatch(/campos removidos: keycli, precio/);

    logSpy.mockRestore();
  });
});
