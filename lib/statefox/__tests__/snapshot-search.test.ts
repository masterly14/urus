import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GetSnapshotResponse, StatefoxSnapshotProperty } from "@/lib/statefox/types";
import type { DemandFilterInput } from "@/lib/statefox/query-builder";

vi.mock("@/lib/statefox/client", () => ({
  createStatefoxClient: vi.fn(() => ({ get: vi.fn() })),
  getSnapshot: vi.fn(),
}));

import { getSnapshot } from "@/lib/statefox/client";
import {
  searchSnapshotForDemand,
  normalizeForComparison,
  normalizeLocationKeywords,
  matchesCity,
  matchesHousing,
  matchesPriceRange,
  matchesMetersRange,
  matchesMinRooms,
} from "@/lib/statefox/snapshot-search";

const mockGetSnapshot = getSnapshot as ReturnType<typeof vi.fn>;

function makeProp(overrides?: Partial<StatefoxSnapshotProperty>): StatefoxSnapshotProperty {
  return {
    _id: "id.es.s.12345",
    pPrice: 150000,
    pHousing: "flat",
    pStatus: "active",
    pType: "sale",
    pCity: { cityName: "Córdoba", cityRegion: "Córdoba" },
    pZone: { name: "Centro" },
    pMeters: { built: 80 },
    pRooms: 3,
    pBaths: 1,
    pAdvert: { type: "professional" },
    pExtras: {},
    pLink: "https://idealista.com/12345",
    pTS: { insert: Math.floor(Date.now() / 1000) - 86400 * 10 },
    ...overrides,
  };
}

function makeResponse(
  result: Record<string, StatefoxSnapshotProperty>,
  next: string | null = null,
): GetSnapshotResponse {
  return {
    result,
    meta: { items: Object.keys(result).length, sort: "pTS.insert,DESC", next },
  };
}

function makeDemand(overrides?: Partial<DemandFilterInput>): DemandFilterInput {
  return {
    tipos: "Piso",
    zonas: "Córdoba",
    presupuestoMin: 100000,
    presupuestoMax: 200000,
    habitacionesMin: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Funciones puras de matching
// ---------------------------------------------------------------------------

describe("normalizeForComparison", () => {
  it("convierte a minúsculas y elimina diacríticos", () => {
    expect(normalizeForComparison("Córdoba")).toBe("cordoba");
    expect(normalizeForComparison("ÁTICO")).toBe("atico");
    expect(normalizeForComparison("  La Flota  ")).toBe("la flota");
  });
});

describe("normalizeLocationKeywords", () => {
  it("separa por comas y normaliza", () => {
    expect(normalizeLocationKeywords("Córdoba, Centro, La Flota")).toEqual([
      "cordoba",
      "centro",
      "la flota",
    ]);
  });

  it("devuelve vacío si no hay zonas", () => {
    expect(normalizeLocationKeywords("")).toEqual([]);
    expect(normalizeLocationKeywords("  ")).toEqual([]);
  });
});

describe("matchesCity", () => {
  it("matchea por cityName normalizado", () => {
    const prop = makeProp({ pCity: { cityName: "Córdoba" } });
    expect(matchesCity(prop, ["cordoba"])).toBe(true);
  });

  it("matchea si keyword incluye a cityName (bidireccional)", () => {
    const prop = makeProp({ pCity: { cityName: "Córdoba" } });
    expect(matchesCity(prop, ["cordoba capital"])).toBe(true);
  });

  it("matchea por nombre de zona", () => {
    const prop = makeProp({ pZone: { name: "Centro · Norte" } });
    expect(matchesCity(prop, ["centro"])).toBe(true);
  });

  it("matchea por dirección", () => {
    const prop = makeProp({ pAddress: "Calle Gran Vía 12" });
    expect(matchesCity(prop, ["gran via"])).toBe(true);
  });

  it("no matchea si nada coincide", () => {
    const prop = makeProp({
      pCity: { cityName: "Córdoba" },
      pZone: { name: "Centro" },
      pAddress: "Calle Mayor",
    });
    expect(matchesCity(prop, ["madrid"])).toBe(false);
  });

  it("devuelve true si no hay keywords", () => {
    expect(matchesCity(makeProp(), [])).toBe(true);
  });
});

describe("matchesHousing", () => {
  it("matchea tipo exacto", () => {
    expect(matchesHousing(makeProp({ pHousing: "flat" }), "flat")).toBe(true);
    expect(matchesHousing(makeProp({ pHousing: "house" }), "flat")).toBe(false);
  });
});

describe("matchesPriceRange", () => {
  it("incluye propiedades dentro del rango", () => {
    expect(matchesPriceRange(makeProp({ pPrice: 150000 }), 100000, 200000)).toBe(true);
  });

  it("excluye por encima del máximo", () => {
    expect(matchesPriceRange(makeProp({ pPrice: 250000 }), 100000, 200000)).toBe(false);
  });

  it("excluye por debajo del mínimo", () => {
    expect(matchesPriceRange(makeProp({ pPrice: 50000 }), 100000, 200000)).toBe(false);
  });

  it("excluye propiedades sin precio", () => {
    expect(matchesPriceRange(makeProp({ pPrice: 0 }), null, null)).toBe(false);
  });

  it("sin límites acepta cualquier precio positivo", () => {
    expect(matchesPriceRange(makeProp({ pPrice: 999999 }), null, null)).toBe(true);
  });
});

describe("matchesMetersRange", () => {
  it("incluye dentro del rango", () => {
    expect(matchesMetersRange(makeProp({ pMeters: { built: 80 } }), 60, 100)).toBe(true);
  });

  it("excluye fuera del rango", () => {
    expect(matchesMetersRange(makeProp({ pMeters: { built: 120 } }), 60, 100)).toBe(false);
  });

  it("incluye si metros son 0 (sin dato)", () => {
    expect(matchesMetersRange(makeProp({ pMeters: { built: 0 } }), 60, 100)).toBe(true);
  });

  it("sin límites acepta todo", () => {
    expect(matchesMetersRange(makeProp({ pMeters: { built: 500 } }), null, null)).toBe(true);
  });
});

describe("matchesMinRooms", () => {
  it("incluye si cumple mínimo", () => {
    expect(matchesMinRooms(makeProp({ pRooms: 3 }), 2)).toBe(true);
  });

  it("excluye si no cumple mínimo", () => {
    expect(matchesMinRooms(makeProp({ pRooms: 1 }), 2)).toBe(false);
  });

  it("incluye si minRooms es 0", () => {
    expect(matchesMinRooms(makeProp({ pRooms: 1 }), 0)).toBe(true);
  });

  it("incluye si la propiedad no tiene dato de rooms", () => {
    expect(matchesMinRooms(makeProp({ pRooms: 0 }), 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchSnapshotForDemand (integración con mock)
// ---------------------------------------------------------------------------

describe("searchSnapshotForDemand", () => {
  it("devuelve propiedades que cumplen todos los filtros", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeResponse({
        "id-1": makeProp({ pPrice: 150000, pHousing: "flat", pRooms: 3 }),
        "id-2": makeProp({ pPrice: 300000, pHousing: "flat", pRooms: 3 }),
        "id-3": makeProp({ pPrice: 150000, pHousing: "house", pRooms: 3 }),
      }),
    );

    const result = await searchSnapshotForDemand(makeDemand(), { maxPages: 1 });
    expect(result.properties.length).toBe(1);
    expect(result.properties[0].id).toBe("id-1");
  });

  it("normaliza acentos en la comparación de ciudad", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeResponse({
        "id-1": makeProp({ pCity: { cityName: "Córdoba" } }),
      }),
    );

    const result = await searchSnapshotForDemand(
      makeDemand({ zonas: "cordoba" }),
      { maxPages: 1 },
    );
    expect(result.properties.length).toBe(1);
  });

  it("pagina con cursor hasta encontrar resultados", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce(
        makeResponse(
          { "id-bad": makeProp({ pCity: { cityName: "Madrid" } }) },
          "cursor-2",
        ),
      )
      .mockResolvedValueOnce(
        makeResponse(
          { "id-good": makeProp({ pCity: { cityName: "Córdoba" } }) },
          null,
        ),
      );

    const result = await searchSnapshotForDemand(makeDemand(), { maxPages: 5 });
    expect(result.pagesScanned).toBe(2);
    expect(result.properties.length).toBe(1);
    expect(result.properties[0].id).toBe("id-good");
  });

  it("early exit al alcanzar targetResults", async () => {
    const props: Record<string, StatefoxSnapshotProperty> = {};
    for (let i = 0; i < 25; i++) {
      props[`id-${i}`] = makeProp({ _id: `id.${i}`, pPrice: 150000 + i * 100 });
    }
    mockGetSnapshot.mockResolvedValue(makeResponse(props, "cursor-2"));

    const result = await searchSnapshotForDemand(makeDemand(), {
      maxPages: 5,
      targetResults: 10,
    });
    expect(result.earlyExit).toBe(true);
    expect(result.pagesScanned).toBe(1);
    expect(result.properties.length).toBeGreaterThanOrEqual(10);
  });

  it("respeta maxPages", async () => {
    let callCount = 0;
    mockGetSnapshot.mockImplementation(async () => {
      callCount++;
      return makeResponse(
        { [`id-${callCount}`]: makeProp({ pCity: { cityName: "Madrid" } }) },
        `cursor-${callCount + 1}`,
      );
    });

    const result = await searchSnapshotForDemand(
      makeDemand({ zonas: "Sevilla" }),
      { maxPages: 3 },
    );
    expect(result.pagesScanned).toBe(3);
    expect(result.properties.length).toBe(0);
  });

  it("continúa si una página falla", async () => {
    mockGetSnapshot.mockRejectedValueOnce(new Error("timeout"));

    const result = await searchSnapshotForDemand(makeDemand(), { maxPages: 3 });
    expect(result.pagesScanned).toBe(0);
    expect(result.properties.length).toBe(0);
  });

  it("filtra por habitaciones mínimas", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeResponse({
        "id-ok": makeProp({ pRooms: 3 }),
        "id-few": makeProp({ pRooms: 1, _id: "id.2" }),
      }),
    );

    const result = await searchSnapshotForDemand(
      makeDemand({ habitacionesMin: 2 }),
      { maxPages: 1 },
    );
    expect(result.properties.length).toBe(1);
    expect(result.properties[0].id).toBe("id-ok");
  });

  it("filtra por rango de metros", async () => {
    mockGetSnapshot.mockResolvedValue(
      makeResponse({
        "id-ok": makeProp({ pMeters: { built: 80 } }),
        "id-big": makeProp({ pMeters: { built: 200 }, _id: "id.2" }),
      }),
    );

    const result = await searchSnapshotForDemand(
      makeDemand({ metrosMin: 60, metrosMax: 100 }),
      { maxPages: 1 },
    );
    expect(result.properties.length).toBe(1);
    expect(result.properties[0].id).toBe("id-ok");
  });

  it("no duplica propiedades vistas en páginas anteriores", async () => {
    mockGetSnapshot
      .mockResolvedValueOnce(
        makeResponse({ "id-1": makeProp() }, "cursor-2"),
      )
      .mockResolvedValueOnce(
        makeResponse({ "id-1": makeProp(), "id-2": makeProp({ _id: "id.2", pPrice: 160000 }) }, null),
      );

    const result = await searchSnapshotForDemand(makeDemand(), { maxPages: 5, targetResults: 50 });
    expect(result.properties.length).toBe(2);
    const ids = result.properties.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("usa listingType sale por defecto", async () => {
    mockGetSnapshot.mockResolvedValue(makeResponse({}));
    await searchSnapshotForDemand(makeDemand(), { maxPages: 1 });
    expect(mockGetSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "sale", status: "active" }),
    );
  });
});
