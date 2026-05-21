import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExtract = vi.fn();
const mockBuildProfile = vi.fn();
const mockFetch = vi.fn();
const mockAnalyze = vi.fn();
const mockTrend = vi.fn();
const mockAppendEvent = vi.fn();
const mockPersist = vi.fn();
const mockGenerateRecommendation = vi.fn();
const mockDemographics = vi.fn();
const mockZoneStudy = vi.fn();

vi.mock("@/lib/pricing/extract-property", () => ({
  extractPropertyForPricing: (...args: unknown[]) => mockExtract(...args),
}));

vi.mock("@/lib/market-zones/property-comparability-profile", () => ({
  buildPropertyComparabilityProfile: (...args: unknown[]) => mockBuildProfile(...args),
}));

vi.mock("@/lib/pricing/fetch-comparables", () => ({
  fetchPricingComparables: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock("@/lib/pricing/analyze-cluster", () => ({
  analyzeCluster: (...args: unknown[]) => mockAnalyze(...args),
}));

vi.mock("@/lib/pricing/trend-summary", () => ({
  buildPricingTrendSummary: (...args: unknown[]) => mockTrend(...args),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/pricing/report-repo", () => ({
  persistPricingReport: (...args: unknown[]) => mockPersist(...args),
}));

vi.mock("@/lib/agents/pricing-recommendation-graph", () => ({
  generatePricingRecommendation: (...args: unknown[]) => mockGenerateRecommendation(...args),
}));

vi.mock("@/lib/market/demographics", () => ({
  buildDemographicsSummary: (...args: unknown[]) => mockDemographics(...args),
}));

vi.mock("@/lib/market/accessibility", () => ({
  buildZoneStudySummary: (...args: unknown[]) => mockZoneStudy(...args),
}));

import { runPricingAnalysis } from "@/lib/pricing";

beforeEach(() => {
  vi.clearAllMocks();
  mockExtract.mockResolvedValue({
    propertyCode: "P-1",
    precio: 100000,
    precioM2: 2000,
    metrosConstruidos: 50,
    habitaciones: 2,
    banyos: 1,
    ciudad: "Córdoba",
    zona: "Centro",
    zonaRaw: "Centro",
    keyLoca: 224499,
    keyZona: 1901999,
    tipologiaNombre: "Piso",
    keyTipo: 3,
    tipoOperacion: "sale",
    estado: "Disponible",
    fechaAlta: "2026-01-01",
    fechaActualizacion: "2026-01-10",
    latitud: null,
    longitud: null,
    extras: {
      terraza: false,
      garaje: false,
      ascensor: false,
      trastero: false,
      piscina: false,
      aireAcondicionado: false,
      calefaccion: null,
      anoConstruccion: null,
      certificadoEnergetico: null,
    },
  });
  mockBuildProfile.mockResolvedValue({
    propertyCode: "P-1",
    catalogVersion: "v1.1",
    resolutionMethod: "key_zona",
    confidenceLevel: "high",
    confidenceFlags: [],
    zoneRaw: "Centro",
    zoneCode: "COR-IMV-1901999",
    zoneNameCanonical: "Centro",
    keyLoca: 224499,
    keyZona: 1901999,
    macroArea: "Centro",
    marketSegment: "medio_alto",
    qualityProfile: "medio",
    pricingProfileStatus: "ready",
    coverageStatus: "validated",
    comparableRadiusMode: "zone_plus_mirrors",
    allowedZoneCodes: ["COR-IMV-1901999"],
    excludedZoneCodes: [],
    comparableRelations: [],
    excludedRelations: [],
    priceBandM2Min: 2000,
    priceBandM2Max: 2600,
    builtAt: new Date().toISOString(),
  });
  mockFetch.mockResolvedValue({
    comparables: [],
    totalResultsFromAPI: 0,
    pagesScanned: 1,
    comparabilityMeta: {
      comparabilityFilterApplied: true,
      effectiveAllowedZoneCodes: ["COR-IMV-1901999"],
      effectiveExcludedZoneCodes: [],
      candidatesBeforeFilter: 0,
      candidatesAfterFilter: 0,
      excludedByReason: {},
      comparableDecisions: [],
    },
  });
  mockAnalyze.mockReturnValue({
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
  });
  mockTrend.mockReturnValue({
    propertyAgeDays: null,
    lastUpdatedDays: null,
    comparableAverageDaysPublished: null,
    comparableMedianDaysPublished: null,
    freshComparablesShare: null,
    staleComparablesShare: null,
    marketTempo: "sin_datos",
    listingMomentum: "sin_datos",
    pressure: "sin_datos",
    summary: "Sin datos",
  });
  mockAppendEvent
    .mockResolvedValueOnce({ id: "evt-1" })
    .mockResolvedValueOnce({ id: "evt-2" });
  mockDemographics.mockResolvedValue({
    available: false,
    city: "Córdoba",
    districtCode: null,
    districtName: null,
    zoneCode: "COR-IMV-1901999",
    zoneName: "Centro",
    population: null,
    surfaceKm2: null,
    densityPerKm2: null,
    densityBucket: "sin_datos",
    year: null,
    source: null,
  });
  mockZoneStudy.mockResolvedValue({
    transportSummary: { totalStops: 0, topStops: [] },
    schoolsSummary: { totalSchools: 0, topSchools: [], avgSchoolRating: null },
    travelTimeSummary: { byMode: [], accessibilityScore: null },
  });
  mockGenerateRecommendation.mockResolvedValue({
    accion: "MANTENER",
    diagnostico: "ok",
    recomendaciones: [],
    precioSugeridoMin: null,
    precioSugeridoMax: null,
    confidence: 0.6,
  });
});

describe("runPricingAnalysis comparability integration", () => {
  it("incluye comparabilityProfile en resultado y persistencia", async () => {
    const result = await runPricingAnalysis("P-1", { generateRecommendation: false });
    expect(mockBuildProfile).toHaveBeenCalledTimes(1);
    expect(result.comparabilityProfile?.zoneCode).toBe("COR-IMV-1901999");
    expect(mockPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          comparabilityProfile: expect.objectContaining({
            zoneCode: "COR-IMV-1901999",
          }),
        }),
      }),
    );
  });
});
