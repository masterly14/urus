import { describe, expect, it } from "vitest";
import {
  extractDireccionFromRaw,
  resolveOperationType,
  extractPropertyDataFromRaw,
} from "../utils";

describe("extractDireccionFromRaw", () => {
  const baseProperty = { ciudad: "Madrid", zona: "Chamberí" };

  it("builds full address from calle, numero, cp, zona, ciudad", () => {
    const raw = { calle: "Flamencos", numero: "8", cp: "28003" };
    const result = extractDireccionFromRaw(raw, baseProperty);
    expect(result).toBe("Calle Flamencos, 8, Chamberí, Madrid, 28003");
  });

  it("handles missing numero", () => {
    const raw = { calle: "Flamencos", cp: "28003" };
    const result = extractDireccionFromRaw(raw, baseProperty);
    expect(result).toBe("Calle Flamencos, Chamberí, Madrid, 28003");
  });

  it("handles empty raw — falls back to zona, ciudad only", () => {
    const result = extractDireccionFromRaw({}, baseProperty);
    expect(result).toBe("Chamberí, Madrid");
  });

  it("handles null/undefined values in raw", () => {
    const raw = { calle: null, numero: undefined, cp: "" };
    const result = extractDireccionFromRaw(
      raw as unknown as Record<string, unknown>,
      baseProperty,
    );
    expect(result).toBe("Chamberí, Madrid");
  });
});

describe("resolveOperationType", () => {
  it("returns VENTA for 'Venta'", () => {
    expect(resolveOperationType("Venta")).toBe("VENTA");
  });

  it("returns ALQUILER for 'Alquiler'", () => {
    expect(resolveOperationType("Alquiler")).toBe("ALQUILER");
  });

  it("returns VENTA for 'Venta y Alquiler' (mixed)", () => {
    expect(resolveOperationType("Venta y Alquiler")).toBe("VENTA");
  });

  it("returns VENTA for empty string", () => {
    expect(resolveOperationType("")).toBe("VENTA");
  });

  it("is case-insensitive", () => {
    expect(resolveOperationType("ALQUILER")).toBe("ALQUILER");
    expect(resolveOperationType("alquiler")).toBe("ALQUILER");
    expect(resolveOperationType("VENTA")).toBe("VENTA");
  });
});

describe("extractPropertyDataFromRaw (deprecated, backward compat)", () => {
  const baseProperty = { ciudad: "Madrid", zona: "Centro" };

  it("returns 0 price when raw lacks precioinmo/precioalq", () => {
    const result = extractPropertyDataFromRaw({}, baseProperty);
    expect(result.precio).toBe(0);
    expect(result.tipoOperacion).toBe("VENTA");
  });

  it("returns precioinmo for VENTA", () => {
    const raw = { precioinmo: 250000, precioalq: 0 };
    const result = extractPropertyDataFromRaw(raw, baseProperty);
    expect(result.precio).toBe(250000);
    expect(result.tipoOperacion).toBe("VENTA");
  });

  it("returns precioalq for ALQUILER", () => {
    const raw = { precioinmo: 0, precioalq: 900 };
    const result = extractPropertyDataFromRaw(raw, baseProperty);
    expect(result.precio).toBe(900);
    expect(result.tipoOperacion).toBe("ALQUILER");
  });
});
