import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    statefoxComparableImage: {
      findMany: mocks.findMany,
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getStatefoxImageCacheStatusByIds } from "../repo";

const findManyMock = mocks.findMany;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStatefoxImageCacheStatusByIds", () => {
  it("devuelve UNKNOWN para ids sin filas en DB", async () => {
    findManyMock.mockResolvedValueOnce([]);
    const map = await getStatefoxImageCacheStatusByIds(["a", "b"]);
    expect(map.get("a")?.status).toBe("UNKNOWN");
    expect(map.get("a")?.cachedUrls).toEqual([]);
    expect(map.get("b")?.status).toBe("UNKNOWN");
  });

  it("agrega cachedUrls y marca IMPORTED si hay al menos una imagen subida", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        statefoxId: "a",
        source: "idealista",
        status: "IMPORTED",
        cloudinarySecureUrl: "https://cdn/a-1.jpg",
        attempts: 1,
        errorReason: null,
        importedAt: new Date("2026-05-06T11:00:00Z"),
        lastAttemptAt: new Date("2026-05-06T11:00:00Z"),
        updatedAt: new Date("2026-05-06T11:00:00Z"),
      },
      {
        statefoxId: "a",
        source: "idealista",
        status: "IMPORTED",
        cloudinarySecureUrl: "https://cdn/a-2.jpg",
        attempts: 1,
        errorReason: null,
        importedAt: new Date("2026-05-06T11:00:01Z"),
        lastAttemptAt: new Date("2026-05-06T11:00:01Z"),
        updatedAt: new Date("2026-05-06T11:00:01Z"),
      },
    ]);

    const map = await getStatefoxImageCacheStatusByIds(["a"]);
    const entry = map.get("a")!;
    expect(entry.status).toBe("IMPORTED");
    expect(entry.cachedUrls).toHaveLength(2);
    expect(entry.importedCount).toBe(2);
    expect(entry.source).toBe("idealista");
    expect(entry.updatedAt).toBe("2026-05-06T11:00:01.000Z");
  });

  it("propaga estado terminal (BLOCKED/CAPTCHA) cuando no hay imágenes", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        statefoxId: "x",
        source: "idealista",
        status: "BLOCKED",
        cloudinarySecureUrl: null,
        attempts: 3,
        errorReason: "HTTP 403 al abrir portal",
        importedAt: null,
        lastAttemptAt: new Date("2026-05-06T10:00:00Z"),
        updatedAt: new Date("2026-05-06T10:00:00Z"),
      },
    ]);
    const map = await getStatefoxImageCacheStatusByIds(["x"]);
    expect(map.get("x")?.status).toBe("BLOCKED");
    expect(map.get("x")?.errorReason).toBe("HTTP 403 al abrir portal");
  });

  it("deduplica ids repetidos antes de consultar Prisma", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await getStatefoxImageCacheStatusByIds(["a", "a", "b"]);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0]![0] as { where: { statefoxId: { in: string[] } } };
    expect(args.where.statefoxId.in.sort()).toEqual(["a", "b"]);
  });

  it("no llama a Prisma si la lista de ids es vacía", async () => {
    const map = await getStatefoxImageCacheStatusByIds([]);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });
});
