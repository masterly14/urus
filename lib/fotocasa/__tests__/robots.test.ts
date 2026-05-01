import { describe, expect, it } from "vitest";
import { evaluateRobots, parseRobotsTxt, robotsPatternMatches } from "../robots";

describe("fotocasa robots guard", () => {
  it("aplica la regla mas larga y permite excepciones", () => {
    const policy = parseRobotsTxt(`
User-agent: *
Disallow: /search/
Allow: /search/public
Disallow: /*pagination=*
`);

    expect(evaluateRobots(policy, "https://www.fotocasa.es/search/foo").allowed).toBe(false);
    expect(evaluateRobots(policy, "https://www.fotocasa.es/search/public").allowed).toBe(true);
    expect(
      evaluateRobots(policy, "https://www.fotocasa.es/es/comprar/pisos/l?pagination=2").allowed,
    ).toBe(false);
  });

  it("soporta comodines y anclas de final", () => {
    expect(robotsPatternMatches("/*.pdf$", "/foo/bar.pdf")).toBe(true);
    expect(robotsPatternMatches("/*.pdf$", "/foo/bar.pdf?x=1")).toBe(false);
    expect(robotsPatternMatches("/*?id=*", "/es/comprar/piso/d?id=123")).toBe(true);
  });
});
