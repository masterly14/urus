import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PricingPropertyInput } from "@/lib/pricing/types";
import type { GetSnapshotResponse, StatefoxSnapshotProperty } from "@/lib/statefox/types";

vi.mock("@/lib/statefox/client", () => ({
  createStatefoxClient: vi.fn(() => ({ get: vi.fn() })),
  getSnapshot: vi.fn(),
}));

vi.mock("@/lib/statefox/image-cache", () => ({
  hydrateComparablesWithImageCache: vi.fn(async (comparables: unknown) => comparables),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketZoneAlias: {
      findMany: vi.fn(),
    },
    marketZoneProfile: {
      findMany: vi.fn(),
    },
  },
}));

import { getSnapshot } from "@/lib/statefox/client";
import { prisma } from "@/lib/prisma";
import { fetchPricingComparables } from "@/lib/pricing/fetch-comparables";

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;
const mockAliasFindMany = prisma.marketZoneAlias.findMany as ReturnType<typeof vi.fn>;
const mockProfileFindMany = prisma.marketZoneProfile.findMany as ReturnType<typeof vi.fn>;

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
    zonaRaw: "Centro",
    keyLoca: 224499,
    keyZona: 1901999,
    tipologiaNombre: "Piso",
    keyTipo: 3,
    tipoOperacion: "sale",
    estado: "Disponible",
    fechaAlta: "2026-01-01",
    fechaActualizacion: "2026-03-01",
    latitud: null,
    longitud: null,
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

function makeSnapshotProp(overrides?: Partial<StatefoxSnapshotProperty>): StatefoxSnapshotProperty {
  return {
    _id: "id.es.s.12345",
    pPrice: 190000,
    pHousing: "flat",
    pStatus: "active",
    pType: "sale",
    pCity: { cityName: "Murcia", cityRegion: "Murcia" },
    pZone: { name: "Centro" },
    pMeters: { built: 100 },
    pRooms: 3,
    pBaths: 2,
    pAdvert: { type: "professional" },
    pExtras: {},
    pLink: "https://idealista.com/12345",
    pTS: { insert: Math.floor(Date.now() / 1000) - 86400 * 30 },
    ...overrides,
  };
}

function makeSnapshotResponse(
  result: Record<string, StatefoxSnapshotProperty>,
  next: string | null = null,
): GetSnapshotResponse {
  return {
    result,
    meta: { items: Object.keys(result).length, sort: "pTS.insert,DESC", next },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MARKET_PRICING_SOURCE = "statefox";
  mockAliasFindMany.mockResolvedValue([]);
  mockProfileFindMany.mockResolvedValue([]);
});

describe("fetchPricingComparables (snapshot)", () => {
  it("filtra correctamente por ciudad", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-1": makeSnapshotProp({ pCity: { cityName: "Murcia" } }),
        "id-2": makeSnapshotProp({ pCity: { cityName: "Madrid" } }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput(), { maxPages: 1 });
    expect(comparables.length).toBe(1);
    expect(comparables[0].ciudad).toBe("Murcia");
  });

  it("filtra por housing type", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-flat": makeSnapshotProp({ pHousing: "flat" }),
        "id-house": makeSnapshotProp({ pHousing: "house" }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput(), { maxPages: 1 });
    expect(comparables.length).toBe(1);
    expect(comparables[0].tipologia).toBe("flat");
  });

  it("incluye tipologias compatibles (p. ej. penthouse para Piso)", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-penthouse": makeSnapshotProp({ pHousing: "penthouse", pPrice: 195000 }),
        "id-house": makeSnapshotProp({ pHousing: "house", pPrice: 198000 }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput({ tipologiaNombre: "Piso" }), {
      maxPages: 1,
    });
    expect(comparables.length).toBe(1);
    expect(comparables[0].tipologia).toBe("penthouse");
  });

  it("filtra por rango de precio ±20%", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-ok": makeSnapshotProp({ pPrice: 220000 }),
        "id-too-high": makeSnapshotProp({ pPrice: 300000 }),
        "id-too-low": makeSnapshotProp({ pPrice: 100000 }),
      }),
    );

    const { comparables } = await fetchPricingComparables(
      makeInput({ precio: 200000 }),
      { maxPages: 1, priceRangePercent: 20 },
    );

    expect(comparables.length).toBe(1);
    expect(comparables[0].precio).toBe(220000);
  });

  it("filtra por rango de metros ±20%", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-ok": makeSnapshotProp({ pMeters: { built: 110 } }),
        "id-too-big": makeSnapshotProp({ pMeters: { built: 200 } }),
        "id-too-small": makeSnapshotProp({ pMeters: { built: 50 } }),
      }),
    );

    const { comparables } = await fetchPricingComparables(
      makeInput({ metrosConstruidos: 100 }),
      { maxPages: 1, metersRangePercent: 20 },
    );

    expect(comparables.length).toBe(1);
    expect(comparables[0].metrosConstruidos).toBe(110);
  });

  it("pagina con cursor hasta encontrar comparables", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce(
        makeSnapshotResponse(
          { "id-1": makeSnapshotProp({ pCity: { cityName: "Córdoba" } }) },
          "cursor-2",
        ),
      )
      .mockResolvedValueOnce(
        makeSnapshotResponse(
          { "id-2": makeSnapshotProp({ pCity: { cityName: "Murcia" } }) },
          null,
        ),
      );

    const { comparables, pagesScanned } = await fetchPricingComparables(makeInput(), { maxPages: 5 });

    expect(pagesScanned).toBe(2);
    expect(comparables.length).toBe(1);
    expect(comparables[0].ciudad).toBe("Murcia");
  });

  it("se detiene al alcanzar minComparables", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce(
        makeSnapshotResponse(
          {
            "id-1": makeSnapshotProp(),
            "id-2": makeSnapshotProp({ _id: "id.2", pPrice: 195000 }),
          },
          "cursor-2",
        ),
      )
      .mockResolvedValueOnce(
        makeSnapshotResponse(
          { "id-3": makeSnapshotProp({ _id: "id.3", pPrice: 210000 }) },
          "cursor-3",
        ),
      );

    const { comparables, pagesScanned } = await fetchPricingComparables(makeInput(), {
      maxPages: 10,
      minComparables: 2,
    });

    expect(comparables.length).toBe(2);
    expect(pagesScanned).toBe(1);
  });

  it("respeta maxPages", async () => {
    let callCount = 0;
    mockGetSnapshot.mockImplementation(async () => {
      callCount++;
      const prop: StatefoxSnapshotProperty = {
        _id: `snap.${callCount}`,
        pPrice: 190000,
        pHousing: "flat",
        pStatus: "active",
        pType: "sale",
        pCity: { cityName: "Zaragoza", cityRegion: "Aragón" },
        pZone: "Centro",
        pMeters: { built: 100 },
        pRooms: 3,
        pBaths: 2,
        pAdvert: { type: "professional" },
        pExtras: {},
        pLink: null,
        pTS: { insert: Math.floor(Date.now() / 1000) },
      };
      return makeSnapshotResponse(
        { [`id-zaragoza-${callCount}`]: prop },
        `cursor-${callCount + 1}`,
      );
    });

    const { pagesScanned, comparables } = await fetchPricingComparables(
      makeInput({ ciudad: "Sevilla" }),
      { maxPages: 3, minComparables: 100 },
    );

    expect(pagesScanned).toBe(3);
    expect(comparables.length).toBe(0);
  });

  it("excluye propiedades sin precio", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-no-price": makeSnapshotProp({ pPrice: 0 }),
        "id-ok": makeSnapshotProp({ pPrice: 190000 }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput(), { maxPages: 1 });
    expect(comparables.length).toBe(1);
  });

  it("calcula precioM2 desde pPrice/pMeters.built", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-1": makeSnapshotProp({ pPrice: 200000, pMeters: { built: 80 } }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput(), { maxPages: 1 });
    expect(comparables[0].precioM2).toBe(2500);
  });

  it("mapea advertiserType correctamente", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-priv": makeSnapshotProp({ pAdvert: { type: "private" } }),
        "id-pro": makeSnapshotProp({ _id: "id.2", pAdvert: { type: "professional" }, pPrice: 195000 }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput(), { maxPages: 1 });
    const types = comparables.map((c) => c.advertiserType);
    expect(types).toContain("private");
    expect(types).toContain("professional");
  });

  it("se detiene si una página falla (no hay cursor siguiente)", async () => {
    mockGetSnapshot.mockRejectedValueOnce(new Error("timeout"));

    const { comparables, pagesScanned } = await fetchPricingComparables(makeInput(), { maxPages: 3 });
    expect(pagesScanned).toBe(0);
    expect(comparables.length).toBe(0);
  });

  it("devuelve totalResultsFromAPI acumulado de varias páginas", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce(
        makeSnapshotResponse(
          {
            "id-1": makeSnapshotProp(),
            "id-2": makeSnapshotProp({ _id: "id.2", pCity: { cityName: "Madrid" } }),
          },
          "cursor-2",
        ),
      )
      .mockResolvedValueOnce(
        makeSnapshotResponse(
          { "id-3": makeSnapshotProp({ _id: "id.3", pPrice: 210000 }) },
          null,
        ),
      );

    const { totalResultsFromAPI, comparables, pagesScanned } = await fetchPricingComparables(
      makeInput(),
      { maxPages: 5, minComparables: 10 },
    );
    expect(totalResultsFromAPI).toBe(3);
    expect(pagesScanned).toBe(2);
    expect(comparables.length).toBe(2);
  });

  it("aplica filtro de comparabilidad ready con allowed + excluded", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-allow": makeSnapshotProp({ pZone: { name: "Centro" } }),
        "id-mirror": makeSnapshotProp({ _id: "id.2", pZone: { name: "Ciudad Jardín" }, pPrice: 205000 }),
        "id-excluded": makeSnapshotProp({ _id: "id.3", pZone: { name: "Levante" }, pPrice: 195000 }),
      }),
    );
    mockAliasFindMany.mockResolvedValue([
      { aliasNormalized: "centro", zoneCode: "COR-IMV-1901999" },
      { aliasNormalized: "ciudad jardin", zoneCode: "COR-IMV-1902199" },
      { aliasNormalized: "levante", zoneCode: "COR-IMV-1904399" },
    ]);
    mockProfileFindMany.mockResolvedValue([
      { suggestedZoneCode: "COR-IMV-1901999", zoneNameCanonical: "Centro" },
      { suggestedZoneCode: "COR-IMV-1902199", zoneNameCanonical: "Ciudad Jardín" },
      { suggestedZoneCode: "COR-IMV-1904399", zoneNameCanonical: "Levante" },
    ]);

    const result = await fetchPricingComparables(makeInput(), {
      maxPages: 1,
      comparabilityProfile: {
        propertyCode: "TEST-001",
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
        allowedZoneCodes: ["COR-IMV-1901999", "COR-IMV-1902199"],
        excludedZoneCodes: ["COR-IMV-1904399"],
        comparableRelations: [],
        excludedRelations: [],
        priceBandM2Min: 2000,
        priceBandM2Max: 2600,
        builtAt: new Date().toISOString(),
      },
    });

    expect(result.comparables.length).toBe(2);
    expect(result.comparabilityMeta.comparabilityFilterApplied).toBe(true);
    expect(result.comparabilityMeta.excludedByReason.ZONE_EXCLUDED_NOT_COMPARABLE).toBe(1);
  });

  it("aplica fallback conservador para not_ready", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-allow": makeSnapshotProp({ pZone: { name: "Centro" } }),
        "id-other": makeSnapshotProp({ _id: "id.2", pZone: { name: "Ciudad Jardín" }, pPrice: 205000 }),
      }),
    );
    mockAliasFindMany.mockResolvedValue([
      { aliasNormalized: "centro", zoneCode: "COR-IMV-1901999" },
      { aliasNormalized: "ciudad jardin", zoneCode: "COR-IMV-1902199" },
    ]);
    mockProfileFindMany.mockResolvedValue([
      { suggestedZoneCode: "COR-IMV-1901999", zoneNameCanonical: "Centro" },
      { suggestedZoneCode: "COR-IMV-1902199", zoneNameCanonical: "Ciudad Jardín" },
    ]);

    const result = await fetchPricingComparables(makeInput(), {
      maxPages: 1,
      comparabilityProfile: {
        propertyCode: "TEST-001",
        catalogVersion: "v1.1",
        resolutionMethod: "key_zona",
        confidenceLevel: "low",
        confidenceFlags: ["UNKNOWN_ZONE"],
        zoneRaw: "Centro",
        zoneCode: "COR-IMV-1901999",
        zoneNameCanonical: "Centro",
        keyLoca: 224499,
        keyZona: 1901999,
        macroArea: "Centro",
        marketSegment: "medio_alto",
        qualityProfile: "medio",
        pricingProfileStatus: "not_ready",
        coverageStatus: "known_unprofiled",
        comparableRadiusMode: "zone_plus_mirrors",
        allowedZoneCodes: ["COR-IMV-1901999", "COR-IMV-1902199"],
        excludedZoneCodes: [],
        comparableRelations: [],
        excludedRelations: [],
        priceBandM2Min: 2000,
        priceBandM2Max: 2600,
        builtAt: new Date().toISOString(),
      },
    });

    expect(result.comparables.length).toBe(1);
    expect(result.comparables[0].zona).toBe("Centro");
    expect(result.comparabilityMeta.excludedByReason.ZONE_UNKNOWN_FALLBACK).toBe(1);
  });

  it("incluye candidatos sin zona resuelta en path Statefox (comparabilidad relajada)", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-known": makeSnapshotProp({ pZone: { name: "Centro" } }),
        "id-unknown": makeSnapshotProp({
          _id: "id.2",
          pZone: "",
          pPrice: 205000,
        }),
      }),
    );
    mockAliasFindMany.mockResolvedValue([
      { aliasNormalized: "centro", zoneCode: "COR-IMV-1901999" },
    ]);
    mockProfileFindMany.mockResolvedValue([
      { suggestedZoneCode: "COR-IMV-1901999", zoneNameCanonical: "Centro" },
    ]);

    const result = await fetchPricingComparables(makeInput(), {
      maxPages: 1,
      comparabilityProfile: {
        propertyCode: "TEST-001",
        catalogVersion: "v1.1",
        resolutionMethod: "key_zona",
        confidenceLevel: "low",
        confidenceFlags: ["UNKNOWN_ZONE"],
        zoneRaw: "Centro",
        zoneCode: "COR-IMV-1901999",
        zoneNameCanonical: "Centro",
        keyLoca: 224499,
        keyZona: 1901999,
        macroArea: "Centro",
        marketSegment: "medio_alto",
        qualityProfile: "medio",
        pricingProfileStatus: "not_ready",
        coverageStatus: "known_unprofiled",
        comparableRadiusMode: "zone_plus_mirrors",
        allowedZoneCodes: ["COR-IMV-1901999"],
        excludedZoneCodes: [],
        comparableRelations: [],
        excludedRelations: [],
        priceBandM2Min: 2000,
        priceBandM2Max: 2600,
        builtAt: new Date().toISOString(),
      },
    });

    expect(result.comparables.length).toBe(2);
    expect(
      result.comparabilityMeta.comparableDecisions.some(
        (d) => d.reason === "ZONE_INCLUDED_STATEFOX_RELAXED",
      ),
    ).toBe(true);
  });
});
