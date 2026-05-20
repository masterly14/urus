import { describe, expect, it } from "vitest";
import {
  costTypeFromBucket,
  defaultCostType,
  defaultExpenseBucket,
} from "../category-cost-type";

describe("category-cost-type mapping", () => {
  it("mapea categorías a bucket por defecto", () => {
    expect(defaultExpenseBucket("alquiler")).toBe("FACTURA");
    expect(defaultExpenseBucket("servicios_profesionales")).toBe("FACTURA");
    expect(defaultExpenseBucket("software")).toBe("SUSCRIPCION");
    expect(defaultExpenseBucket("transporte")).toBe("GASTO_VARIABLE");
  });

  it("deriva costType desde bucket", () => {
    expect(costTypeFromBucket("FACTURA")).toBe("FIJO");
    expect(costTypeFromBucket("SUSCRIPCION")).toBe("FIJO");
    expect(costTypeFromBucket("AHORRO")).toBe("FIJO");
    expect(costTypeFromBucket("DEUDA")).toBe("FIJO");
    expect(costTypeFromBucket("GASTO_VARIABLE")).toBe("VARIABLE");
  });

  it("mantiene compatibilidad de defaultCostType", () => {
    expect(defaultCostType("alquiler")).toBe("FIJO");
    expect(defaultCostType("suministros")).toBe("FIJO");
    expect(defaultCostType("software")).toBe("FIJO");
    expect(defaultCostType("servicios_profesionales")).toBe("FIJO");
    expect(defaultCostType("transporte")).toBe("VARIABLE");
    expect(defaultCostType("marketing")).toBe("VARIABLE");
    expect(defaultCostType("otros")).toBe("VARIABLE");
  });
});
