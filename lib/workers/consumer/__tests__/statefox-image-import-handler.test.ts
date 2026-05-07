import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/circuit-breaker", () => ({
  canExecute: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/statefox/image-cache/importer", () => ({
  importStatefoxPortalImages: vi.fn(),
}));

vi.mock("@/lib/statefox/image-cache", () => ({
  detectPortalSource: (url: string) => {
    if (url.includes("idealista.com")) return "idealista";
    if (url.includes("fotocasa.es")) return "fotocasa";
    return "unknown";
  },
}));

import { handleStatefoxImageImport } from "../statefox-image-import-handler";
import { canExecute, recordSuccess, recordFailure } from "@/lib/circuit-breaker";
import { importStatefoxPortalImages } from "@/lib/statefox/image-cache/importer";
import type { JobRecord } from "@/lib/job-queue/types";

const mockCanExecute = vi.mocked(canExecute);
const mockSuccess = vi.mocked(recordSuccess);
const mockFailure = vi.mocked(recordFailure);
const mockImport = vi.mocked(importStatefoxPortalImages);

function makeJob(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-1",
    type: "IMPORT_STATEFOX_PORTAL_IMAGES",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 80,
    attempts: 1,
    maxAttempts: 4,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanExecute.mockResolvedValue({
    allowed: true,
    state: { failureCount: 0, openedAt: null },
  } as never);
  mockSuccess.mockResolvedValue();
  mockFailure.mockResolvedValue();
});

describe("handleStatefoxImageImport", () => {
  it("falla permanentemente sin payload válido", async () => {
    const result = await handleStatefoxImageImport(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("falla permanentemente para portales no soportados", async () => {
    const job = makeJob({
      statefoxId: "id.1",
      portalUrl: "https://example.com/inmueble/1",
    });
    const result = await handleStatefoxImageImport(job);
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("respeta circuit breaker abierto sin invocar import", async () => {
    mockCanExecute.mockResolvedValueOnce({
      allowed: false,
      state: { failureCount: 5, openedAt: new Date() },
    } as never);
    const job = makeJob({
      statefoxId: "id.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });
    const result = await handleStatefoxImageImport(job);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Circuit breaker OPEN");
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("marca éxito y registra recordSuccess cuando IMPORTED", async () => {
    mockImport.mockResolvedValueOnce({
      statefoxId: "id.1",
      source: "idealista",
      status: "IMPORTED",
      importedCount: 3,
      candidateCount: 5,
    });
    const job = makeJob({
      statefoxId: "id.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });
    const result = await handleStatefoxImageImport(job);
    expect(result.success).toBe(true);
    expect(mockSuccess).toHaveBeenCalledWith("statefox-image-import:idealista");
    expect(mockFailure).not.toHaveBeenCalled();
  });

  it("trata BLOCKED como éxito (no retriable) sin tocar circuit breaker", async () => {
    mockImport.mockResolvedValueOnce({
      statefoxId: "id.1",
      source: "idealista",
      status: "BLOCKED",
      importedCount: 0,
      candidateCount: 0,
      errorReason: "Idealista 403",
    });
    const job = makeJob({
      statefoxId: "id.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });
    const result = await handleStatefoxImageImport(job);
    expect(result.success).toBe(true);
    expect(mockSuccess).toHaveBeenCalled();
    expect(mockFailure).not.toHaveBeenCalled();
  });

  it("devuelve error retriable y abre circuito cuando FAILED", async () => {
    mockImport.mockResolvedValueOnce({
      statefoxId: "id.1",
      source: "idealista",
      status: "FAILED",
      importedCount: 0,
      candidateCount: 0,
      errorReason: "Timeout cargando portal",
    });
    const job = makeJob({
      statefoxId: "id.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });
    const result = await handleStatefoxImageImport(job);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Timeout");
    expect(mockFailure).toHaveBeenCalledWith(
      "statefox-image-import:idealista",
      expect.stringContaining("Timeout"),
    );
  });
});
