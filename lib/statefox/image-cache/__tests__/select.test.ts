import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/statefox/image-expiry", () => ({
  isExpiredStatefoxImageUrl: vi.fn(),
}));

vi.mock("../config", () => ({
  getStatefoxImageImportConfig: vi.fn(),
}));

vi.mock("../enqueue", () => ({
  enqueueStatefoxImageImportsForComparables: vi.fn(),
}));

vi.mock("../repo", () => ({
  getImportedImagesByStatefoxIds: vi.fn(),
  hasTerminalImageImportState: vi.fn(async () => false),
  toCloudinaryUrls: vi.fn((images: unknown[]) =>
    (images as Array<{ cloudinarySecureUrl?: string }>)
      .map((img) => img.cloudinarySecureUrl ?? "")
      .filter(Boolean),
  ),
}));

vi.mock("../orchestrator", () => ({
  runHybridImageImport: vi.fn(),
}));

import {
  hydrateComparablesWithImageCache,
  selectComparablePhotos,
} from "../select";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import { getStatefoxImageImportConfig } from "../config";
import { enqueueStatefoxImageImportsForComparables } from "../enqueue";
import { getImportedImagesByStatefoxIds } from "../repo";
import { runHybridImageImport } from "../orchestrator";

const mockIsExpired = vi.mocked(isExpiredStatefoxImageUrl);
const mockConfig = vi.mocked(getStatefoxImageImportConfig);
const mockEnqueue = vi.mocked(enqueueStatefoxImageImportsForComparables);
const mockGetCache = vi.mocked(getImportedImagesByStatefoxIds);
const mockOrchestrator = vi.mocked(runHybridImageImport);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsExpired.mockImplementation((url: string) => url.includes("expired"));
  mockConfig.mockReturnValue({
    enabled: true,
    syncOnFirstSeen: false,
    syncMaxComparables: 0,
    maxImages: 12,
    timeoutMs: 60_000,
    idealistaDelayMs: 3_000,
    headless: true,
  });
  mockGetCache.mockResolvedValue(new Map());
  mockEnqueue.mockResolvedValue(0);
  mockOrchestrator.mockResolvedValue({
    mode: "local",
    attempts: [],
    importedCount: 0,
    acceptedCount: 0,
    queuedCount: 0,
    failedCount: 0,
  });
});

describe("selectComparablePhotos", () => {
  it("prioriza URLs Cloudinary cuando existen", () => {
    const result = selectComparablePhotos({
      cachedUrls: ["https://res.cloudinary.com/urus/image/upload/a.jpg"],
      statefoxUrls: ["https://img4.idealista.com/expired.jpg"],
    });
    expect(result).toEqual(["https://res.cloudinary.com/urus/image/upload/a.jpg"]);
  });

  it("filtra URLs Statefox caducadas como fallback", () => {
    const result = selectComparablePhotos({
      cachedUrls: [],
      statefoxUrls: [
        "https://img4.idealista.com/expired.jpg",
        "https://img4.idealista.com/fresh.jpg",
      ],
    });
    expect(result).toEqual(["https://img4.idealista.com/fresh.jpg"]);
  });

  it("devuelve lista vacía si todo está caducado", () => {
    const result = selectComparablePhotos({
      cachedUrls: [],
      statefoxUrls: ["https://img4.idealista.com/expired.jpg"],
    });
    expect(result).toEqual([]);
  });
});

const baseComparable = {
  precio: 200_000,
  precioM2: 2_000,
  metrosConstruidos: 100,
  habitaciones: 3,
  banyos: 2,
  ciudad: "Córdoba",
  zona: "Centro",
  tipologia: "flat",
  advertiserType: "professional" as const,
  extras: {},
  diasPublicado: 10,
  descripcion: null,
  direccion: null,
  anunciante: { nombre: null, tipo: "professional" as const, telefonos: [] },
  latitud: null,
  longitud: null,
  planta: null,
  orientacion: null,
  referencia: null,
};

describe("hydrateComparablesWithImageCache", () => {
  it("usa Cloudinary cuando hay cache", async () => {
    mockGetCache.mockResolvedValue(
      new Map([
        [
          "id.1",
          [
            {
              statefoxId: "id.1",
              source: "idealista",
              imageIndex: 0,
              portalUrl: "https://www.idealista.com/inmueble/1",
              originalImageUrl: null,
              cloudinaryPublicId: "statefox/idealista/id_1/0",
              cloudinarySecureUrl: "https://res.cloudinary.com/urus/img/1.jpg",
              status: "IMPORTED",
            },
          ],
        ],
      ]) as never,
    );

    const result = await hydrateComparablesWithImageCache([
      {
        ...baseComparable,
        statefoxId: "id.1",
        link: "https://www.idealista.com/inmueble/1",
        fotos: ["https://img4.idealista.com/expired.jpg"],
      },
    ]);

    expect(result[0].fotos).toEqual(["https://res.cloudinary.com/urus/img/1.jpg"]);
    expect(result[0].imageCacheStatus).toBe("IMPORTED");
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockOrchestrator).not.toHaveBeenCalled();
  });

  it("encola import asíncrono cuando no hay cache y warm está desactivado", async () => {
    mockGetCache.mockResolvedValue(new Map());

    const comparables = [
      {
        ...baseComparable,
        statefoxId: "id.1",
        link: "https://www.idealista.com/inmueble/1",
        fotos: ["https://img4.idealista.com/expired.jpg"],
      },
    ];

    const result = await hydrateComparablesWithImageCache(comparables);

    expect(result[0].fotos).toEqual([]);
    expect(result[0].imageCacheStatus).toBe("PENDING");
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith([
      { statefoxId: "id.1", portalUrl: "https://www.idealista.com/inmueble/1" },
    ]);
  });

  it("invoca el orquestador híbrido cuando syncOnFirstSeen=true y refresca cache si imported>0", async () => {
    mockConfig.mockReturnValue({
      enabled: true,
      syncOnFirstSeen: true,
      syncMaxComparables: 5,
      maxImages: 12,
      timeoutMs: 60_000,
      idealistaDelayMs: 3_000,
      headless: true,
    });
    mockOrchestrator.mockResolvedValueOnce({
      mode: "hybrid",
      attempts: [
        {
          statefoxId: "id.1",
          status: "completed",
          importedCount: 1,
          traceId: "trace",
        },
      ],
      importedCount: 1,
      acceptedCount: 0,
      queuedCount: 0,
      failedCount: 0,
    });
    mockGetCache
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(
        new Map([
          [
            "id.1",
            [
              {
                statefoxId: "id.1",
                source: "idealista",
                imageIndex: 0,
                portalUrl: "https://www.idealista.com/inmueble/1",
                originalImageUrl: null,
                cloudinaryPublicId: "statefox/idealista/id_1/0",
                cloudinarySecureUrl: "https://res.cloudinary.com/urus/img/1.jpg",
                status: "IMPORTED",
              },
            ],
          ],
        ]) as never,
      );

    const result = await hydrateComparablesWithImageCache([
      {
        ...baseComparable,
        statefoxId: "id.1",
        link: "https://www.idealista.com/inmueble/1",
        fotos: [],
      },
    ]);

    expect(mockOrchestrator).toHaveBeenCalledTimes(1);
    expect(result[0].fotos).toEqual(["https://res.cloudinary.com/urus/img/1.jpg"]);
    expect(result[0].imageCacheStatus).toBe("IMPORTED");
  });

  it("no encola si la cache está deshabilitada", async () => {
    mockConfig.mockReturnValue({
      enabled: false,
      syncOnFirstSeen: false,
      syncMaxComparables: 0,
      maxImages: 12,
      timeoutMs: 60_000,
      idealistaDelayMs: 3_000,
      headless: true,
    });

    await hydrateComparablesWithImageCache([
      {
        ...baseComparable,
        statefoxId: "id.1",
        link: "https://www.idealista.com/inmueble/1",
        fotos: [],
      },
    ]);

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockOrchestrator).not.toHaveBeenCalled();
  });
});
