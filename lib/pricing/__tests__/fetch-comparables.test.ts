import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PricingPropertyInput } from "@/lib/pricing/types";
import type { GetSnapshotResponse, StatefoxSnapshotProperty } from "@/lib/statefox/types";

vi.mock("@/lib/statefox/client", () => ({
  createStatefoxClient: vi.fn(() => ({ get: vi.fn() })),
  getSnapshot: vi.fn(),
}));

import { getSnapshot } from "@/lib/statefox/client";
import { fetchPricingComparables } from "@/lib/pricing/fetch-comparables";

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;

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
});

describe("fetchPricingComparables (snapshot)", () => {
  it("no consulta portales externos al construir comparables", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-with-link": makeSnapshotProp({
          pCity: { cityName: "Murcia" },
          pImages: [],
          pLink: "https://www.idealista.com/inmueble/123/",
        }),
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { comparables } = await fetchPricingComparables(makeInput(), {
      maxPages: 1,
      minComparables: 1,
    });

    expect(comparables).toHaveLength(1);
    expect(comparables[0].link).toBe("https://www.idealista.com/inmueble/123/");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

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

  it("no consulta páginas de portales al construir comparables", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-1": makeSnapshotProp({ pImages: [], pLink: "https://www.idealista.com/inmueble/123/" }),
      }),
    );

    const { comparables } = await fetchPricingComparables(makeInput(), { maxPages: 1, minComparables: 1 });

    expect(comparables.length).toBe(1);
    expect(comparables[0].link).toBe("https://www.idealista.com/inmueble/123/");
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it("no solicita páginas de portales al construir comparables de pricing", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeSnapshotResponse({
        "id-no-images": makeSnapshotProp({
          pImages: [],
          pLink: "https://www.idealista.com/inmueble/12345/",
        }),
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { comparables } = await fetchPricingComparables(makeInput(), {
      maxPages: 1,
      minComparables: 1,
    });

    expect(comparables).toHaveLength(1);
    expect(comparables[0].link).toBe("https://www.idealista.com/inmueble/12345/");
    expect(fetchSpy).not.toHaveBeenCalled();
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
});
