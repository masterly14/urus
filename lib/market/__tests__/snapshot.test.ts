import { describe, expect, it } from "vitest";
import { computeSnapshotIndex, type SnapshotInputListing } from "../snapshot";

const baseOpts = {
  city: "cordoba",
  housingType: "flat" as const,
  operation: "sale" as const,
  now: new Date("2026-05-06T12:00:00Z"),
};

function listing(
  overrides: Partial<SnapshotInputListing> = {},
): SnapshotInputListing {
  return {
    price: 175_000,
    pricePerMeter: 1_944,
    qualityScore: 0.9,
    status: "active",
    ...overrides,
  };
}

describe("computeSnapshotIndex", () => {
  it("totalActive=0 y rangos null cuando no hay listings", () => {
    const result = computeSnapshotIndex([], baseOpts);
    expect(result.totalActive).toBe(0);
    expect(result.priceMin).toBeNull();
    expect(result.priceMax).toBeNull();
    expect(result.priceMedian).toBeNull();
    expect(result.ppmMedian).toBeNull();
  });

  it("excluye listings inactivos del total", () => {
    const result = computeSnapshotIndex(
      [
        listing({ status: "active" }),
        listing({ status: "inactive" }),
        listing({ status: "removed" }),
      ],
      baseOpts,
    );
    expect(result.totalActive).toBe(1);
  });

  it("excluye listings con qualityScore bajo el umbral", () => {
    const result = computeSnapshotIndex(
      [
        listing({ qualityScore: 0.9 }),
        listing({ qualityScore: 0.3 }),
        listing({ qualityScore: 0.41 }),
      ],
      { ...baseOpts, minQualityScore: 0.4 },
    );
    expect(result.totalActive).toBe(2);
  });

  it("calcula min/max/median de precios validos", () => {
    const result = computeSnapshotIndex(
      [
        listing({ price: 100_000 }),
        listing({ price: 200_000 }),
        listing({ price: 300_000 }),
      ],
      baseOpts,
    );
    expect(result.priceMin).toBe(100_000);
    expect(result.priceMax).toBe(300_000);
    expect(result.priceMedian).toBe(200_000);
  });

  it("median par numero de elementos = promedio de los dos centrales", () => {
    const result = computeSnapshotIndex(
      [
        listing({ price: 100_000 }),
        listing({ price: 200_000 }),
        listing({ price: 300_000 }),
        listing({ price: 400_000 }),
      ],
      baseOpts,
    );
    expect(result.priceMedian).toBe(250_000);
  });

  it("ignora precios null o <= 0 en medianas pero los cuenta en totalActive", () => {
    const result = computeSnapshotIndex(
      [
        listing({ price: null, qualityScore: 0.9 }),
        listing({ price: 0, qualityScore: 0.9 }),
        listing({ price: 100_000, qualityScore: 0.9 }),
      ],
      baseOpts,
    );
    expect(result.totalActive).toBe(3);
    expect(result.priceMin).toBe(100_000);
    expect(result.priceMax).toBe(100_000);
    expect(result.priceMedian).toBe(100_000);
  });

  it("calcula ppmMedian a partir de pricePerMeter", () => {
    const result = computeSnapshotIndex(
      [
        listing({ pricePerMeter: 1_500 }),
        listing({ pricePerMeter: 2_000 }),
        listing({ pricePerMeter: 2_500 }),
      ],
      baseOpts,
    );
    expect(result.ppmMedian).toBe(2_000);
  });

  it("respeta freshAt inyectado", () => {
    const now = new Date("2030-01-01T00:00:00Z");
    const result = computeSnapshotIndex([], { ...baseOpts, now });
    expect(result.freshAt).toEqual(now);
  });
});
