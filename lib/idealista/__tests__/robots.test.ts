import { describe, expect, it } from "vitest";
import { evaluateRobots, parseRobotsTxt, robotsPatternMatches } from "../robots";

describe("idealista robots guard", () => {
  it("aplica reglas allow/disallow por mayor longitud", () => {
    const policy = parseRobotsTxt(`
User-agent: *
Disallow: /area-privada/
Disallow: /venta-viviendas/pagina-
Allow: /venta-viviendas/cordoba-cordoba/
`);

    expect(evaluateRobots(policy, "https://www.idealista.com/area-privada/").allowed).toBe(
      false,
    );
    expect(
      evaluateRobots(policy, "https://www.idealista.com/venta-viviendas/pagina-2.htm")
        .allowed,
    ).toBe(false);
    expect(
      evaluateRobots(policy, "https://www.idealista.com/venta-viviendas/cordoba-cordoba/")
        .allowed,
    ).toBe(true);
  });

  it("soporta comodines y anclas", () => {
    expect(robotsPatternMatches("/*.pdf$", "/foo/bar.pdf")).toBe(true);
    expect(robotsPatternMatches("/*.pdf$", "/foo/bar.pdf?x=1")).toBe(false);
    expect(robotsPatternMatches("/*?ordenado-por=*", "/venta-viviendas/?ordenado-por=precio")).toBe(
      true,
    );
  });
});
