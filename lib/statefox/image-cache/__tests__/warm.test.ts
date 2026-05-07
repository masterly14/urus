import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../config", () => ({
  getStatefoxImageImportConfig: vi.fn(),
}));

vi.mock("../importer", () => ({
  importStatefoxPortalImages: vi.fn(),
}));

vi.mock("../repo", () => ({
  hasTerminalImageImportState: vi.fn(),
}));

import { warmImportStatefoxImagesOnFirstSeen } from "../warm";
import { getStatefoxImageImportConfig } from "../config";
import { importStatefoxPortalImages } from "../importer";
import { hasTerminalImageImportState } from "../repo";

const mockConfig = vi.mocked(getStatefoxImageImportConfig);
const mockImport = vi.mocked(importStatefoxPortalImages);
const mockTerminal = vi.mocked(hasTerminalImageImportState);

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.mockReturnValue({
    enabled: true,
    syncOnFirstSeen: true,
    syncMaxComparables: 2,
    maxImages: 12,
    timeoutMs: 60_000,
    idealistaDelayMs: 0,
    headless: true,
  });
  mockTerminal.mockResolvedValue(false);
  mockImport.mockResolvedValue({
    statefoxId: "x",
    source: "idealista",
    status: "IMPORTED",
    importedCount: 1,
    candidateCount: 1,
  });
});

describe("warmImportStatefoxImagesOnFirstSeen", () => {
  it("respeta el límite syncMaxComparables", async () => {
    const result = await warmImportStatefoxImagesOnFirstSeen([
      { statefoxId: "id.1", portalUrl: "https://www.idealista.com/inmueble/1/" },
      { statefoxId: "id.2", portalUrl: "https://www.idealista.com/inmueble/2/" },
      { statefoxId: "id.3", portalUrl: "https://www.idealista.com/inmueble/3/" },
    ]);
    expect(result.attempted).toBe(2);
    expect(mockImport).toHaveBeenCalledTimes(2);
  });

  it("salta candidatos en estado terminal y portales desconocidos", async () => {
    mockTerminal.mockResolvedValueOnce(true);
    const result = await warmImportStatefoxImagesOnFirstSeen([
      { statefoxId: "id.1", portalUrl: "https://www.idealista.com/inmueble/1/" },
      { statefoxId: "id.2", portalUrl: "https://example.com/x" },
      { statefoxId: "id.3", portalUrl: "https://www.idealista.com/inmueble/3/" },
    ]);
    expect(result.attempted).toBe(1);
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ statefoxId: "id.3", source: "idealista" }),
    );
  });

  it("no hace nada si syncOnFirstSeen=false", async () => {
    mockConfig.mockReturnValueOnce({
      enabled: true,
      syncOnFirstSeen: false,
      syncMaxComparables: 5,
      maxImages: 12,
      timeoutMs: 60_000,
      idealistaDelayMs: 0,
      headless: true,
    });
    const result = await warmImportStatefoxImagesOnFirstSeen([
      { statefoxId: "id.1", portalUrl: "https://www.idealista.com/inmueble/1/" },
    ]);
    expect(result.attempted).toBe(0);
    expect(mockImport).not.toHaveBeenCalled();
  });
});
