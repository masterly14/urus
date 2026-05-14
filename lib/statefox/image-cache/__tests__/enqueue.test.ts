import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

vi.mock("../config", () => ({
  getStatefoxImageImportConfig: vi.fn(),
}));

vi.mock("../repo", () => ({
  hasTerminalImageImportState: vi.fn(),
  markImageImportPending: vi.fn(),
}));

import {
  enqueueStatefoxImageImport,
  enqueueStatefoxImageImportsForComparables,
} from "../enqueue";
import { enqueueJob } from "@/lib/job-queue";
import { getStatefoxImageImportConfig } from "../config";
import { hasTerminalImageImportState, markImageImportPending } from "../repo";

const mockEnqueueJob = vi.mocked(enqueueJob);
const mockConfig = vi.mocked(getStatefoxImageImportConfig);
const mockTerminal = vi.mocked(hasTerminalImageImportState);
const mockMarkPending = vi.mocked(markImageImportPending);

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.mockReturnValue({
    enabled: true,
    syncOnFirstSeen: false,
    syncMaxComparables: 0,
    maxImages: 12,
    timeoutMs: 60_000,
    idealistaDelayMs: 3_000,
    headless: true,
  });
  mockTerminal.mockResolvedValue(false);
  mockMarkPending.mockResolvedValue();
  mockEnqueueJob.mockResolvedValue({} as never);
});

describe("enqueueStatefoxImageImport", () => {
  it("encola con idempotencyKey determinista por source y statefoxId", async () => {
    const ok = await enqueueStatefoxImageImport({
      statefoxId: "id.es.r.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });

    expect(ok).toBe(true);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "IMPORT_STATEFOX_PORTAL_IMAGES",
        idempotencyKey: "statefox-image-import:idealista:id.es.r.1",
        payload: expect.objectContaining({
          statefoxId: "id.es.r.1",
          portalUrl: "https://www.idealista.com/inmueble/1/",
          source: "idealista",
        }),
      }),
    );
  });

  it("no encola si la feature está desactivada", async () => {
    mockConfig.mockReturnValue({
      enabled: false,
      syncOnFirstSeen: false,
      syncMaxComparables: 0,
      maxImages: 12,
      timeoutMs: 60_000,
      idealistaDelayMs: 3_000,
      headless: true,
    });

    const ok = await enqueueStatefoxImageImport({
      statefoxId: "id.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });

    expect(ok).toBe(false);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("no encola si el comparable ya está en estado terminal", async () => {
    mockTerminal.mockResolvedValue(true);

    const ok = await enqueueStatefoxImageImport({
      statefoxId: "id.1",
      portalUrl: "https://www.idealista.com/inmueble/1/",
    });

    expect(ok).toBe(false);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("no encola si el portal no se reconoce", async () => {
    const ok = await enqueueStatefoxImageImport({
      statefoxId: "id.1",
      portalUrl: "https://example.com/inmueble/1/",
    });
    expect(ok).toBe(false);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});

describe("enqueueStatefoxImageImportsForComparables", () => {
  it("ignora candidatos sin portalUrl", async () => {
    const enqueued = await enqueueStatefoxImageImportsForComparables([
      { statefoxId: "id.1", portalUrl: null },
      { statefoxId: "id.2", portalUrl: "https://www.idealista.com/inmueble/2/" },
    ]);
    expect(enqueued).toBe(1);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
  });
});
