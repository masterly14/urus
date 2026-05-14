import { describe, expect, it } from "vitest";
import { buildPageUrl, nextPageCursor, parseCursor } from "../pagination";

describe("parseCursor", () => {
  it("devuelve 1 cuando es null o vacío", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor("")).toBe(1);
  });

  it("parsea enteros válidos", () => {
    expect(parseCursor("3")).toBe(3);
    expect(parseCursor("10")).toBe(10);
  });

  it("rechaza no enteros y devuelve 1", () => {
    expect(parseCursor("abc")).toBe(1);
    expect(parseCursor("0")).toBe(1);
    expect(parseCursor("-2")).toBe(1);
    expect(parseCursor("3.5")).toBe(1);
  });
});

describe("nextPageCursor", () => {
  it("incrementa en 1", () => {
    expect(nextPageCursor(null)).toBe("2");
    expect(nextPageCursor("3")).toBe("4");
  });
});

describe("buildPageUrl", () => {
  it("devuelve seed tal cual para n <= 1", () => {
    const seed = "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/todas-las-zonas/l";
    expect(buildPageUrl(seed, 0)).toBe(seed);
    expect(buildPageUrl(seed, 1)).toBe(seed);
  });

  it("añade ?pagina=N para n > 1", () => {
    const seed = "https://www.fotocasa.es/es/comprar/vivienda/cordoba-capital/todas-las-zonas/l";
    expect(buildPageUrl(seed, 3)).toBe(`${seed}?pagina=3`);
  });

  it("reemplaza pagina existente", () => {
    const seed = "https://www.fotocasa.es/es/comprar/vivienda/cordoba/centro/l?pagina=5";
    expect(buildPageUrl(seed, 7)).toBe(
      "https://www.fotocasa.es/es/comprar/vivienda/cordoba/centro/l?pagina=7",
    );
  });
});
