import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importStatefoxPortalImages: vi.fn(),
  hasTerminalImageImportState: vi.fn(),
  getImportedImagesByStatefoxIds: vi.fn(),
  enqueueStatefoxImageImport: vi.fn(),
}));

vi.mock("@/lib/statefox/image-cache", async () => {
  const portal = await vi.importActual<typeof import("@/lib/statefox/image-cache/portal")>(
    "../../../statefox/image-cache/portal",
  );
  return {
    importStatefoxPortalImages: mocks.importStatefoxPortalImages,
    hasTerminalImageImportState: mocks.hasTerminalImageImportState,
    getImportedImagesByStatefoxIds: mocks.getImportedImagesByStatefoxIds,
    enqueueStatefoxImageImport: mocks.enqueueStatefoxImageImport,
    detectPortalSource: portal.detectPortalSource,
    normalizePortalUrl: portal.normalizePortalUrl,
    toCloudinaryUrls: (rows: Array<{ cloudinarySecureUrl: string | null }>) =>
      rows.map((r) => r.cloudinarySecureUrl).filter((u): u is string => Boolean(u)),
  };
});

import { ImageWorkerRuntime } from "../runtime";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasTerminalImageImportState.mockResolvedValue(false);
  mocks.getImportedImagesByStatefoxIds.mockResolvedValue(new Map());
  mocks.enqueueStatefoxImageImport.mockResolvedValue(true);
});

describe("ImageWorkerRuntime.isAuthorized", () => {
  it("acepta solo el secret exacto", () => {
    const runtime = new ImageWorkerRuntime({ secret: "shh" });
    expect(runtime.isAuthorized("shh")).toBe(true);
    expect(runtime.isAuthorized("nope")).toBe(false);
    expect(runtime.isAuthorized(undefined)).toBe(false);
    expect(runtime.isAuthorized("")).toBe(false);
  });
});

describe("ImageWorkerRuntime.validatePayload", () => {
  it("valida statefoxId y portalUrl obligatorios", () => {
    const runtime = new ImageWorkerRuntime({ secret: "x" });
    const result = runtime.validatePayload({ statefoxId: "", portalUrl: "" });
    expect(result.ok).toBe(false);
  });

  it("rechaza portales no soportados", () => {
    const runtime = new ImageWorkerRuntime({ secret: "x" });
    const result = runtime.validatePayload({ statefoxId: "id", portalUrl: "https://example.com/x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
  });

  it("infiere source desde portalUrl si no se pasa", () => {
    const runtime = new ImageWorkerRuntime({ secret: "x" });
    const result = runtime.validatePayload({
      statefoxId: "id",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.source).toBe("idealista");
  });
});

describe("ImageWorkerRuntime.runImageImport", () => {
  it("devuelve completed cuando el import termina antes del deadline", async () => {
    mocks.importStatefoxPortalImages.mockResolvedValueOnce({
      status: "IMPORTED",
      statefoxId: "id-1",
      source: "idealista",
      importedCount: 3,
      candidateCount: 8,
    });
    mocks.getImportedImagesByStatefoxIds.mockResolvedValueOnce(
      new Map([
        [
          "id-1",
          [
            { cloudinarySecureUrl: "https://cdn/a.jpg" },
            { cloudinarySecureUrl: "https://cdn/b.jpg" },
            { cloudinarySecureUrl: "https://cdn/c.jpg" },
          ],
        ],
      ]),
    );
    const runtime = new ImageWorkerRuntime({ secret: "x", concurrency: 1, defaultDeadlineMs: 5_000 });
    const result = await runtime.runImageImport({
      statefoxId: "id-1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
      source: "idealista",
      deadlineMs: 5_000,
    });
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.cachedUrls).toHaveLength(3);
      expect(result.importedCount).toBe(3);
    }
  });

  it("devuelve accepted y encola si el import excede el deadline", async () => {
    mocks.importStatefoxPortalImages.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({
        status: "IMPORTED",
        statefoxId: "id-2",
        source: "idealista",
        importedCount: 1,
        candidateCount: 1,
      }), 200)),
    );
    const runtime = new ImageWorkerRuntime({ secret: "x", concurrency: 1, defaultDeadlineMs: 50 });
    const result = await runtime.runImageImport({
      statefoxId: "id-2",
      portalUrl: "https://www.idealista.com/inmueble/2/",
      source: "idealista",
      deadlineMs: 50,
    });
    expect(result.status).toBe("accepted");
    expect(mocks.enqueueStatefoxImageImport).toHaveBeenCalledWith(
      expect.objectContaining({ statefoxId: "id-2" }),
    );
  });

  it("devuelve completed con cache existente cuando el id ya estaba en estado terminal IMPORTED", async () => {
    mocks.hasTerminalImageImportState.mockResolvedValueOnce(true);
    mocks.getImportedImagesByStatefoxIds.mockResolvedValueOnce(
      new Map([
        ["id-3", [{ cloudinarySecureUrl: "https://cdn/old.jpg" }]],
      ]),
    );
    const runtime = new ImageWorkerRuntime({ secret: "x" });
    const result = await runtime.runImageImport({
      statefoxId: "id-3",
      portalUrl: "https://www.idealista.com/inmueble/3/",
      source: "idealista",
    });
    expect(result.status).toBe("completed");
    expect(mocks.importStatefoxPortalImages).not.toHaveBeenCalled();
  });

  it("devuelve skipped si ya hay estado terminal sin imágenes", async () => {
    mocks.hasTerminalImageImportState.mockResolvedValueOnce(true);
    mocks.getImportedImagesByStatefoxIds.mockResolvedValueOnce(new Map());
    const runtime = new ImageWorkerRuntime({ secret: "x" });
    const result = await runtime.runImageImport({
      statefoxId: "id-4",
      portalUrl: "https://www.idealista.com/inmueble/4/",
      source: "idealista",
    });
    expect(result.status).toBe("skipped");
  });

  it("respeta el límite de concurrencia y devuelve accepted si está saturado", async () => {
    let resolveSlow: (() => void) | null = null;
    mocks.importStatefoxPortalImages.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSlow = () => resolve({
          status: "IMPORTED",
          statefoxId: "id-5",
          source: "idealista",
          importedCount: 1,
          candidateCount: 1,
        });
      }),
    );
    const runtime = new ImageWorkerRuntime({ secret: "x", concurrency: 1, defaultDeadlineMs: 200 });
    const slow = runtime.runImageImport({
      statefoxId: "id-5",
      portalUrl: "https://www.idealista.com/inmueble/5/",
      source: "idealista",
      deadlineMs: 200,
    });
    const queued = await runtime.runImageImport({
      statefoxId: "id-6",
      portalUrl: "https://www.idealista.com/inmueble/6/",
      source: "idealista",
      deadlineMs: 200,
    });
    expect(queued.status).toBe("accepted");
    if (resolveSlow) resolveSlow();
    await slow;
  });

  it("traduce errores del import a status=failed", async () => {
    mocks.importStatefoxPortalImages.mockRejectedValueOnce(new Error("boom"));
    const runtime = new ImageWorkerRuntime({ secret: "x", concurrency: 1, defaultDeadlineMs: 1_000 });
    const result = await runtime.runImageImport({
      statefoxId: "id-7",
      portalUrl: "https://www.idealista.com/inmueble/7/",
      source: "idealista",
      deadlineMs: 1_000,
    });
    expect(result.status).toBe("failed");
  });
});

describe("ImageWorkerRuntime.health", () => {
  it("expone métricas básicas y status ok", () => {
    const runtime = new ImageWorkerRuntime({ secret: "x" });
    const health = runtime.health();
    expect(health.status).toBe("ok");
    expect(health.processed).toBe(0);
    expect(health.failed).toBe(0);
  });
});
