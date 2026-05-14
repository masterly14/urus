import { describe, expect, it } from "vitest";
import {
  buildIdealistaAreaUrl,
  encodeIdealistaShape,
  encodePolyline,
} from "../polyline";

describe("encodePolyline", () => {
  it("codifica el ejemplo canonico de Google docs", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const result = encodePolyline([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
    expect(result).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("codifica un punto unico (deltas iniciales = absolutos)", () => {
    const result = encodePolyline([[38.5, -120.2]]);
    expect(result).toBe("_p~iF~ps|U");
  });

  it("punto en el origen genera caracter base 63 ('?')", () => {
    const result = encodePolyline([[0, 0]]);
    expect(result).toBe("??");
  });
});

describe("encodeIdealistaShape", () => {
  it("acepta poligono no cerrado y lo cierra automaticamente", () => {
    const a = encodeIdealistaShape([
      [-4.78, 37.88],
      [-4.77, 37.88],
      [-4.77, 37.89],
      [-4.78, 37.89],
    ]);
    const b = encodeIdealistaShape([
      [-4.78, 37.88],
      [-4.77, 37.88],
      [-4.77, 37.89],
      [-4.78, 37.89],
      [-4.78, 37.88],
    ]);
    expect(a).toBe(b);
  });

  it("base64 url-safe (sin '+' '/' '=')", () => {
    const out = encodeIdealistaShape([
      [-4.78, 37.88],
      [-4.77, 37.88],
      [-4.77, 37.89],
    ]);
    expect(out).not.toMatch(/[+/=]/);
  });

  it("rechaza poligono con menos de 3 puntos", () => {
    expect(() =>
      encodeIdealistaShape([
        [-4.78, 37.88],
        [-4.77, 37.88],
      ]),
    ).toThrow(/al menos 3/);
  });
});

describe("buildIdealistaAreaUrl", () => {
  it("incluye operacion sale -> venta-viviendas y housing path", () => {
    const url = buildIdealistaAreaUrl({
      operation: "sale",
      housingPath: "con-pisos",
      polygonLngLat: [
        [-4.78, 37.88],
        [-4.77, 37.88],
        [-4.77, 37.89],
      ],
    });
    expect(url).toMatch(/^https:\/\/www\.idealista\.com\/areas\/venta-viviendas\/con-pisos\/\?shape=/);
  });

  it("operacion rent -> alquiler-viviendas", () => {
    const url = buildIdealistaAreaUrl({
      operation: "rent",
      polygonLngLat: [
        [-4.78, 37.88],
        [-4.77, 37.88],
        [-4.77, 37.89],
      ],
    });
    expect(url).toMatch(/\/areas\/alquiler-viviendas\/\?shape=/);
  });

  it("misma entrada -> misma URL (deterministico)", () => {
    const args = {
      operation: "sale" as const,
      polygonLngLat: [
        [-4.78, 37.88],
        [-4.77, 37.88],
        [-4.77, 37.89],
      ] as Array<[number, number]>,
    };
    expect(buildIdealistaAreaUrl(args)).toBe(buildIdealistaAreaUrl(args));
  });
});
