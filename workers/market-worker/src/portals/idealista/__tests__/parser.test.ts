/**
 * Tests del parser Idealista contra HTML REAL capturado el 06/05/2026
 * via Bright Data Web Unlocker (zone web_unlocker1, country=es).
 *
 * Los IDs y precios son los que aparecen literalmente en la captura.
 * Si Idealista cambia su HTML, estos tests rompen y nos dicen que
 * recapturar (`docs/portal-html-analysis.md` seccion "Idealista").
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalizeIdealistaUrl,
  cardsToExtractorItems,
  cleanupTitleLocationChunk,
  detectBlockedPage,
  extractIdealistaListingCoords,
  extractIdealistaListingId,
  parseIdealistaListingHtml,
} from "../parser";
import { computeIdealistaContentHash } from "../content-hash";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

// IDs reales presentes en la fixture listing-cordoba-pisos.html (verificados
// manualmente con grep `data-element-id="<ID>"`).
const REAL_PISOS_IDS = ["111192450", "109756579"];

describe("canonicalizeIdealistaUrl", () => {
  it("anade host completo y elimina utm_*", () => {
    const out = canonicalizeIdealistaUrl(
      "/inmueble/111192450/?utm_source=foo&utm_medium=bar",
    );
    expect(out).toBe("https://www.idealista.com/inmueble/111192450/");
  });

  it("elimina ordenado-por y adId (tracking interno)", () => {
    const out = canonicalizeIdealistaUrl(
      "/inmueble/106437301/?ordenado-por=fecha-publicacion-desc&adId=xyz",
    );
    expect(out).toBe("https://www.idealista.com/inmueble/106437301/");
  });

  it("elimina hash", () => {
    const out = canonicalizeIdealistaUrl(
      "https://www.idealista.com/inmueble/123456/#galeria",
    );
    expect(out).toBe("https://www.idealista.com/inmueble/123456/");
  });
});

describe("extractIdealistaListingId", () => {
  it("extrae ID de URL canonica", () => {
    expect(extractIdealistaListingId("https://www.idealista.com/inmueble/111192450/")).toBe(
      "111192450",
    );
  });

  it("acepta path sin trailing slash", () => {
    expect(extractIdealistaListingId("https://www.idealista.com/inmueble/111192450")).toBe(
      "111192450",
    );
  });

  it("devuelve null si no es URL de inmueble", () => {
    expect(
      extractIdealistaListingId("https://www.idealista.com/venta-viviendas/cordoba-cordoba/"),
    ).toBeNull();
  });
});

describe("detectBlockedPage", () => {
  it("acepta el HTML real de listado capturado el 06/05/2026", () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const result = detectBlockedPage(html);
    expect(result.blocked).toBe(false);
  });

  it("acepta otra captura real (con-precio-hasta_300000)", () => {
    const html = loadFixture("listing-cordoba-hasta300k.html");
    expect(detectBlockedPage(html).blocked).toBe(false);
  });

  it("acepta captura de paginacion (pagina-3)", () => {
    const html = loadFixture("listing-cordoba-pagina-3.html");
    expect(detectBlockedPage(html).blocked).toBe(false);
  });

  it("detecta el bloqueo real de DataDome capturado con curl naive", () => {
    const html = loadFixture("blocked-datadome.html");
    const result = detectBlockedPage(html);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/DataDome|uso indebido|HTML/i);
  });

  it("rechaza HTML vacio o diminuto", () => {
    expect(detectBlockedPage("").blocked).toBe(true);
    expect(detectBlockedPage("<html></html>").blocked).toBe(true);
  });
});

describe("parseIdealistaListingHtml — fixture real con-pisos (06/05/2026)", () => {
  const html = loadFixture("listing-cordoba-pisos.html");
  const result = parseIdealistaListingHtml(html);

  it("encuentra al menos 25 cards (pagina tipica de Idealista trae ~30)", () => {
    expect(result.cards.length).toBeGreaterThanOrEqual(25);
    expect(result.cards.length).toBeLessThanOrEqual(40);
  });

  it("los IDs reales esperados estan presentes", () => {
    const ids = result.cards.map((c) => c.externalId);
    for (const id of REAL_PISOS_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("todas las cards tienen canonicalUrl con host completo", () => {
    for (const card of result.cards) {
      expect(card.canonicalUrl).toMatch(/^https:\/\/www\.idealista\.com\/inmueble\/\d{6,}\//);
    }
  });

  it("todas las cards tienen externalId que coincide con el path de canonicalUrl", () => {
    for (const card of result.cards) {
      expect(card.externalId).not.toBeNull();
      expect(card.canonicalUrl).toContain(`/inmueble/${card.externalId}/`);
    }
  });

  it("la mayoria de cards tienen precio (>= 90%)", () => {
    const withPrice = result.cards.filter((c) => c.priceRaw !== null);
    expect(withPrice.length / result.cards.length).toBeGreaterThan(0.9);
    // Formato esperado: "X.XXX €" o "XXXXX €".
    for (const card of withPrice) {
      expect(card.priceRaw).toMatch(/\d+(?:\.\d{3})*\s*€/);
    }
  });

  it("la mayoria de cards tienen surfaceRaw (m²)", () => {
    const withSurface = result.cards.filter((c) => c.surfaceRaw !== null);
    expect(withSurface.length / result.cards.length).toBeGreaterThan(0.7);
  });

  it("la mayoria de cards tienen roomsRaw (X hab.)", () => {
    const withRooms = result.cards.filter((c) => c.roomsRaw !== null);
    expect(withRooms.length / result.cards.length).toBeGreaterThan(0.6);
  });

  it("la card con ID 111192450 tiene los datos esperados literales", () => {
    const card = result.cards.find((c) => c.externalId === "111192450");
    expect(card).toBeDefined();
    if (!card) return;
    expect(card.priceRaw).toBe("155.000 €");
    expect(card.surfaceRaw).toBe("71");
    expect(card.roomsRaw).toBe("2");
    expect(card.title).toContain("Almogávares");
    expect(card.title).toContain("Córdoba");
    expect(card.agencyName).toBe("Inmolike");
    expect(card.canonicalUrl).toBe("https://www.idealista.com/inmueble/111192450/");
    expect(card.mainImageUrl).toMatch(/^https:\/\/img\d+\.idealista\.com\//);
  });

  it("la card 109756579 (Vistalegre) extrae zona desde el title", () => {
    const card = result.cards.find((c) => c.externalId === "109756579");
    expect(card).toBeDefined();
    if (!card) return;
    expect(card.priceRaw).toBe("214.238 €");
    expect(card.zoneRaw).toMatch(/Vistalegre|Parque Cruz|Universidades/);
    expect(card.zoneRaw).not.toMatch(/^Piso en /i);
  });

  it("extrae addressRaw cuando el title trae calle + numero", () => {
    const card = result.cards.find((c) => c.externalId === "109756579");
    expect(card).toBeDefined();
    if (!card) return;
    expect(card.addressRaw).toMatch(/Avenida Men[ée]ndez Pidal/i);
  });

  it("cleanupTitleLocationChunk limpia prefijos compuestos", () => {
    expect(
      cleanupTitleLocationChunk(
        "Casa o chalet independiente en Casco Histórico - Ollerías - Marrubial",
      ),
    ).toBe("Casco Histórico - Ollerías - Marrubial");
    expect(cleanupTitleLocationChunk("Chalet adosado en Centro")).toBe("Centro");
    expect(cleanupTitleLocationChunk("Piso en Avenida Real")).toBe("Avenida Real");
    expect(cleanupTitleLocationChunk("Estudio en Casco Histórico")).toBe(
      "Casco Histórico",
    );
    expect(cleanupTitleLocationChunk("Centro")).toBe("Centro");
  });

  it("la card 111192450 tiene lat/lng extraidos del map.src", () => {
    const card = result.cards.find((c) => c.externalId === "111192450");
    expect(card).toBeDefined();
    if (!card) return;
    expect(card.lat).toBeCloseTo(37.898739, 4);
    expect(card.lng).toBeCloseTo(-4.779755, 4);
  });

  it("la mayoria de cards traen lat/lng (>= 80% sobre fixture real)", () => {
    const withCoords = result.cards.filter(
      (c) => c.lat !== null && c.lng !== null,
    );
    expect(withCoords.length / result.cards.length).toBeGreaterThan(0.8);
    for (const card of withCoords) {
      // Todas las coords deberian estar en el bbox aproximado de Cordoba
      // capital (37.8-37.95 N, -4.85--4.65 E).
      expect(card.lat!).toBeGreaterThan(37.8);
      expect(card.lat!).toBeLessThan(37.95);
      expect(card.lng!).toBeGreaterThan(-4.85);
      expect(card.lng!).toBeLessThan(-4.65);
    }
  });

  it("dedupe: no devuelve dos cards con el mismo externalId", () => {
    const ids = result.cards.map((c) => c.externalId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parseIdealistaListingHtml — fixture real pagina-3 (paginacion)", () => {
  const html = loadFixture("listing-cordoba-pagina-3.html");
  const result = parseIdealistaListingHtml(html);

  it("tambien extrae 25+ cards en la pagina 3", () => {
    expect(result.cards.length).toBeGreaterThanOrEqual(25);
  });

  it("URLs canonicas no se solapan con las de la pagina 1 (sanity)", () => {
    const otherHtml = loadFixture("listing-cordoba-pisos.html");
    const otherResult = parseIdealistaListingHtml(otherHtml);
    const idsP3 = new Set(result.cards.map((c) => c.externalId));
    const idsP1 = new Set(otherResult.cards.map((c) => c.externalId));
    // Idealista permite repetir cards "Top" entre paginas (anuncios destacados);
    // pero el gross de cada pagina es disjunto. Verificamos que al menos el
    // 60% de las cards de p3 NO esten en p1.
    const overlap = [...idsP3].filter((id) => idsP1.has(id)).length;
    const disjoint = idsP3.size - overlap;
    expect(disjoint / idsP3.size).toBeGreaterThan(0.5);
  });
});

describe("parseIdealistaListingHtml — fixture real con-precio-hasta_300000", () => {
  const html = loadFixture("listing-cordoba-hasta300k.html");
  const result = parseIdealistaListingHtml(html);

  it("extrae cards y todos los precios <= 300000", () => {
    expect(result.cards.length).toBeGreaterThan(20);
    for (const card of result.cards) {
      if (!card.priceRaw) continue;
      const num = Number(card.priceRaw.replace(/[^\d]/g, ""));
      expect(num).toBeLessThanOrEqual(300_000);
    }
  });
});

describe("extractIdealistaListingCoords", () => {
  it("devuelve un Map con >=25 entradas para fixture real con-pisos", () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const coords = extractIdealistaListingCoords(html);
    expect(coords.size).toBeGreaterThanOrEqual(25);
  });

  it("la coordenada de 111192450 es la del map.src real", () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const coords = extractIdealistaListingCoords(html);
    const c = coords.get("111192450");
    expect(c).toBeDefined();
    expect(c!.lat).toBeCloseTo(37.898739, 4);
    expect(c!.lng).toBeCloseTo(-4.779755, 4);
  });

  it("devuelve Map vacio si no hay listingMultimediaCarrousels", () => {
    const coords = extractIdealistaListingCoords("<html></html>");
    expect(coords.size).toBe(0);
  });

  it("devuelve Map vacio si JSON malformado", () => {
    // listingMultimediaCarrousels: { sin cierre — brace-walk no termina.
    const coords = extractIdealistaListingCoords(
      "x listingMultimediaCarrousels: {abc",
    );
    expect(coords.size).toBe(0);
  });
});

describe("cardsToExtractorItems", () => {
  it("convierte ParsedCard a MarketExtractorItem con contentHash determinista", () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const { cards } = parseIdealistaListingHtml(html);
    const items = cardsToExtractorItems(cards.slice(0, 3), {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });

    expect(items).toHaveLength(3);
    for (let i = 0; i < items.length; i++) {
      const card = cards[i]!;
      const item = items[i]!;
      expect(item.externalId).toBe(card.externalId);
      expect(item.canonicalUrl).toBe(card.canonicalUrl);
      expect(item.httpStatus).toBe(200);
      expect(item.payload.cityRaw).toBe("cordoba");
      expect(item.payload.operationRaw).toBe("venta");
      // contentHash debe ser estable para los mismos inputs.
      const expectedHash = computeIdealistaContentHash({
        externalId: card.externalId,
        canonicalUrl: card.canonicalUrl,
        priceRaw: card.priceRaw,
        title: card.title,
        surfaceRaw: card.surfaceRaw,
        roomsRaw: card.roomsRaw,
        zoneRaw: card.zoneRaw,
      });
      expect(item.contentHash).toBe(expectedHash);
    }
  });

  it("llama dos veces con misma card => mismo contentHash (idempotencia)", () => {
    const html = loadFixture("listing-cordoba-pisos.html");
    const { cards } = parseIdealistaListingHtml(html);
    const items1 = cardsToExtractorItems(cards.slice(0, 1), {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    const items2 = cardsToExtractorItems(cards.slice(0, 1), {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    expect(items1[0]!.contentHash).toBe(items2[0]!.contentHash);
  });
});
