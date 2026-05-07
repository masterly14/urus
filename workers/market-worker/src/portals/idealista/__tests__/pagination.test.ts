import { describe, expect, it } from "vitest";
import { buildPageUrl, nextPageCursor, parseCursor } from "../pagination";

describe("parseCursor", () => {
  it("null/undefined/vacio = pagina 1", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor("")).toBe(1);
  });

  it("entero positivo se respeta", () => {
    expect(parseCursor("3")).toBe(3);
    expect(parseCursor("12")).toBe(12);
  });

  it("valores invalidos caen a 1", () => {
    expect(parseCursor("foo")).toBe(1);
    expect(parseCursor("0")).toBe(1);
    expect(parseCursor("-1")).toBe(1);
    expect(parseCursor("3.5")).toBe(1);
  });
});

describe("nextPageCursor", () => {
  it("incrementa el cursor", () => {
    expect(nextPageCursor(null)).toBe("2");
    expect(nextPageCursor("1")).toBe("2");
    expect(nextPageCursor("3")).toBe("4");
  });
});

describe("buildPageUrl", () => {
  it("pagina 1 devuelve la URL semilla tal cual", () => {
    const seed = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/";
    expect(buildPageUrl(seed, 1)).toBe(seed);
    expect(buildPageUrl(seed, 0)).toBe(seed);
  });

  it("pagina N >=2 anade /pagina-N.htm preservando filtros", () => {
    const seed = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/";
    expect(buildPageUrl(seed, 2)).toBe(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/pagina-2.htm",
    );
    expect(buildPageUrl(seed, 5)).toBe(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/pagina-5.htm",
    );
  });

  it("preserva el segmento de filtro `con-pisos`", () => {
    const seed = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/";
    expect(buildPageUrl(seed, 3)).toBe(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/pagina-3.htm",
    );
  });

  it("preserva el segmento de filtro `con-precio-hasta_300000`", () => {
    const seed = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-precio-hasta_300000/";
    expect(buildPageUrl(seed, 2)).toBe(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-precio-hasta_300000/pagina-2.htm",
    );
  });

  it("si el path ya tiene /pagina-X.htm lo sustituye por /pagina-N.htm", () => {
    const seedAtP3 = "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/pagina-3.htm";
    expect(buildPageUrl(seedAtP3, 4)).toBe(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/pagina-4.htm",
    );
  });

  it("URL sin trailing slash anade el slash antes de pagina-N.htm", () => {
    const seedNoSlash = "https://www.idealista.com/venta-viviendas/cordoba-cordoba";
    expect(buildPageUrl(seedNoSlash, 2)).toBe(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/pagina-2.htm",
    );
  });
});
