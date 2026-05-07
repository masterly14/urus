import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTerminalImageImportState: vi.fn(),
  enqueueStatefoxImageImport: vi.fn(),
  warmImportStatefoxImagesOnFirstSeen: vi.fn(),
  ImageWorkerError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ImageWorkerError";
    }
  },
  runImageImport: vi.fn(),
}));

vi.mock("../repo", () => ({
  hasTerminalImageImportState: mocks.hasTerminalImageImportState,
}));

vi.mock("../enqueue", () => ({
  enqueueStatefoxImageImport: mocks.enqueueStatefoxImageImport,
}));

vi.mock("../warm", () => ({
  warmImportStatefoxImagesOnFirstSeen: mocks.warmImportStatefoxImagesOnFirstSeen,
}));

vi.mock("@/lib/workers/contracts", () => ({
  ImageWorkerError: mocks.ImageWorkerError,
  ImageWorkerClient: class {
    runImageImport = mocks.runImageImport;
  },
}));

import { runHybridImageImport } from "../orchestrator";
import type { StatefoxImageImportConfig } from "../config";

function baseConfig(overrides: Partial<StatefoxImageImportConfig> = {}): StatefoxImageImportConfig {
  return {
    enabled: true,
    syncOnFirstSeen: true,
    syncMaxComparables: 5,
    maxImages: 8,
    timeoutMs: 30_000,
    idealistaDelayMs: 0,
    headless: true,
    storageStatePath: undefined,
    workerMode: "hybrid",
    workerBaseUrl: "https://worker.example.com",
    workerSecret: "shh",
    workerSyncDeadlineMs: 3_000,
    workerRequestTimeoutMs: 4_000,
    brightDataConnectTimeoutMs: 120_000,
    brightDataNetworkIdleTimeoutMs: 25_000,
    brightDataCaptchaDetectTimeoutMs: 20_000,
    brightDataCaptchaSolve: false,
    brightDataApiToken: undefined,
    brightDataSessionInspectEnabled: false,
    webUnlockerEnabled: false,
    webUnlockerZone: undefined,
    webUnlockerCountry: undefined,
    webUnlockerTimeoutMs: 90_000,
    idealistaDirectCdpEnabled: false,
    warmSessionEnabled: false,
    warmSessionRequireCdp: false,
    warmSessionTtlMs: 4 * 60 * 60 * 1000,
    warmSessionMaxRequests: 40,
    humanBehaviorEnabled: false,
    warmupNavigationEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasTerminalImageImportState.mockResolvedValue(false);
  mocks.warmImportStatefoxImagesOnFirstSeen.mockResolvedValue({ attempted: 0, imported: 0 });
});

describe("runHybridImageImport", () => {
  it("usa el worker Railway en modo hybrid y devuelve completed cuando responde a tiempo", async () => {
    mocks.runImageImport.mockResolvedValueOnce({
      status: "completed",
      statefoxId: "id-1",
      source: "idealista",
      importedCount: 4,
      candidateCount: 8,
      cachedUrls: ["https://res.cloudinary.com/x/a.jpg"],
      elapsedMs: 1200,
    });

    const result = await runHybridImageImport(
      [{ statefoxId: "id-1", portalUrl: "https://www.idealista.com/inmueble/1/" }],
      { config: baseConfig() },
    );

    expect(result.mode).toBe("hybrid");
    expect(result.importedCount).toBe(4);
    expect(result.attempts[0]?.status).toBe("completed");
    expect(mocks.runImageImport).toHaveBeenCalledTimes(1);
    expect(mocks.warmImportStatefoxImagesOnFirstSeen).not.toHaveBeenCalled();
  });

  it("encola fallback y marca queued si el worker hace timeout", async () => {
    mocks.runImageImport.mockRejectedValueOnce(
      new mocks.ImageWorkerError("TIMEOUT", "Worker no respondió en 3000ms"),
    );
    mocks.enqueueStatefoxImageImport.mockResolvedValueOnce(true);

    const result = await runHybridImageImport(
      [{ statefoxId: "id-2", portalUrl: "https://www.idealista.com/inmueble/2/" }],
      { config: baseConfig() },
    );

    expect(result.attempts[0]?.status).toBe("queued");
    expect(result.queuedCount).toBe(1);
    expect(mocks.enqueueStatefoxImageImport).toHaveBeenCalledWith(
      expect.objectContaining({ statefoxId: "id-2" }),
    );
  });

  it("en modo local nunca llama al worker y delega al warm import", async () => {
    mocks.warmImportStatefoxImagesOnFirstSeen.mockResolvedValueOnce({ attempted: 1, imported: 1 });

    const result = await runHybridImageImport(
      [{ statefoxId: "id-3", portalUrl: "https://www.idealista.com/inmueble/3/" }],
      { config: baseConfig({ workerMode: "local" }) },
    );

    expect(result.mode).toBe("local");
    expect(result.importedCount).toBe(1);
    expect(mocks.runImageImport).not.toHaveBeenCalled();
    expect(mocks.warmImportStatefoxImagesOnFirstSeen).toHaveBeenCalledTimes(1);
  });

  it("en modo railway sin baseUrl/secret cae a local automáticamente", async () => {
    const result = await runHybridImageImport(
      [{ statefoxId: "id-4", portalUrl: "https://www.idealista.com/inmueble/4/" }],
      { config: baseConfig({ workerMode: "railway", workerBaseUrl: undefined }) },
    );

    expect(mocks.runImageImport).not.toHaveBeenCalled();
    expect(mocks.warmImportStatefoxImagesOnFirstSeen).toHaveBeenCalled();
    expect(result.mode).toBe("railway");
  });

  it("salta candidatas con estado terminal previo", async () => {
    mocks.hasTerminalImageImportState.mockResolvedValueOnce(true);

    const result = await runHybridImageImport(
      [{ statefoxId: "id-5", portalUrl: "https://www.idealista.com/inmueble/5/" }],
      { config: baseConfig() },
    );

    expect(result.attempts[0]?.status).toBe("skipped");
    expect(mocks.runImageImport).not.toHaveBeenCalled();
  });

  it("respeta accepted del worker como queued", async () => {
    mocks.runImageImport.mockResolvedValueOnce({
      status: "accepted",
      statefoxId: "id-6",
      source: "idealista",
      reason: "deadline excedido",
    });

    const result = await runHybridImageImport(
      [{ statefoxId: "id-6", portalUrl: "https://www.idealista.com/inmueble/6/" }],
      { config: baseConfig() },
    );

    expect(result.attempts[0]?.status).toBe("accepted");
    expect(result.acceptedCount).toBe(1);
  });

  it("rechaza candidatas sin portalUrl", async () => {
    const result = await runHybridImageImport(
      [{ statefoxId: "id-7", portalUrl: null }],
      { config: baseConfig() },
    );
    expect(result.attempts[0]?.status).toBe("skipped");
    expect(mocks.runImageImport).not.toHaveBeenCalled();
  });
});
