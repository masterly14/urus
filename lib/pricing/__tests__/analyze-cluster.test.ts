import { describe, it, expect } from "vitest";
import { analyzeCluster } from "@/lib/pricing/analyze-cluster";
import type { PricingPropertyInput, PricingComparable } from "@/lib/pricing/types";

function makeInput(overrides?: Partial<PricingPropertyInput>): PricingPropertyInput {
  return {
    propertyCode: "TEST-001",
    precio: 200000,
    precioM2: 2000,
    metrosConstruidos: 100,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Murcia",
    zona: "Centro",
    tipologiaNombre: "Piso",
    keyTipo: 3,
    tipoOperacion: "sale",
    estado: "Disponible",
    fechaAlta: "2026-01-01",
    fechaActualizacion: "2026-03-01",
    extras: {
      terraza: false,
      garaje: false,
      ascensor: true,
      trastero: false,
      piscina: false,
      aireAcondicionado: true,
      calefaccion: null,
      anoConstruccion: null,
      certificadoEnergetico: null,
    },
    ...overrides,
  };
}

function makeComparable(overrides?: Partial<PricingComparable>): PricingComparable {
  return {
    statefoxId: "id.es.s.12345",
    precio: 190000,
    precioM2: 1900,
    metrosConstruidos: 100,
    habitaciones: 3,
    banyos: 2,
    ciudad: "Murcia",
    zona: "Centro",
    tipologia: "flat",
    advertiserType: "professional",
    extras: {},
    link: null,
    diasPublicado: 30,
    ...overrides,
  };
}

describe("analyzeCluster", () => {
  it("devuelve sin_datos si no hay comparables", () => {
    const stats = analyzeCluster(makeInput(), []);
    expect(stats.totalComparables).toBe(0);
    expect(stats.precioMedioM2).toBe(0);
    expect(stats.semaforo).toBe("sin_datos");
  });

  it("calcula media y mediana correctamente", () => {
    const comparables = [
      makeComparable({ precioM2: 1800 }),
      makeComparable({ precioM2: 1900 }),
      makeComparable({ precioM2: 2000 }),
      makeComparable({ precioM2: 2100 }),
      makeComparable({ precioM2: 2200 }),
    ];

    const stats = analyzeCluster(makeInput({ precioM2: 2000 }), comparables);

    expect(stats.totalComparables).toBe(5);
    expect(stats.precioMedioM2).toBe(2000);
    expect(stats.precioMedianaM2).toBe(2000);
    expect(stats.precioMinM2).toBe(1800);
    expect(stats.precioMaxM2).toBe(2200);
  });

  it("asigna semáforo VERDE cuando gap ≤ 5%", () => {
    const comparables = [
      makeComparable({ precioM2: 1950 }),
      makeComparable({ precioM2: 2000 }),
      makeComparable({ precioM2: 2050 }),
    ];

    const stats = analyzeCluster(makeInput({ precioM2: 2000 }), comparables);
    expect(stats.semaforo).toBe("verde");
    expect(Math.abs(stats.gapPorcentaje)).toBeLessThanOrEqual(5);
  });

  it("asigna semáforo AMARILLO cuando gap entre 5% y 12%", () => {
    const comparables = [
      makeComparable({ precioM2: 1800 }),
      makeComparable({ precioM2: 1800 }),
      makeComparable({ precioM2: 1800 }),
    ];

    const stats = analyzeCluster(makeInput({ precioM2: 2000 }), comparables);
    expect(stats.semaforo).toBe("amarillo");
    expect(Math.abs(stats.gapPorcentaje)).toBeGreaterThan(5);
    expect(Math.abs(stats.gapPorcentaje)).toBeLessThanOrEqual(12);
  });

  it("asigna semáforo ROJO cuando gap > 12%", () => {
    const comparables = [
      makeComparable({ precioM2: 1500 }),
      makeComparable({ precioM2: 1500 }),
      makeComparable({ precioM2: 1500 }),
    ];

    const stats = analyzeCluster(makeInput({ precioM2: 2000 }), comparables);
    expect(stats.semaforo).toBe("rojo");
    expect(Math.abs(stats.gapPorcentaje)).toBeGreaterThan(12);
  });

  it("segmenta por tipo de anunciante (particular vs profesional)", () => {
    const comparables = [
      makeComparable({ precioM2: 1800, advertiserType: "private" }),
      makeComparable({ precioM2: 1900, advertiserType: "private" }),
      makeComparable({ precioM2: 2100, advertiserType: "professional" }),
      makeComparable({ precioM2: 2200, advertiserType: "professional" }),
    ];

    const stats = analyzeCluster(makeInput(), comparables);

    expect(stats.precioMedioM2Particular).toBe(1850);
    expect(stats.precioMedioM2Profesional).toBe(2150);
  });

  it("devuelve null para segmentos sin datos", () => {
    const comparables = [
      makeComparable({ precioM2: 2000, advertiserType: "professional" }),
    ];

    const stats = analyzeCluster(makeInput(), comparables);
    expect(stats.precioMedioM2Particular).toBeNull();
    expect(stats.precioMedioM2Profesional).toBe(2000);
  });

  it("calcula desviación estándar > 0 con datos variados", () => {
    const comparables = [
      makeComparable({ precioM2: 1500 }),
      makeComparable({ precioM2: 2000 }),
      makeComparable({ precioM2: 2500 }),
    ];

    const stats = analyzeCluster(makeInput(), comparables);
    expect(stats.desviacionEstandar).toBeGreaterThan(0);
  });

  it("gap positivo indica que el inmueble está por encima del mercado", () => {
    const comparables = [
      makeComparable({ precioM2: 1500 }),
      makeComparable({ precioM2: 1500 }),
    ];

    const stats = analyzeCluster(makeInput({ precioM2: 2000 }), comparables);
    expect(stats.gapPorcentaje).toBeGreaterThan(0);
  });

  it("gap negativo indica que el inmueble está por debajo del mercado", () => {
    const comparables = [
      makeComparable({ precioM2: 2500 }),
      makeComparable({ precioM2: 2500 }),
    ];

    const stats = analyzeCluster(makeInput({ precioM2: 2000 }), comparables);
    expect(stats.gapPorcentaje).toBeLessThan(0);
  });
});
