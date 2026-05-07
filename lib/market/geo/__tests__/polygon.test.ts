import { describe, expect, it } from "vitest";
import {
  pointInPolygon,
  polygonBbox,
  validatePolygon,
  type Polygon,
} from "../polygon";

// Cuadrado simple alrededor de Cordoba centro:
//   SW (-4.79, 37.87)  -> SE (-4.77, 37.87)
//   NW (-4.79, 37.89)  -> NE (-4.77, 37.89)
const CORDOBA_SQUARE: Polygon = [
  [-4.79, 37.87],
  [-4.77, 37.87],
  [-4.77, 37.89],
  [-4.79, 37.89],
];

describe("polygonBbox", () => {
  it("devuelve los extremos del cuadrado", () => {
    const bbox = polygonBbox(CORDOBA_SQUARE);
    expect(bbox).toEqual({
      minLng: -4.79,
      minLat: 37.87,
      maxLng: -4.77,
      maxLat: 37.89,
    });
  });

  it("devuelve null para poligono vacio", () => {
    expect(polygonBbox([])).toBeNull();
  });
});

describe("pointInPolygon", () => {
  it("punto interior (centro del cuadrado)", () => {
    expect(pointInPolygon([-4.78, 37.88], CORDOBA_SQUARE)).toBe(true);
  });

  it("punto exterior (norte)", () => {
    expect(pointInPolygon([-4.78, 37.95], CORDOBA_SQUARE)).toBe(false);
  });

  it("punto exterior (sur)", () => {
    expect(pointInPolygon([-4.78, 37.85], CORDOBA_SQUARE)).toBe(false);
  });

  it("punto exterior (este)", () => {
    expect(pointInPolygon([-4.5, 37.88], CORDOBA_SQUARE)).toBe(false);
  });

  it("poligono con menos de 3 puntos siempre fuera", () => {
    expect(
      pointInPolygon([0, 0], [
        [0, 0],
        [1, 0],
      ]),
    ).toBe(false);
  });
});

describe("validatePolygon", () => {
  it("acepta poligono valido en Cordoba", () => {
    const result = validatePolygon(CORDOBA_SQUARE, { restrictToSpain: true });
    expect(result.valid).toBe(true);
  });

  it("rechaza con < 3 puntos", () => {
    const result = validatePolygon([
      [0, 0],
      [1, 1],
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/al menos 3/);
  });

  it("rechaza coordenadas fuera de rango global", () => {
    const result = validatePolygon([
      [200, 0],
      [-4.78, 37.88],
      [-4.77, 37.89],
    ]);
    expect(result.valid).toBe(false);
  });

  it("rechaza coords fuera de iberica con restrictToSpain", () => {
    const result = validatePolygon(
      [
        [-4.78, 37.88],
        [-4.77, 37.88],
        [-100, 50],
      ],
      { restrictToSpain: true },
    );
    expect(result.valid).toBe(false);
  });
});
