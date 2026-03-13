import { describe, it, expect } from "vitest";
import { findPredefinedPolygon, listPredefinedAliases } from "../predefined";

describe("findPredefinedPolygon", () => {
  it("encuentra Córdoba (con y sin tilde)", () => {
    expect(findPredefinedPolygon("córdoba")).toBeDefined();
    expect(findPredefinedPolygon("cordoba")).toBeDefined();
    expect(findPredefinedPolygon("Córdoba")).toBeDefined();
  });

  it("encuentra Málaga", () => {
    expect(findPredefinedPolygon("málaga")).toBeDefined();
    expect(findPredefinedPolygon("malaga")).toBeDefined();
  });

  it("encuentra Sevilla", () => {
    expect(findPredefinedPolygon("sevilla")).toBeDefined();
  });

  it("encuentra zonas específicas", () => {
    expect(findPredefinedPolygon("córdoba centro")).toBeDefined();
    expect(findPredefinedPolygon("triana")).toBeDefined();
    expect(findPredefinedPolygon("teatinos")).toBeDefined();
    expect(findPredefinedPolygon("nervión")).toBeDefined();
    expect(findPredefinedPolygon("el brillante")).toBeDefined();
  });

  it("devuelve undefined para zona desconocida", () => {
    expect(findPredefinedPolygon("pueblo-inventado-xyz")).toBeUndefined();
    expect(findPredefinedPolygon("")).toBeUndefined();
  });

  it("los polígonos de Córdoba están en la zona correcta (lat ~37.88, lng ~-4.78)", () => {
    const polygon = findPredefinedPolygon("córdoba");
    expect(polygon).toBeDefined();
    expect(polygon!.center.lat).toBeGreaterThan(37.8);
    expect(polygon!.center.lat).toBeLessThan(38.0);
    expect(polygon!.center.lng).toBeGreaterThan(-5.0);
    expect(polygon!.center.lng).toBeLessThan(-4.5);
  });

  it("los polígonos de Málaga están en la zona correcta (lat ~36.72, lng ~-4.42)", () => {
    const polygon = findPredefinedPolygon("málaga");
    expect(polygon).toBeDefined();
    expect(polygon!.center.lat).toBeGreaterThan(36.6);
    expect(polygon!.center.lat).toBeLessThan(36.8);
    expect(polygon!.center.lng).toBeGreaterThan(-4.6);
    expect(polygon!.center.lng).toBeLessThan(-4.2);
  });

  it("los polígonos de Sevilla están en la zona correcta (lat ~37.38, lng ~-5.97)", () => {
    const polygon = findPredefinedPolygon("sevilla");
    expect(polygon).toBeDefined();
    expect(polygon!.center.lat).toBeGreaterThan(37.3);
    expect(polygon!.center.lat).toBeLessThan(37.5);
    expect(polygon!.center.lng).toBeGreaterThan(-6.1);
    expect(polygon!.center.lng).toBeLessThan(-5.8);
  });

  it("las zonas de una ciudad están contenidas dentro del polígono de la ciudad", () => {
    const cordoba = findPredefinedPolygon("córdoba")!;
    const centro = findPredefinedPolygon("córdoba centro")!;

    const cityBounds = {
      minLat: Math.min(...cordoba.vertices.map((v) => v.lat)),
      maxLat: Math.max(...cordoba.vertices.map((v) => v.lat)),
      minLng: Math.min(...cordoba.vertices.map((v) => v.lng)),
      maxLng: Math.max(...cordoba.vertices.map((v) => v.lng)),
    };

    expect(centro.center.lat).toBeGreaterThanOrEqual(cityBounds.minLat);
    expect(centro.center.lat).toBeLessThanOrEqual(cityBounds.maxLat);
    expect(centro.center.lng).toBeGreaterThanOrEqual(cityBounds.minLng);
    expect(centro.center.lng).toBeLessThanOrEqual(cityBounds.maxLng);
  });
});

describe("listPredefinedAliases", () => {
  it("devuelve un array no vacío", () => {
    const aliases = listPredefinedAliases();
    expect(aliases.length).toBeGreaterThan(0);
  });

  it("incluye las tres ciudades operativas", () => {
    const aliases = listPredefinedAliases();
    expect(aliases).toContain("córdoba");
    expect(aliases).toContain("málaga");
    expect(aliases).toContain("sevilla");
  });
});
