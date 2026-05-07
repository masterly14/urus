import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  collapseWhitespace,
  extractFirstNumber,
  extractPrice,
  geohashEncode,
  mapHousingType,
  mapOperation,
  normalizeRawListing,
  normalizeText,
  parseSpanishNumber,
} from "@/lib/market/normalize";
import type { NormalizeContext } from "@/lib/market/normalize";
import type { RawListing } from "@/lib/market/types";

const baseCtx: NormalizeContext = {
  defaultOperation: "sale",
  defaultCity: "córdoba",
  defaultZone: null,
  now: new Date("2026-05-06T10:00:00Z"),
};

function makeRaw(overrides: Partial<RawListing> = {}): RawListing {
  return {
    source: "source_a",
    externalId: "abc-123",
    canonicalUrl: "https://portal.example.com/inmueble/abc-123",
    httpStatus: 200,
    contentHash: "hash-1",
    capturedAt: "2026-05-06T10:00:00Z",
    payload: {
      title: "Piso en venta en Córdoba Centro",
      priceRaw: "180.000 €",
      surfaceRaw: "82",
      roomsRaw: "3",
      bathroomsRaw: "1",
      floorRaw: "3",
      cityRaw: "Córdoba",
      zoneRaw: "Centro",
      housingRaw: "Piso",
      operationRaw: "venta",
      addressRaw: "Calle Mayor",
      lat: 37.8845,
      lng: -4.7796,
      imageUrls: [
        "https://cdn.example.com/img/1.jpg",
        "https://cdn.example.com/img/2.jpg",
      ],
      mainImageUrl: "https://cdn.example.com/img/1.jpg",
    },
    ...overrides,
  };
}

describe("normalizeText", () => {
  it("quita tildes, baja a minúsculas y trimea", () => {
    expect(normalizeText("  Córdoba  ")).toBe("cordoba");
    expect(normalizeText("Ático")).toBe("atico");
    expect(normalizeText("")).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText(null)).toBe("");
  });
});

describe("collapseWhitespace", () => {
  it("colapsa múltiples espacios en uno", () => {
    expect(collapseWhitespace("  hola   mundo  ")).toBe("hola mundo");
  });
});

describe("parseSpanishNumber", () => {
  it("parsea con separador miles y €", () => {
    expect(parseSpanishNumber("180.000 €")).toBe(180000);
    expect(parseSpanishNumber("1.234,56")).toBe(1234.56);
    expect(parseSpanishNumber("450")).toBe(450);
  });

  it("devuelve null para entradas inválidas", () => {
    expect(parseSpanishNumber("abc")).toBeNull();
    expect(parseSpanishNumber("")).toBeNull();
    expect(parseSpanishNumber(null)).toBeNull();
    expect(parseSpanishNumber(undefined)).toBeNull();
  });
});

describe("extractPrice", () => {
  it("extrae precio razonable del texto", () => {
    expect(extractPrice("Precio 180.000 € · 3 hab")).toBe(180000);
    expect(extractPrice("450 €/mes")).toBe(450);
  });

  it("descarta precios <= 0", () => {
    expect(extractPrice("Precio 0 €")).toBeNull();
  });

  it("devuelve null cuando no hay número", () => {
    expect(extractPrice("Sin precio")).toBeNull();
    expect(extractPrice(undefined)).toBeNull();
  });
});

describe("extractFirstNumber", () => {
  it("extrae con regex de superficie", () => {
    expect(extractFirstNumber("Piso de 82 m² en centro", /(\d{1,4})\s*m(?:²|2)?/i)).toBe(82);
  });

  it("devuelve null si no matchea", () => {
    expect(extractFirstNumber("Sin metros", /(\d{1,4})\s*m(?:²|2)?/i)).toBeNull();
  });
});

describe("canonicalizeUrl", () => {
  it("elimina utm_*, gclid y hash", () => {
    const url =
      "https://portal.example.com/inmueble/123/?utm_source=meta&utm_medium=cpc&id=foo#anchor";
    expect(canonicalizeUrl(url)).toBe("https://portal.example.com/inmueble/123/?id=foo");
  });

  it("elimina trailing slash salvo en root", () => {
    expect(canonicalizeUrl("https://portal.example.com/inmueble/123/")).toBe(
      "https://portal.example.com/inmueble/123",
    );
    expect(canonicalizeUrl("https://portal.example.com/")).toBe("https://portal.example.com/");
  });

  it("devuelve la URL original si no es parseable", () => {
    expect(canonicalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("mapHousingType", () => {
  it("mapea valores comunes", () => {
    expect(mapHousingType("Piso")).toBe("flat");
    expect(mapHousingType("Apartamento")).toBe("flat");
    expect(mapHousingType("Ático")).toBe("penthouse");
    expect(mapHousingType("atico")).toBe("penthouse");
    expect(mapHousingType("Chalet")).toBe("house");
    expect(mapHousingType("Garaje")).toBe("garage");
    expect(mapHousingType("Local comercial")).toBe("premises");
    expect(mapHousingType("Terreno urbano")).toBe("land");
  });

  it("usa flat como fallback", () => {
    expect(mapHousingType("desconocido")).toBe("flat");
    expect(mapHousingType("")).toBe("flat");
    expect(mapHousingType(null)).toBe("flat");
    expect(mapHousingType(undefined)).toBe("flat");
  });
});

describe("mapOperation", () => {
  it("mapea venta y alquiler", () => {
    expect(mapOperation("venta")).toBe("sale");
    expect(mapOperation("Venta de pisos")).toBe("sale");
    expect(mapOperation("alquiler")).toBe("rent");
    expect(mapOperation("Alquiler mensual")).toBe("rent");
  });

  it("respeta el fallback proporcionado", () => {
    expect(mapOperation(null, "rent")).toBe("rent");
    expect(mapOperation(undefined)).toBe("sale");
  });
});

describe("geohashEncode", () => {
  it("calcula geohash conocido para Córdoba (precisión 5)", () => {
    // Córdoba (37.8882, -4.7794) → prefijo 'eyk6n' aprox.
    const gh = geohashEncode(37.8882, -4.7794, 5);
    expect(gh.length).toBe(5);
    expect(gh).toMatch(/^[0-9bcdefghjkmnpqrstuvwxyz]+$/);
  });

  it("dos puntos cercanos comparten prefijo largo", () => {
    const a = geohashEncode(37.8882, -4.7794, 7);
    const b = geohashEncode(37.8884, -4.7791, 7); // ~25 m de distancia
    let common = 0;
    while (common < a.length && common < b.length && a[common] === b[common]) common++;
    expect(common).toBeGreaterThanOrEqual(6);
  });

  it("devuelve cadena vacía si lat/lng inválidos", () => {
    expect(geohashEncode(NaN, 0)).toBe("");
    expect(geohashEncode(0, Infinity)).toBe("");
  });
});

describe("normalizeRawListing", () => {
  it("convierte una captura completa en CanonicalListing válido", () => {
    const result = normalizeRawListing(makeRaw(), baseCtx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.listing.source).toBe("source_a");
    expect(result.listing.externalId).toBe("abc-123");
    expect(result.listing.operation).toBe("sale");
    expect(result.listing.housingType).toBe("flat");
    expect(result.listing.status).toBe("active");
    expect(result.listing.price).toBe(180000);
    expect(result.listing.builtArea).toBe(82);
    expect(result.listing.rooms).toBe(3);
    expect(result.listing.bathrooms).toBe(1);
    expect(result.listing.floor).toBe("3");
    expect(result.listing.city).toBe("cordoba");
    expect(result.listing.zone).toBe("Centro");
    expect(result.listing.pricePerMeter).toBeCloseTo(180000 / 82, 2);
    expect(result.listing.geohash).not.toBeNull();
    expect(result.listing.imageUrls).toHaveLength(2);
    expect(result.listing.firstSeenAt).toBe("2026-05-06T10:00:00.000Z");
    expect(result.listing.lastSeenAt).toBe("2026-05-06T10:00:00.000Z");
    expect(result.listing.lastChangeAt).toBeNull();
    expect(result.listing.qualityScore).toBe(0);
    expect(result.listing.qualityFlags).toEqual([]);
  });

  it("rechaza captura sin externalId", () => {
    const result = normalizeRawListing(
      makeRaw({ externalId: null }),
      baseCtx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_external_id");
  });

  it("rechaza captura sin URL", () => {
    const result = normalizeRawListing(
      makeRaw({ canonicalUrl: "" }),
      baseCtx,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_url");
  });

  it("rechaza captura sin ciudad ni fallback útil", () => {
    const result = normalizeRawListing(
      makeRaw({ payload: { ...makeRaw().payload, cityRaw: undefined } }),
      { ...baseCtx, defaultCity: "" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_city");
  });

  it("descarta precio <= 0", () => {
    const result = normalizeRawListing(
      makeRaw({ payload: { ...makeRaw().payload, priceRaw: "0", rawText: "Precio 0 €" } }),
      baseCtx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.price).toBeNull();
    expect(result.listing.pricePerMeter).toBeNull();
  });

  it("dedupa imageUrls preservando orden", () => {
    const result = normalizeRawListing(
      makeRaw({
        payload: {
          ...makeRaw().payload,
          imageUrls: [
            "https://cdn.example.com/img/1.jpg",
            "https://cdn.example.com/img/1.jpg",
            "https://cdn.example.com/img/2.jpg",
          ],
        },
      }),
      baseCtx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.imageUrls).toEqual([
      "https://cdn.example.com/img/1.jpg",
      "https://cdn.example.com/img/2.jpg",
    ]);
  });

  it("aplica defaultZone cuando el payload no la trae", () => {
    const result = normalizeRawListing(
      makeRaw({ payload: { ...makeRaw().payload, zoneRaw: undefined } }),
      { ...baseCtx, defaultZone: "Centro" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.zone).toBe("Centro");
  });
});
