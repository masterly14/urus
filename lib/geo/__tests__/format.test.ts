import { describe, it, expect } from "vitest";
import {
  serializePolygon,
  calculateCenter,
  estimateZoom,
  vertexBounds,
  bboxToPolygon,
  polygonToInmovillaFields,
} from "../format";
import type { LatLng, BoundingBox, GeoPolygon } from "../types";

describe("serializePolygon", () => {
  it("serializa un rectángulo al formato Inmovilla", () => {
    const vertices: LatLng[] = [
      { lat: 37.88, lng: -4.79 },
      { lat: 37.89, lng: -4.79 },
      { lat: 37.89, lng: -4.77 },
      { lat: 37.88, lng: -4.77 },
    ];
    const result = serializePolygon(vertices);
    expect(result).toBe(";37.88+-4.79,37.89+-4.79,37.89+-4.77,37.88+-4.77,37.88+-4.79");
  });

  it("añade el punto de cierre si no está presente", () => {
    const vertices: LatLng[] = [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 20 },
      { lat: 11, lng: 21 },
    ];
    const result = serializePolygon(vertices);
    expect(result).toContain("10+20");
    expect(result.split(",")).toHaveLength(4);
  });

  it("no duplica el cierre si ya está cerrado", () => {
    const vertices: LatLng[] = [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 20 },
      { lat: 10, lng: 20 },
    ];
    const result = serializePolygon(vertices);
    expect(result.split(",")).toHaveLength(3);
  });

  it("devuelve string vacío para array vacío", () => {
    expect(serializePolygon([])).toBe("");
  });

  it("empieza con punto y coma", () => {
    const result = serializePolygon([{ lat: 1, lng: 2 }]);
    expect(result.startsWith(";")).toBe(true);
  });
});

describe("calculateCenter", () => {
  it("calcula el centroide de un rectángulo", () => {
    const vertices: LatLng[] = [
      { lat: 10, lng: 20 },
      { lat: 12, lng: 20 },
      { lat: 12, lng: 22 },
      { lat: 10, lng: 22 },
    ];
    const center = calculateCenter(vertices);
    expect(center.lat).toBe(11);
    expect(center.lng).toBe(21);
  });

  it("devuelve (0,0) para array vacío", () => {
    const center = calculateCenter([]);
    expect(center.lat).toBe(0);
    expect(center.lng).toBe(0);
  });
});

describe("estimateZoom", () => {
  it("devuelve zoom alto para un área pequeña", () => {
    const vertices: LatLng[] = [
      { lat: 37.88, lng: -4.79 },
      { lat: 37.89, lng: -4.79 },
      { lat: 37.89, lng: -4.78 },
      { lat: 37.88, lng: -4.78 },
    ];
    const zoom = estimateZoom(vertices);
    expect(zoom).toBeGreaterThanOrEqual(15);
  });

  it("devuelve zoom bajo para un área grande", () => {
    const vertices: LatLng[] = [
      { lat: 36, lng: -6 },
      { lat: 38, lng: -6 },
      { lat: 38, lng: -4 },
      { lat: 36, lng: -4 },
    ];
    const zoom = estimateZoom(vertices);
    expect(zoom).toBeLessThanOrEqual(10);
  });

  it("devuelve 15 para menos de 2 vértices", () => {
    expect(estimateZoom([])).toBe(15);
    expect(estimateZoom([{ lat: 37, lng: -4 }])).toBe(15);
  });
});

describe("vertexBounds", () => {
  it("calcula el bounding box de vértices", () => {
    const vertices: LatLng[] = [
      { lat: 37.84, lng: -4.85 },
      { lat: 37.92, lng: -4.85 },
      { lat: 37.92, lng: -4.72 },
      { lat: 37.84, lng: -4.72 },
    ];
    const bbox = vertexBounds(vertices);
    expect(bbox.south).toBe(37.84);
    expect(bbox.north).toBe(37.92);
    expect(bbox.west).toBe(-4.85);
    expect(bbox.east).toBe(-4.72);
  });
});

describe("bboxToPolygon", () => {
  it("convierte un bounding box a un polígono rectangular", () => {
    const bbox: BoundingBox = { south: 37, west: -5, north: 38, east: -4 };
    const polygon = bboxToPolygon(bbox);
    expect(polygon.vertices).toHaveLength(4);
    expect(polygon.center.lat).toBeCloseTo(37.5);
    expect(polygon.center.lng).toBeCloseTo(-4.5);
    expect(polygon.zoom).toBeLessThanOrEqual(11);
  });
});

describe("polygonToInmovillaFields", () => {
  it("genera los campos correctos para guardar.php", () => {
    const polygon: GeoPolygon = {
      vertices: [
        { lat: 37.88, lng: -4.79 },
        { lat: 37.89, lng: -4.79 },
        { lat: 37.89, lng: -4.77 },
        { lat: 37.88, lng: -4.77 },
      ],
      center: { lat: 37.885, lng: -4.78 },
      zoom: 15,
    };

    const fields = polygonToInmovillaFields(polygon);

    expect(fields["selpoli-selpoli"]).toContain(";");
    expect(fields["selpoli-selpoli"]).toBe(fields.poli);
    expect(fields["demandas-centrolatitud"]).toBe("37.885");
    expect(fields["demandas-centroaltitud"]).toBe("-4.78");
    expect(fields["demandas-zoom"]).toBe("15");
    expect(fields["demandas-porarea"]).toBe("1");
  });
});
