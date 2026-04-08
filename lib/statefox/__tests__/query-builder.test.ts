import { describe, it, expect } from "vitest";
import {
  mapTiposToHousing,
  parseLocationKeywords,
  matchesStatefoxFilters,
  buildStatefoxQuery,
} from "@/lib/statefox/query-builder";
import type { StatefoxProperty } from "@/lib/statefox/types";

function makeProp(overrides?: Partial<StatefoxProperty>): StatefoxProperty {
  return {
    _id: "id.test",
    pPrice: 150000,
    pHousing: "flat",
    pCity: { cityName: "Córdoba", cityRegion: "Córdoba" },
    pZone: { name: "Centro" },
    pMeters: { built: 80 },
    pRooms: 3,
    ...overrides,
  };
}

describe("mapTiposToHousing", () => {
  it("mapea piso a flat", () => {
    expect(mapTiposToHousing("Piso")).toBe("flat");
  });

  it("mapea ático a penthouse (con tilde)", () => {
    expect(mapTiposToHousing("Ático")).toBe("penthouse");
  });

  it("mapea atico a penthouse (sin tilde)", () => {
    expect(mapTiposToHousing("atico")).toBe("penthouse");
  });

  it("mapea dúplex a duplex", () => {
    expect(mapTiposToHousing("Dúplex")).toBe("duplex");
  });

  it("toma el primer tipo reconocido de una lista CSV", () => {
    expect(mapTiposToHousing("Piso, Ático")).toBe("flat");
  });

  it("devuelve flat como fallback", () => {
    expect(mapTiposToHousing("")).toBe("flat");
    expect(mapTiposToHousing("tipodesconocido")).toBe("flat");
  });

  it("mapea chalet a house", () => {
    expect(mapTiposToHousing("Chalet")).toBe("house");
  });

  it("mapea garaje a garage", () => {
    expect(mapTiposToHousing("Garaje")).toBe("garage");
  });
});

describe("parseLocationKeywords", () => {
  it("separa por comas y pasa a minúsculas", () => {
    expect(parseLocationKeywords("Centro, Norte, La Flota")).toEqual([
      "centro",
      "norte",
      "la flota",
    ]);
  });

  it("devuelve vacío para string vacío", () => {
    expect(parseLocationKeywords("")).toEqual([]);
  });

  it("filtra entradas vacías", () => {
    expect(parseLocationKeywords("Centro, , Norte")).toEqual(["centro", "norte"]);
  });
});

describe("matchesStatefoxFilters", () => {
  it("pasa si todos los filtros coinciden", () => {
    const prop = makeProp();
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: 100000,
        maxPrice: 200000,
        minMeters: 60,
        maxMeters: 100,
        locationKeywords: ["córdoba"],
      }),
    ).toBe(true);
  });

  it("normaliza acentos en locationKeywords", () => {
    const prop = makeProp({ pCity: { cityName: "Córdoba" } });
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: null,
        maxPrice: null,
        minMeters: null,
        maxMeters: null,
        locationKeywords: ["cordoba"],
      }),
    ).toBe(true);
  });

  it("normaliza acentos en cityName de la propiedad", () => {
    const prop = makeProp({ pCity: { cityName: "Cordoba" } });
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: null,
        maxPrice: null,
        minMeters: null,
        maxMeters: null,
        locationKeywords: ["córdoba"],
      }),
    ).toBe(true);
  });

  it("matchea bidireccional: keyword incluye cityName", () => {
    const prop = makeProp({ pCity: { cityName: "Córdoba" } });
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: null,
        maxPrice: null,
        minMeters: null,
        maxMeters: null,
        locationKeywords: ["córdoba capital"],
      }),
    ).toBe(true);
  });

  it("excluye por precio fuera de rango", () => {
    const prop = makeProp({ pPrice: 300000 });
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: 100000,
        maxPrice: 200000,
        minMeters: null,
        maxMeters: null,
        locationKeywords: [],
      }),
    ).toBe(false);
  });

  it("excluye por metros fuera de rango", () => {
    const prop = makeProp({ pMeters: { built: 200 } });
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: null,
        maxPrice: null,
        minMeters: 60,
        maxMeters: 100,
        locationKeywords: [],
      }),
    ).toBe(false);
  });

  it("excluye por ciudad no encontrada", () => {
    const prop = makeProp({ pCity: { cityName: "Madrid" } });
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: null,
        maxPrice: null,
        minMeters: null,
        maxMeters: null,
        locationKeywords: ["córdoba"],
      }),
    ).toBe(false);
  });

  it("pasa sin filtros de location", () => {
    const prop = makeProp();
    expect(
      matchesStatefoxFilters(prop, {
        minPrice: null,
        maxPrice: null,
        minMeters: null,
        maxMeters: null,
        locationKeywords: [],
      }),
    ).toBe(true);
  });
});

describe("buildStatefoxQuery", () => {
  it("construye query con valores de la demanda", () => {
    const result = buildStatefoxQuery({
      tipos: "Piso",
      zonas: "Córdoba, Centro",
      presupuestoMin: 100000,
      presupuestoMax: 200000,
      habitacionesMin: 2,
    });

    expect(result.queryParams.housing).toBe("flat");
    expect(result.queryParams.type).toBe("sale");
    expect(result.queryParams.source).toBe("idealista");
    expect(result.queryParams.items).toBe(50);
    expect(result.resultFilters.minPrice).toBe(100000);
    expect(result.resultFilters.maxPrice).toBe(200000);
    expect(result.resultFilters.locationKeywords).toEqual(["córdoba", "centro"]);
  });

  it("usa null para presupuestos en 0", () => {
    const result = buildStatefoxQuery({
      tipos: "Piso",
      zonas: "",
      presupuestoMin: 0,
      presupuestoMax: 0,
      habitacionesMin: 0,
    });

    expect(result.resultFilters.minPrice).toBeNull();
    expect(result.resultFilters.maxPrice).toBeNull();
    expect(result.resultFilters.locationKeywords).toEqual([]);
  });
});
