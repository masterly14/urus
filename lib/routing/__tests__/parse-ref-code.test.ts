import { describe, expect, it } from "vitest";
import {
  extractRefCode,
  getOperationTypeFromRef,
  isValidRefFormat,
  normalizeRef,
} from "@/lib/routing/parse-ref-code";

describe("parse-ref-code", () => {
  it("extrae iniciales y operación del patrón estándar", () => {
    expect(normalizeRef(" urus09vfede ")).toBe("URUS09VFEDE");
    expect(isValidRefFormat("URUS09VFEDE")).toBe(true);
    expect(extractRefCode("URUS09VFEDE")).toBe("FEDE");
    expect(getOperationTypeFromRef("URUS09VFEDE")).toBe("VENTA");
  });

  it("extrae operación de alquiler del patrón estándar", () => {
    expect(isValidRefFormat("URUS08AJP")).toBe(true);
    expect(extractRefCode("URUS08AJP")).toBe("JP");
    expect(getOperationTypeFromRef("URUS08AJP")).toBe("ALQUILER");
  });

  it("mantiene compatibilidad con la variante Inmovilla", () => {
    expect(isValidRefFormat("URUSV57MA")).toBe(true);
    expect(extractRefCode("URUSV57MA")).toBe("MA");
    expect(getOperationTypeFromRef("URUSV57MA")).toBe("VENTA");
  });

  it("rechaza referencias que no encajan con el contrato URUS", () => {
    for (const ref of ["", "ABC123", "URUS", "URUS09XFEDE", "URUSV"]) {
      expect(isValidRefFormat(ref)).toBe(false);
      expect(extractRefCode(ref)).toBeNull();
      expect(getOperationTypeFromRef(ref)).toBeNull();
    }
  });
});
