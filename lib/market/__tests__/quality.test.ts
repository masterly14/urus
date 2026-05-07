import { describe, expect, it } from "vitest";
import {
  applyQuality,
  computeQuality,
  DEFAULT_MIN_QUALITY_SCORE,
  isPublishable,
} from "@/lib/market/quality";
import type { CanonicalListing } from "@/lib/market/types";

function makeListing(overrides: Partial<CanonicalListing> = {}): CanonicalListing {
  return {
    source: "source_a",
    externalId: "abc-123",
    canonicalUrl: "https://portal.example.com/inmueble/abc-123",
    operation: "sale",
    housingType: "flat",
    status: "active",
    price: 180000,
    currency: "EUR",
    pricePerMeter: 2195,
    builtArea: 82,
    rooms: 3,
    bathrooms: 1,
    floor: "3",
    city: "cordoba",
    zone: "Centro",
    addressApprox: "Calle Mayor",
    lat: 37.88,
    lng: -4.78,
    geohash: "eyk6n0u",
    advertiserType: "private",
    advertiserName: null,
    phones: [],
    mainImageUrl: "https://cdn.example.com/img/1.jpg",
    imageUrls: ["https://cdn.example.com/img/1.jpg"],
    qualityScore: 0,
    qualityFlags: [],
    propertyId: null,
    firstSeenAt: "2026-05-06T10:00:00Z",
    lastSeenAt: "2026-05-06T10:00:00Z",
    lastChangeAt: null,
    ...overrides,
  };
}

const NOW = new Date("2026-05-06T12:00:00Z");

describe("computeQuality", () => {
  it("listing completo da score alto y sin flags", () => {
    const r = computeQuality(makeListing(), { now: NOW });
    expect(r.flags).toEqual([]);
    expect(r.score).toBe(1);
  });

  it("añade missing_price si price es null", () => {
    const r = computeQuality(makeListing({ price: null }), { now: NOW });
    expect(r.flags).toContain("missing_price");
    expect(r.score).toBeLessThan(1);
  });

  it("añade invalid_price para precios negativos o cero", () => {
    const r1 = computeQuality(makeListing({ price: 0 }), { now: NOW });
    expect(r1.flags).toContain("invalid_price");

    const r2 = computeQuality(makeListing({ price: -5 }), { now: NOW });
    expect(r2.flags).toContain("invalid_price");
  });

  it("añade invalid_price para precios sospechosamente bajos en venta", () => {
    const r = computeQuality(makeListing({ price: 500 }), { now: NOW });
    expect(r.flags).toContain("invalid_price");
  });

  it("añade missing_area / invalid_area según corresponda", () => {
    expect(computeQuality(makeListing({ builtArea: null }), { now: NOW }).flags).toContain(
      "missing_area",
    );
    expect(computeQuality(makeListing({ builtArea: 0 }), { now: NOW }).flags).toContain(
      "invalid_area",
    );
    expect(computeQuality(makeListing({ builtArea: 5 }), { now: NOW }).flags).toContain(
      "invalid_area",
    );
    expect(
      computeQuality(makeListing({ builtArea: 50_000 }), { now: NOW }).flags,
    ).toContain("invalid_area");
  });

  it("añade missing_location si city está vacía", () => {
    expect(computeQuality(makeListing({ city: "" }), { now: NOW }).flags).toContain(
      "missing_location",
    );
    expect(computeQuality(makeListing({ city: "   " }), { now: NOW }).flags).toContain(
      "missing_location",
    );
  });

  it("añade missing_rooms si rooms es null", () => {
    expect(computeQuality(makeListing({ rooms: null }), { now: NOW }).flags).toContain(
      "missing_rooms",
    );
  });

  it("añade missing_images si no hay imágenes", () => {
    expect(computeQuality(makeListing({ imageUrls: [] }), { now: NOW }).flags).toContain(
      "missing_images",
    );
  });

  it("añade stale_data cuando lastSeenAt supera el umbral", () => {
    const old = makeListing({ lastSeenAt: "2026-04-01T00:00:00Z" });
    const r = computeQuality(old, { now: NOW });
    expect(r.flags).toContain("stale_data");
  });

  it("permite añadir flags extra desde el caller", () => {
    const r = computeQuality(makeListing(), { now: NOW, extraFlags: ["blocked_source"] });
    expect(r.flags).toContain("blocked_source");
  });

  it("nunca devuelve score negativo aunque haya muchas penalizaciones", () => {
    const r = computeQuality(
      makeListing({
        price: null,
        builtArea: null,
        city: "",
        rooms: null,
        imageUrls: [],
      }),
      { now: NOW, extraFlags: ["blocked_source", "stale_data"] },
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.flags.length).toBeGreaterThan(3);
  });

  it("ordena las flags alfabéticamente", () => {
    const r = computeQuality(
      makeListing({ price: null, imageUrls: [], rooms: null }),
      { now: NOW },
    );
    const sorted = [...r.flags].sort();
    expect(r.flags).toEqual(sorted);
  });
});

describe("applyQuality", () => {
  it("devuelve copia con score y flags rellenos, sin mutar el original", () => {
    const original = makeListing({ price: null });
    const out = applyQuality(original, { now: NOW });
    expect(original.qualityScore).toBe(0);
    expect(original.qualityFlags).toEqual([]);
    expect(out.qualityScore).toBeGreaterThan(0);
    expect(out.qualityFlags).toContain("missing_price");
  });
});

describe("isPublishable", () => {
  it("compara contra el umbral por defecto", () => {
    expect(isPublishable(0.9)).toBe(true);
    expect(isPublishable(DEFAULT_MIN_QUALITY_SCORE)).toBe(true);
    expect(isPublishable(0.1)).toBe(false);
  });

  it("acepta umbral personalizado", () => {
    expect(isPublishable(0.5, 0.6)).toBe(false);
    expect(isPublishable(0.7, 0.6)).toBe(true);
  });

  it("rechaza scores no finitos (NaN, Infinity)", () => {
    // Por contrato, isPublishable solo acepta números finitos. Esto evita
    // que un bug aguas arriba (división por cero o cálculo corrupto) nos
    // cuele un listing inválido al snapshot público.
    expect(isPublishable(NaN)).toBe(false);
    expect(isPublishable(Infinity)).toBe(false);
    expect(isPublishable(-Infinity)).toBe(false);
  });
});
