import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_PORTALS_V1,
  ACTIVE_SOURCES_V1,
  detectPortalFromUrl,
  getActiveSourcesV1,
  portalForSource,
  sourceForPortal,
  sourceFromUrl,
} from "@/lib/market";

describe("source ↔ portal mapping", () => {
  it("redondea ida y vuelta para todos los portales", () => {
    for (const portal of ["fotocasa", "pisoscom", "milanuncios", "idealista", "unknown"] as const) {
      expect(portalForSource(sourceForPortal(portal))).toBe(portal);
    }
  });

  it("aplica las asignaciones documentadas en V1", () => {
    expect(portalForSource("source_a")).toBe("fotocasa");
    expect(portalForSource("source_b")).toBe("pisoscom");
    expect(portalForSource("source_c")).toBe("milanuncios");
    expect(portalForSource("source_d")).toBe("idealista");
    expect(portalForSource("unknown")).toBe("unknown");
  });

  it("ACTIVE_PORTALS_V1 sólo incluye los portales del MVP (fotocasa, pisoscom)", () => {
    // Milanuncios queda fuera del MVP por bloqueo PerimeterX/HUMAN — requiere
    // Bright Data. Idealista queda fuera por DataDome — diferido a Fase 2.c.
    expect(ACTIVE_PORTALS_V1).toEqual(["fotocasa", "pisoscom"]);
    expect(ACTIVE_SOURCES_V1).toEqual(["source_a", "source_b"]);
  });
});

describe("detectPortalFromUrl", () => {
  it("detecta fotocasa", () => {
    expect(detectPortalFromUrl("https://www.fotocasa.es/es/comprar/x/d")).toBe("fotocasa");
    expect(sourceFromUrl("https://www.fotocasa.es/es/comprar/x/d")).toBe("source_a");
  });

  it("detecta pisos.com", () => {
    expect(detectPortalFromUrl("https://www.pisos.com/comprar/pisos-cordoba/")).toBe("pisoscom");
    expect(sourceFromUrl("https://www.pisos.com/comprar/pisos-cordoba/")).toBe("source_b");
  });

  it("detecta milanuncios", () => {
    expect(detectPortalFromUrl("https://www.milanuncios.com/inmuebles/")).toBe("milanuncios");
    expect(sourceFromUrl("https://www.milanuncios.com/inmuebles/")).toBe("source_c");
  });

  it("detecta idealista (aunque esté fuera de V1)", () => {
    expect(detectPortalFromUrl("https://www.idealista.com/inmueble/123/")).toBe("idealista");
  });

  it("devuelve unknown para hosts no soportados", () => {
    expect(detectPortalFromUrl("https://www.example.com/")).toBe("unknown");
    expect(detectPortalFromUrl("not-a-url")).toBe("unknown");
    expect(detectPortalFromUrl("")).toBe("unknown");
  });

  it("acepta variantes de subdominio", () => {
    expect(detectPortalFromUrl("https://m.fotocasa.es/es/")).toBe("fotocasa");
    expect(detectPortalFromUrl("https://pisos.com/x")).toBe("pisoscom");
  });
});

describe("getActiveSourcesV1 (flag MARKET_IDEALISTA_ENABLED)", () => {
  const original = process.env.MARKET_IDEALISTA_ENABLED;
  beforeEach(() => {
    delete process.env.MARKET_IDEALISTA_ENABLED;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MARKET_IDEALISTA_ENABLED;
    else process.env.MARKET_IDEALISTA_ENABLED = original;
  });

  it("flag undefined => solo Fotocasa + Pisos.com", () => {
    expect(getActiveSourcesV1()).toEqual(["source_a", "source_b"]);
  });

  it("flag false / 0 / empty => solo Fotocasa + Pisos.com", () => {
    process.env.MARKET_IDEALISTA_ENABLED = "false";
    expect(getActiveSourcesV1()).toEqual(["source_a", "source_b"]);
    process.env.MARKET_IDEALISTA_ENABLED = "0";
    expect(getActiveSourcesV1()).toEqual(["source_a", "source_b"]);
    process.env.MARKET_IDEALISTA_ENABLED = "";
    expect(getActiveSourcesV1()).toEqual(["source_a", "source_b"]);
  });

  it("flag true => incluye Idealista (source_d)", () => {
    process.env.MARKET_IDEALISTA_ENABLED = "true";
    expect(getActiveSourcesV1()).toEqual(["source_a", "source_b", "source_d"]);
  });

  it("flag '1' => incluye Idealista", () => {
    process.env.MARKET_IDEALISTA_ENABLED = "1";
    expect(getActiveSourcesV1()).toEqual(["source_a", "source_b", "source_d"]);
  });

  it("ACTIVE_SOURCES_V1 (constante) NUNCA incluye source_d, pase lo que pase con el flag", () => {
    process.env.MARKET_IDEALISTA_ENABLED = "true";
    expect(ACTIVE_SOURCES_V1).toEqual(["source_a", "source_b"]);
  });
});
