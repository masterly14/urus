/**
 * Tests del parser Pisos.com contra fixture HTML real recortado del
 * portal el 6/05/2026. Los IDs son los que aparecen literalmente en
 * la fixture; si Pisos.com cambia su HTML, estos tests rompen y nos
 * dicen qué recapturar.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalizePisoscomUrl,
  cardsToExtractorItems,
  detectBlockedPage,
  extractPisoscomListingId,
  parsePisoscomListingHtml,
} from "../parser";
import { computePisoscomContentHash } from "../content-hash";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

// IDs reales extraídos de la captura del 6/05/2026.
const REAL_IDS = ["62580960798", "56673781357", "57512762410", "57559297361"];

describe("canonicalizePisoscomUrl", () => {
  it("añade host, elimina utm_*, asegura trailing slash en fichas", () => {
    const out = canonicalizePisoscomUrl(
      "/comprar/piso-la_vinuela_rescatado14007-62580960798_100500?utm_source=foo",
    );
    expect(out).toBe(
      "https://www.pisos.com/comprar/piso-la_vinuela_rescatado14007-62580960798_100500/",
    );
  });

  it("elimina hash", () => {
    const out = canonicalizePisoscomUrl(
      "https://www.pisos.com/comprar/casa_adosada-ciudad_jardin_zoco14005-56673781357_100500/#x",
    );
    expect(out).toBe(
      "https://www.pisos.com/comprar/casa_adosada-ciudad_jardin_zoco14005-56673781357_100500/",
    );
  });
});

describe("extractPisoscomListingId", () => {
  it("extrae los IDs reales del fixture", () => {
    expect(
      extractPisoscomListingId(
        "https://www.pisos.com/comprar/piso-la_vinuela_rescatado14007-62580960798_100500/",
      ),
    ).toBe("62580960798");
    expect(
      extractPisoscomListingId(
        "https://www.pisos.com/comprar/loft-la_vinuela_rescatado14007-57512762410_100500/",
      ),
    ).toBe("57512762410");
  });

  it("devuelve null si no hay patrón", () => {
    expect(extractPisoscomListingId("https://www.pisos.com/venta/pisos-cordoba_capital/")).toBeNull();
  });
});

describe("detectBlockedPage", () => {
  it("detecta HTML vacío", () => {
    expect(detectBlockedPage("").blocked).toBe(true);
  });

  it("detecta página 404 personalizada de Pisos.com", () => {
    expect(detectBlockedPage("<html><head><title>404</title></head><body>Not found</body></html>" + "x".repeat(1000)).blocked).toBe(true);
  });

  it("acepta fixture real como NO bloqueada", () => {
    expect(detectBlockedPage(loadFixture("listing-cordoba.html")).blocked).toBe(false);
  });
});

describe("parsePisoscomListingHtml — sobre HTML real", () => {
  it("extrae las 4 cards reales del fixture", () => {
    const { cards, detectedUrlsCount } = parsePisoscomListingHtml(
      loadFixture("listing-cordoba.html"),
    );
    expect(detectedUrlsCount).toBe(REAL_IDS.length);
    expect(cards.length).toBe(REAL_IDS.length);
    expect(cards.map((c) => c.externalId).sort()).toEqual([...REAL_IDS].sort());
  });

  it("rellena precio, área y habs desde el bloque ad-preview", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    // Al menos la mayoría debe tener los 3 campos básicos.
    const completos = cards.filter((c) => c.priceRaw && c.surfaceRaw && c.roomsRaw);
    expect(completos.length).toBeGreaterThanOrEqual(Math.ceil(cards.length / 2));
  });

  it("enriquece con geo (lat/lng) desde JSON-LD cuando está", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    const conGeo = cards.filter((c) => c.lat != null && c.lng != null);
    expect(conGeo.length).toBeGreaterThanOrEqual(1);

    const piso = cards.find((c) => c.externalId === "62580960798");
    expect(piso).toBeDefined();
    // lat real del JSON-LD: 37.8907722, lng: -4.7622451
    expect(piso?.lat).toBeCloseTo(37.89, 1);
    expect(piso?.lng).toBeCloseTo(-4.76, 1);
  });

  it("enriquece con imageUrl desde JSON-LD", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    const conImg = cards.filter((c) => c.imageUrl && c.imageUrl.startsWith("http"));
    expect(conImg.length).toBeGreaterThanOrEqual(1);
  });

  it("decodifica entities HTML del JSON-LD (Có vs C&#xF3;)", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    const piso = cards.find((c) => c.externalId === "62580960798");
    expect(piso?.zoneRaw).toContain("Córdoba");
  });

  it("dedupea por externalId", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    const ids = cards.map((c) => c.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("devuelve cards vacías para HTML sin ad-previews", () => {
    const { cards } = parsePisoscomListingHtml("<html><body>nada útil</body></html>");
    expect(cards).toEqual([]);
  });
});

describe("cardsToExtractorItems (Pisos.com)", () => {
  it("genera contentHash determinístico, propaga geo y mainImageUrl", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    const items = cardsToExtractorItems(cards, {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    expect(items).toHaveLength(cards.length);

    const piso = items.find((i) => i.externalId === "62580960798");
    expect(piso).toBeDefined();
    expect(piso!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(piso!.payload.cityRaw).toBe("cordoba");
    expect(piso!.payload.operationRaw).toBe("venta");
    expect(piso!.payload.housingRaw).toBe("piso");
    expect(piso!.payload.mainImageUrl).toMatch(/^https:\/\//);
    expect(piso!.payload.lat).toBeCloseTo(37.89, 1);
  });

  it("infiere housingRaw distinto por tipología en URL", () => {
    const { cards } = parsePisoscomListingHtml(loadFixture("listing-cordoba.html"));
    const items = cardsToExtractorItems(cards, {
      cityFromSeed: "cordoba",
      defaultZone: null,
      httpStatus: 200,
    });
    const housings = new Set(items.map((i) => i.payload.housingRaw));
    expect(housings.size).toBeGreaterThanOrEqual(2);
    expect(housings.has("piso")).toBe(true);
  });
});

describe("computePisoscomContentHash", () => {
  it("cambia con el precio (detecta bajadas)", () => {
    const a = computePisoscomContentHash({
      externalId: "62580960798",
      canonicalUrl: "https://x/1",
      priceRaw: "170.000 €",
      title: "Piso",
      surfaceRaw: "90",
      roomsRaw: "3",
      zoneRaw: "Córdoba",
    });
    const b = computePisoscomContentHash({
      externalId: "62580960798",
      canonicalUrl: "https://x/1",
      priceRaw: "165.000 €",
      title: "Piso",
      surfaceRaw: "90",
      roomsRaw: "3",
      zoneRaw: "Córdoba",
    });
    expect(a).not.toBe(b);
  });
});
