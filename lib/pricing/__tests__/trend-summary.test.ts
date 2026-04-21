import { describe, expect, it } from "vitest";
import { buildPricingTrendSummary } from "@/lib/pricing/trend-summary";
import type { PricingAnalysisResult } from "@/lib/pricing/types";

function makeAnalysis(
  overrides?: Partial<PricingAnalysisResult>,
): PricingAnalysisResult {
  return {
    propertyCode: "PROP-001",
    input: {
      propertyCode: "PROP-001",
      precio: 300000,
      precioM2: 3000,
      metrosConstruidos: 100,
      habitaciones: 3,
      banyos: 2,
      ciudad: "Murcia",
      zona: "Centro",
      tipologiaNombre: "Piso",
      keyTipo: 1,
      tipoOperacion: "sale",
      estado: "Disponible",
      fechaAlta: "2026-01-01",
      fechaActualizacion: "2026-03-25",
      extras: {
        terraza: true,
        garaje: false,
        ascensor: true,
        trastero: false,
        piscina: false,
        aireAcondicionado: true,
        calefaccion: null,
        anoConstruccion: null,
        certificadoEnergetico: null,
      },
    },
    comparables: [
      {
        statefoxId: "c-1",
        precio: 280000,
        precioM2: 2800,
        metrosConstruidos: 100,
        habitaciones: 3,
        banyos: 2,
        ciudad: "Murcia",
        zona: "Centro",
        tipologia: "flat",
        advertiserType: "professional",
        extras: {},
        link: null,
        diasPublicado: 8,
        descripcion: null,
        direccion: null,
        fotos: [],
        anunciante: { nombre: null, tipo: "professional", telefonos: [] },
        latitud: null,
        longitud: null,
        planta: null,
        orientacion: null,
        referencia: null,
      },
      {
        statefoxId: "c-2",
        precio: 270000,
        precioM2: 2700,
        metrosConstruidos: 100,
        habitaciones: 3,
        banyos: 2,
        ciudad: "Murcia",
        zona: "Centro",
        tipologia: "flat",
        advertiserType: "private",
        extras: {},
        link: null,
        diasPublicado: 18,
        descripcion: null,
        direccion: null,
        fotos: [],
        anunciante: { nombre: null, tipo: "private", telefonos: [] },
        latitud: null,
        longitud: null,
        planta: null,
        orientacion: null,
        referencia: null,
      },
      {
        statefoxId: "c-3",
        precio: 260000,
        precioM2: 2600,
        metrosConstruidos: 100,
        habitaciones: 3,
        banyos: 2,
        ciudad: "Murcia",
        zona: "Centro",
        tipologia: "flat",
        advertiserType: "private",
        extras: {},
        link: null,
        diasPublicado: 52,
        descripcion: null,
        direccion: null,
        fotos: [],
        anunciante: { nombre: null, tipo: "private", telefonos: [] },
        latitud: null,
        longitud: null,
        planta: null,
        orientacion: null,
        referencia: null,
      },
    ],
    stats: {
      totalComparables: 3,
      precioMedioM2: 2700,
      precioMedianaM2: 2700,
      precioMinM2: 2600,
      precioMaxM2: 2800,
      desviacionEstandar: 81.65,
      precioMedioM2Particular: 2650,
      precioMedioM2Profesional: 2800,
      gapPorcentaje: 11.11,
      semaforo: "amarillo",
    },
    analyzedAt: "2026-04-08T10:00:00.000Z",
    queryMeta: {
      endpoint: "snapshot",
      housing: "flat",
      type: "sale",
      pagesScanned: 4,
      totalResultsFromAPI: 750,
      filteredResults: 3,
    },
    ...overrides,
  };
}

describe("buildPricingTrendSummary", () => {
  it("resume la presión temporal con señales de inmueble y comparables", () => {
    const analysis = makeAnalysis();

    const trend = buildPricingTrendSummary(
      {
        input: analysis.input,
        comparables: analysis.comparables,
        stats: analysis.stats,
      },
      new Date("2026-04-08T00:00:00.000Z"),
    );

    expect(trend.propertyAgeDays).toBe(97);
    expect(trend.lastUpdatedDays).toBe(14);
    expect(trend.comparableAverageDaysPublished).toBe(26);
    expect(trend.comparableMedianDaysPublished).toBe(18);
    expect(trend.freshComparablesShare).toBe(0.33);
    expect(trend.staleComparablesShare).toBe(0.33);
    expect(trend.marketTempo).toBe("estable");
    expect(trend.listingMomentum).toBe("estancado");
    expect(trend.pressure).toBe("alta");
    expect(trend.summary).toContain("presión temporal actual es alta");
  });

  it("degrada a sin_datos cuando no hay comparables con señal temporal", () => {
    const analysis = makeAnalysis({
      comparables: [],
      stats: {
        totalComparables: 0,
        precioMedioM2: 0,
        precioMedianaM2: 0,
        precioMinM2: 0,
        precioMaxM2: 0,
        desviacionEstandar: 0,
        precioMedioM2Particular: null,
        precioMedioM2Profesional: null,
        gapPorcentaje: 0,
        semaforo: "sin_datos",
      },
    });

    const trend = buildPricingTrendSummary(
      {
        input: analysis.input,
        comparables: analysis.comparables,
        stats: analysis.stats,
      },
      new Date("2026-04-08T00:00:00.000Z"),
    );

    expect(trend.marketTempo).toBe("sin_datos");
    expect(trend.pressure).toBe("sin_datos");
    expect(trend.comparableAverageDaysPublished).toBeNull();
    expect(trend.freshComparablesShare).toBeNull();
  });
});
