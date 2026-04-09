import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricingRecommendationSchema } from "@/lib/pricing/recommendation-types";
import type { PricingRecommendation } from "@/lib/pricing/recommendation-types";
import type { PricingAnalysisResult } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAnalysisResult(
  overrides?: Partial<PricingAnalysisResult>,
): PricingAnalysisResult {
  return {
    propertyCode: "TEST-001",
    input: {
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
      fechaAlta: "2026-02-01",
      fechaActualizacion: "2026-04-01",
      extras: {
        terraza: true,
        garaje: false,
        ascensor: true,
        trastero: false,
        piscina: false,
        aireAcondicionado: true,
        calefaccion: null,
        anoConstruccion: "2005",
        certificadoEnergetico: "D",
      },
    },
    comparables: [
      {
        statefoxId: "id.es.s.100",
        precio: 185000,
        precioM2: 1850,
        metrosConstruidos: 100,
        habitaciones: 3,
        banyos: 2,
        ciudad: "Murcia",
        zona: "Centro",
        tipologia: "flat",
        advertiserType: "professional",
        extras: { terraza: true },
        link: null,
        diasPublicado: 20,
      },
      {
        statefoxId: "id.es.s.101",
        precio: 195000,
        precioM2: 1950,
        metrosConstruidos: 100,
        habitaciones: 3,
        banyos: 2,
        ciudad: "Murcia",
        zona: "Centro",
        tipologia: "flat",
        advertiserType: "private",
        extras: {},
        link: null,
        diasPublicado: 35,
      },
    ],
    stats: {
      totalComparables: 2,
      precioMedioM2: 1900,
      precioMedianaM2: 1900,
      precioMinM2: 1850,
      precioMaxM2: 1950,
      desviacionEstandar: 50,
      precioMedioM2Particular: 1950,
      precioMedioM2Profesional: 1850,
      gapPorcentaje: 5.26,
      semaforo: "amarillo",
    },
    analyzedAt: new Date().toISOString(),
    trend: {
      propertyAgeDays: 68,
      lastUpdatedDays: 7,
      comparableAverageDaysPublished: 27.5,
      comparableMedianDaysPublished: 27.5,
      freshComparablesShare: 0,
      staleComparablesShare: 0,
      marketTempo: "estable",
      listingMomentum: "estancado",
      pressure: "media",
      summary:
        "El inmueble lleva 68 días en cartera; la ficha se actualizó hace 7 días. El mercado va estable (media 27.5 días publicados en comparables). 0% de comparables son recientes y 0% llevan mucho tiempo publicados. La presión temporal actual es media.",
    },
    queryMeta: {
      endpoint: "snapshot",
      housing: "flat",
      type: "sale",
      pagesScanned: 5,
      totalResultsFromAPI: 120,
      filteredResults: 2,
    },
    ...overrides,
  };
}

function makeValidRecommendation(
  overrides?: Partial<PricingRecommendation>,
): PricingRecommendation {
  return {
    accion: "ajustar_precio",
    diagnostico:
      "El inmueble está un +5.26% por encima del precio medio del cluster (1.900 €/m², 2 comparables).",
    recomendaciones: [
      "Reducir el precio un 3-5% para alinearse con la media del cluster.",
      "Invertir en fotografía profesional para mejorar visibilidad en portales.",
    ],
    precioSugeridoMin: 190000,
    precioSugeridoMax: 195000,
    argumentosComerciales: [
      "Terraza disponible, no todos los comparables la tienen.",
      "Ascensor y aire acondicionado incluidos.",
    ],
    riesgos: [
      "Con un gap del 5.26%, el inmueble pierde visibilidad frente a comparables mejor posicionados.",
    ],
    confidence: 0.85,
    reasoning: "Gap amarillo con datos suficientes para recomendar ajuste ligero.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests del schema Zod
// ---------------------------------------------------------------------------

describe("PricingRecommendationSchema", () => {
  it("valida una recomendación completa correctamente", () => {
    const rec = makeValidRecommendation();
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(true);
  });

  it("valida con precioSugerido null (acción mantener)", () => {
    const rec = makeValidRecommendation({
      accion: "mantener",
      precioSugeridoMin: null,
      precioSugeridoMax: null,
    });
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(true);
  });

  it("valida con arrays vacíos de argumentos y riesgos", () => {
    const rec = makeValidRecommendation({
      argumentosComerciales: [],
      riesgos: [],
    });
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(true);
  });

  it("rechaza acción inválida", () => {
    const rec = { ...makeValidRecommendation(), accion: "eliminar" };
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza recomendaciones vacías (min 1)", () => {
    const rec = makeValidRecommendation({ recomendaciones: [] });
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza más de 5 recomendaciones", () => {
    const rec = makeValidRecommendation({
      recomendaciones: ["a", "b", "c", "d", "e", "f"],
    });
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza confidence fuera de rango", () => {
    const rec = makeValidRecommendation({ confidence: 1.5 });
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza confidence negativa", () => {
    const rec = makeValidRecommendation({ confidence: -0.1 });
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza si falta el campo diagnostico", () => {
    const { diagnostico: _, ...rec } = makeValidRecommendation();
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza si falta el campo reasoning", () => {
    const { reasoning: _, ...rec } = makeValidRecommendation();
    const result = PricingRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests del fallback sin_datos
// ---------------------------------------------------------------------------

describe("generatePricingRecommendation — fallback sin_datos", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("retorna recomendación fallback sin invocar LLM cuando semáforo es sin_datos", async () => {
    const llmInvokeMock = vi.fn();

    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({ invoke: llmInvokeMock }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({ invoke: llmInvokeMock }),
      },
    }));

    const { generatePricingRecommendation } = await import(
      "@/lib/agents/pricing-recommendation-graph"
    );

    const analysis = makeAnalysisResult({
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

    const recommendation = await generatePricingRecommendation(analysis);

    expect(llmInvokeMock).not.toHaveBeenCalled();
    expect(recommendation.accion).toBe("mantener");
    expect(recommendation.confidence).toBeLessThan(0.5);
    expect(recommendation.diagnostico).toContain("No se encontraron comparables");

    const validation = PricingRecommendationSchema.safeParse(recommendation);
    expect(validation.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests de integración con LLM mockeado
// ---------------------------------------------------------------------------

describe("generatePricingRecommendation — integración mock", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("produce una recomendación válida con LLM mockeado", async () => {
    const mockLLMResponse: PricingRecommendation = makeValidRecommendation();

    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockResolvedValue(mockLLMResponse),
        }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockResolvedValue(mockLLMResponse),
        }),
      },
    }));

    const { generatePricingRecommendation } = await import(
      "@/lib/agents/pricing-recommendation-graph"
    );

    const analysis = makeAnalysisResult();
    const recommendation = await generatePricingRecommendation(analysis);

    expect(recommendation.accion).toBe("ajustar_precio");
    expect(recommendation.diagnostico).toBeTruthy();
    expect(recommendation.recomendaciones.length).toBeGreaterThanOrEqual(1);
    expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
    expect(recommendation.confidence).toBeLessThanOrEqual(1);

    const validation = PricingRecommendationSchema.safeParse(recommendation);
    expect(validation.success).toBe(true);
  });

  it("lanza error si el LLM falla", async () => {
    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockRejectedValue(new Error("OpenAI rate limit")),
        }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockRejectedValue(new Error("OpenAI rate limit")),
        }),
      },
    }));

    const { generatePricingRecommendation } = await import(
      "@/lib/agents/pricing-recommendation-graph"
    );

    const analysis = makeAnalysisResult();

    await expect(generatePricingRecommendation(analysis)).rejects.toThrow(
      "Error generando recomendación de pricing",
    );
  });
});
