/**
 * Tests del parser Fotocasa contra fixture HTML real recortado del
 * portal el 6/05/2026. Los IDs y precios son los que aparecen
 * literalmente en el HTML capturado: si Fotocasa cambia su HTML, estos
 * tests rompen y nos dicen qué recapturar.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalizeFotocasaUrl,
  cardsToExtractorItems,
  detectBlockedPage,
  extractFotocasaListingId,
  parseFotocasaListingHtml,
} from "../parser";
import { computeFotocasaContentHash } from "../content-hash";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

// IDs reales presentes en la fixture (verificados manualmente desde la captura).
const REAL_IDS = ["189481445", "187412200", "189164577"];

describe("canonicalizeFotocasaUrl", () => {
  it("añade host, elimina utm_*", () => {
    const out = canonicalizeFotocasaUrl(
      "/es/comprar/vivienda/cordoba-capital/jardin-ascensor/189481445/d?utm_source=foo",
    );
    expect(out).toBe(
      "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/jardin-ascensor/189481445/d",
    );
  });

  it("elimina hash y trailing slash en path no-root", () => {
    const out = canonicalizeFotocasaUrl(
      "https://www.fotocasa.es/es/comprar/vivienda/x/y/189164577/d/#anchor",
    );
    expect(out).toBe(
      "https://www.fotocasa.es/es/comprar/vivienda/x/y/189164577/d",
    );
  });

  it("preserva params no-noise", () => {
    const out = canonicalizeFotocasaUrl(
      "/es/comprar/vivienda/x/y/123456/d?ref=internal",
    );
    expect(out).toContain("ref=internal");
  });
});

describe("extractFotocasaListingId", () => {
  it("extrae los IDs reales del fixture", () => {
    expect(
      extractFotocasaListingId(
        "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/jardin-ascensor/189481445/d",
      ),
    ).toBe("189481445");
    expect(
      extractFotocasaListingId(
        "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/aire-acondicionado-patio-amueblado/187412200/d",
      ),
    ).toBe("187412200");
  });

  it("devuelve null si no hay patrón", () => {
    expect(extractFotocasaListingId("https://www.fotocasa.es/foo/bar")).toBeNull();
  });
});

describe("detectBlockedPage", () => {
  it("HTML vacío bloqueado", () => {
    expect(detectBlockedPage("").blocked).toBe(true);
  });

  it("HTML mínimo (12 KB) con palabras de bloqueo bloqueado", () => {
    const blocked = "x".repeat(12_000) + " uso indebido captcha";
    expect(detectBlockedPage(blocked).blocked).toBe(true);
  });

  it("HTML grande sin marcadores de bloqueo NO bloqueado", () => {
    expect(detectBlockedPage(loadFixture("listing-cordoba.html")).blocked).toBe(false);
  });

  it("HTML que no menciona fotocasa ni /es/comprar/ bloqueado", () => {
    expect(detectBlockedPage("a".repeat(60_000)).blocked).toBe(true);
  });
});

describe("parseFotocasaListingHtml — modo regex-fallback (HTML legacy capturado vía direct-browser)", () => {
  it("extrae las cards reales del fixture", () => {
    const { cards, detectedUrlsCount } = parseFotocasaListingHtml(
      loadFixture("listing-cordoba.html"),
    );
    expect(detectedUrlsCount).toBeGreaterThanOrEqual(REAL_IDS.length);
    expect(cards.length).toBeGreaterThanOrEqual(REAL_IDS.length);

    const ids = new Set(cards.map((c) => c.externalId).filter(Boolean));
    for (const id of REAL_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("dedupea por canonicalUrl", () => {
    const { cards } = parseFotocasaListingHtml(loadFixture("listing-cordoba.html"));
    const urls = cards.map((c) => c.canonicalUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("rellena precio a partir del DOM circundante", () => {
    const { cards } = parseFotocasaListingHtml(loadFixture("listing-cordoba.html"));
    // Al menos una card debe tener precio detectado
    const conPrecio = cards.filter((c) => c.priceRaw && /\d/.test(c.priceRaw));
    expect(conPrecio.length).toBeGreaterThan(0);
  });

  it("rellena área (m²) o habitaciones para alguna card", () => {
    const { cards } = parseFotocasaListingHtml(loadFixture("listing-cordoba.html"));
    const conMetrica = cards.filter((c) => c.surfaceRaw || c.roomsRaw);
    expect(conMetrica.length).toBeGreaterThan(0);
  });

  it("devuelve cards vacías para HTML sin fichas", () => {
    const { cards } = parseFotocasaListingHtml("<html><body>nada útil</body></html>");
    expect(cards).toEqual([]);
  });

  it("modo regex-fallback NO rellena description/phones/imageUrls completas (eso requiere __INITIAL_PROPS__)", () => {
    const { cards } = parseFotocasaListingHtml(loadFixture("listing-cordoba.html"));
    for (const card of cards) {
      // En este modo el extractor no tiene acceso al JSON SSR.
      expect(card.description).toBeUndefined();
      expect(card.phones).toBeUndefined();
      expect(card.imageUrls).toBeUndefined();
      expect(card.advertiserName).toBeUndefined();
    }
  });
});

describe("parseFotocasaListingHtml — modo SSR (HTML real con __INITIAL_PROPS__)", () => {
  const html = loadFixture("listing-cordoba-real.html");

  it("extrae los 31 anuncios del listing pag.1 desde initialSearch.result.realEstates", () => {
    const { cards, detectedUrlsCount } = parseFotocasaListingHtml(html);
    expect(detectedUrlsCount).toBe(31);
    expect(cards.length).toBe(31);
  });

  it("cada card trae externalId numérico (id del anuncio en Fotocasa)", () => {
    const { cards } = parseFotocasaListingHtml(html);
    for (const card of cards) {
      expect(card.externalId).toMatch(/^\d{6,}$/);
    }
  });

  it("cada card trae canonicalUrl absoluta a /es/comprar/vivienda/... (incluye obra nueva sin /d)", () => {
    const { cards } = parseFotocasaListingHtml(html);
    for (const card of cards) {
      // Anuncios regulares terminan en `/d`, anuncios de obra nueva terminan
      // con el id (`/<promotionId>/<adId>`). Aceptamos ambos.
      expect(card.canonicalUrl).toMatch(
        /^https:\/\/www\.fotocasa\.es\/es\/comprar\/vivienda\/.+\/(?:d|\d+)$/,
      );
    }
  });

  it("dedupea por canonicalUrl (sin duplicados aunque __INITIAL_PROPS__ liste el mismo anuncio dos veces)", () => {
    const { cards } = parseFotocasaListingHtml(html);
    const urls = cards.map((c) => c.canonicalUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("rellena descripción larga, teléfono normalizado, fotos y advertiser desde el JSON SSR", () => {
    const { cards } = parseFotocasaListingHtml(html);
    const cardsConPhone = cards.filter((c) => c.phones && c.phones.length > 0);
    expect(cardsConPhone.length).toBeGreaterThan(0);
    for (const card of cardsConPhone) {
      // Teléfonos normalizados al formato +34NNNNNNNNN.
      for (const phone of card.phones!) {
        expect(phone).toMatch(/^\+34[6789]\d{8}$/);
      }
      expect(card.description).toBeTruthy();
      expect(card.imageUrls!.length).toBeGreaterThan(0);
      expect(card.imageUrls![0]).toMatch(/^https:\/\/static\.fotocasa\.es\//);
    }
  });

  it("mapea clientType='professional' → advertiserType='agency'", () => {
    const { cards } = parseFotocasaListingHtml(html);
    const agencyCards = cards.filter((c) => c.advertiserType === "agency");
    // En el listing capturado de Córdoba prácticamente todos son professional.
    expect(agencyCards.length).toBeGreaterThan(0);
  });

  it("extrae rawPrice numérico y priceRaw formateado", () => {
    const { cards } = parseFotocasaListingHtml(html);
    const conPrecio = cards.filter((c) => c.rawPrice != null && c.priceRaw);
    expect(conPrecio.length).toBe(cards.length);
    for (const card of conPrecio) {
      expect(card.rawPrice).toBeGreaterThan(1000);
      expect(card.priceRaw).toMatch(/€/);
    }
  });

  it("extrae coordenadas (latitude/longitude) del address", () => {
    const { cards } = parseFotocasaListingHtml(html);
    const conGeo = cards.filter((c) => c.latitude != null && c.longitude != null);
    expect(conGeo.length).toBeGreaterThan(0);
    for (const card of conGeo) {
      expect(card.latitude).toBeGreaterThan(36); // Córdoba ~37.88
      expect(card.latitude).toBeLessThan(38);
      expect(card.longitude).toBeGreaterThan(-5); // Córdoba ~-4.78
      expect(card.longitude).toBeLessThan(-4);
    }
  });
});

describe("cardsToExtractorItems", () => {
  it("genera contentHash determinístico y payload con metadata correcta", () => {
    const { cards } = parseFotocasaListingHtml(loadFixture("listing-cordoba.html"));
    const items = cardsToExtractorItems(cards, {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    expect(items.length).toBe(cards.length);
    for (const item of items) {
      expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(item.httpStatus).toBe(200);
      expect(item.payload.cityRaw).toBe("cordoba");
      expect(item.payload.operationRaw).toBe("venta");
      expect(item.payload.housingRaw).toBe("vivienda");
    }
  });

  it("re-procesar mismos cards produce mismos hashes", () => {
    const { cards } = parseFotocasaListingHtml(loadFixture("listing-cordoba.html"));
    const a = cardsToExtractorItems(cards, {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    const b = cardsToExtractorItems(cards, {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    for (const item of a) {
      const counterpart = b.find((i) => i.canonicalUrl === item.canonicalUrl);
      expect(counterpart!.contentHash).toBe(item.contentHash);
    }
  });
});

describe("computeFotocasaContentHash", () => {
  it("cambia con el precio (detecta bajadas)", () => {
    const a = computeFotocasaContentHash({
      externalId: "189481445",
      canonicalUrl: "https://x/1",
      priceRaw: "179.500 €",
      title: "Piso",
      surfaceRaw: "98",
      roomsRaw: "3",
      zoneRaw: null,
    });
    const b = computeFotocasaContentHash({
      externalId: "189481445",
      canonicalUrl: "https://x/1",
      priceRaw: "169.900 €",
      title: "Piso",
      surfaceRaw: "98",
      roomsRaw: "3",
      zoneRaw: null,
    });
    expect(a).not.toBe(b);
  });

  it("estable a variaciones de mayúsculas en title", () => {
    const a = computeFotocasaContentHash({
      externalId: "1",
      canonicalUrl: "https://x/1",
      priceRaw: "179.500 €",
      title: "Piso en Centro",
      surfaceRaw: "98",
      roomsRaw: "3",
      zoneRaw: null,
    });
    const b = computeFotocasaContentHash({
      externalId: "1",
      canonicalUrl: "https://x/1",
      priceRaw: "179.500 €",
      title: "PISO EN CENTRO",
      surfaceRaw: "98",
      roomsRaw: "3",
      zoneRaw: null,
    });
    expect(a).toBe(b);
  });
});
