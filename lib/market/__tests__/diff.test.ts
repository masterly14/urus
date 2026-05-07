import { describe, expect, it } from "vitest";
import { diffListing } from "../diff";
import type { CanonicalListing } from "../types";

function makeCanonical(
  overrides: Partial<CanonicalListing> = {},
): CanonicalListing {
  return {
    source: "source_a",
    externalId: "id-1",
    canonicalUrl: "https://www.fotocasa.es/x/1/d",
    operation: "sale",
    housingType: "flat",
    status: "active",
    price: 175_000,
    currency: "EUR",
    pricePerMeter: 1_944.44,
    builtArea: 90,
    rooms: 3,
    bathrooms: 2,
    floor: "3",
    city: "cordoba",
    zone: "centro",
    addressApprox: "Calle Mayor 12",
    lat: 37.88,
    lng: -4.78,
    geohash: "ezsabcd",
    advertiserType: "professional",
    advertiserName: "Inmo X",
    phones: ["957123456"],
    mainImageUrl: "https://img.example.com/1.jpg",
    imageUrls: ["https://img.example.com/1.jpg"],
    qualityScore: 0.9,
    qualityFlags: [],
    propertyId: null,
    firstSeenAt: "2026-05-06T10:00:00Z",
    lastSeenAt: "2026-05-06T10:00:00Z",
    lastChangeAt: null,
    ...overrides,
  };
}

describe("diffListing", () => {
  it("emite MARKET_LISTING_CREATED cuando prev es null", () => {
    const result = diffListing(null, makeCanonical());
    expect(result.eventType).toBe("MARKET_LISTING_CREATED");
    expect(result.changedFields.length).toBeGreaterThan(0);
    expect(result.before).toEqual({});
    expect(result.after.price).toBe(175_000);
  });

  it("eventType=null cuando no hay cambios relevantes", () => {
    const a = makeCanonical();
    const b = makeCanonical();
    const result = diffListing(a, b);
    expect(result.eventType).toBeNull();
    expect(result.changedFields).toEqual([]);
  });

  it("ignora cambios de timestamps (lastSeenAt no es tracked)", () => {
    const a = makeCanonical({ lastSeenAt: "2026-05-06T10:00:00Z" });
    const b = makeCanonical({ lastSeenAt: "2026-05-06T11:00:00Z" });
    const result = diffListing(a, b);
    expect(result.eventType).toBeNull();
  });

  it("PRICE_CHANGED cuando solo cambia el precio", () => {
    const a = makeCanonical({ price: 175_000 });
    const b = makeCanonical({ price: 169_000 });
    const result = diffListing(a, b);
    expect(result.eventType).toBe("MARKET_LISTING_PRICE_CHANGED");
    expect(result.changedFields).toContain("price");
    expect(result.priceDelta).not.toBeNull();
    expect(result.priceDelta?.abs).toBe(-6_000);
    expect(result.priceDelta?.pct).toBeCloseTo(-0.0343, 2);
  });

  it("REMOVED cuando active→removed (incluso si cambian otros campos)", () => {
    const a = makeCanonical({ status: "active", price: 175_000 });
    const b = makeCanonical({ status: "removed", price: 165_000 });
    const result = diffListing(a, b);
    expect(result.eventType).toBe("MARKET_LISTING_REMOVED");
    expect(result.changedFields).toContain("status");
    expect(result.changedFields).toContain("price");
    expect(result.priceDelta?.abs).toBe(-10_000);
  });

  it("REAPPEARED cuando removed→active", () => {
    const a = makeCanonical({ status: "removed" });
    const b = makeCanonical({ status: "active" });
    const result = diffListing(a, b);
    expect(result.eventType).toBe("MARKET_LISTING_REAPPEARED");
  });

  it("REAPPEARED cuando inactive→active", () => {
    const a = makeCanonical({ status: "inactive" });
    const b = makeCanonical({ status: "active" });
    const result = diffListing(a, b);
    expect(result.eventType).toBe("MARKET_LISTING_REAPPEARED");
  });

  it("STATUS_CHANGED para otros cambios de estado", () => {
    const a = makeCanonical({ status: "active" });
    const b = makeCanonical({ status: "blocked" });
    const result = diffListing(a, b);
    expect(result.eventType).toBe("MARKET_LISTING_STATUS_CHANGED");
  });

  it("UPDATED para cambios irrelevantes a precio/status (ej. fotos)", () => {
    const a = makeCanonical({
      imageUrls: ["https://img.example.com/1.jpg"],
    });
    const b = makeCanonical({
      imageUrls: [
        "https://img.example.com/1.jpg",
        "https://img.example.com/2.jpg",
      ],
    });
    const result = diffListing(a, b);
    expect(result.eventType).toBe("MARKET_LISTING_UPDATED");
    expect(result.changedFields).toContain("imageUrls");
  });

  it("ignora qualityScore con diff < 0.001 (tolerancia numerica)", () => {
    const a = makeCanonical({ qualityScore: 0.876 });
    const b = makeCanonical({ qualityScore: 0.8762 });
    const result = diffListing(a, b);
    expect(result.eventType).toBeNull();
  });

  it("considera arrays equivalentes salvo orden", () => {
    const a = makeCanonical({ phones: ["957123456", "957987654"] });
    const b = makeCanonical({ phones: ["957987654", "957123456"] });
    const result = diffListing(a, b);
    expect(result.eventType).toBeNull();
  });
});
