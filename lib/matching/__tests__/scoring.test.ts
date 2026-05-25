/**
 * Tests unitarios del motor de scoring para cruce de demandas.
 * Funciones puras — no requieren base de datos ni servicios externos.
 *
 * Escenarios basados en datos realistas del mercado inmobiliario español.
 */
import { describe, expect, it } from "vitest";
import {
  scoreZone,
  scorePrice,
  scoreType,
  scoreSize,
  scoreRooms,
  computeMatchScore,
  operationMatches,
  normalizeType,
  parseList,
  normalize,
} from "../scoring";
import type { PropertyForMatching, DemandForMatching } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<PropertyForMatching> = {}): PropertyForMatching {
  return {
    codigo: "P-001",
    ref: "URUS103VMA001",
    titulo: "Piso céntrico luminoso",
    tipoOfer: "Piso",
    precio: 250_000,
    metrosConstruidos: 90,
    habitaciones: 3,
    ciudad: "Córdoba",
    zona: "Centro",
    ...overrides,
  };
}

function makeDemand(overrides: Partial<DemandForMatching> = {}): DemandForMatching {
  return {
    codigo: "D-001",
    ref: "REF-D001",
    nombre: "Familia Martínez — busca piso céntrico",
    presupuestoMin: 200_000,
    presupuestoMax: 300_000,
    habitacionesMin: 2,
    tipos: "Piso",
    zonas: "Centro",
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

describe("parseList", () => {
  it("separa por coma", () => {
    expect(parseList("Centro, Macarena, Triana")).toEqual(["Centro", "Macarena", "Triana"]);
  });

  it("separa por pipe", () => {
    expect(parseList("Piso|Casa|Ático")).toEqual(["Piso", "Casa", "Ático"]);
  });

  it("separa por punto y coma", () => {
    expect(parseList("Norte;Sur")).toEqual(["Norte", "Sur"]);
  });

  it("devuelve vacío para string vacío o null", () => {
    expect(parseList("")).toEqual([]);
    expect(parseList("  ")).toEqual([]);
  });

  it("elimina elementos vacíos", () => {
    expect(parseList(",Piso,,Casa,")).toEqual(["Piso", "Casa"]);
  });
});

describe("normalize", () => {
  it("normaliza acentos y mayúsculas", () => {
    expect(normalize("Córdoba")).toBe("cordoba");
    expect(normalize("ÁTICO")).toBe("atico");
    expect(normalize("Dúplex")).toBe("duplex");
  });
});

describe("normalizeType", () => {
  it("mapea sinónimos inmobiliarios españoles", () => {
    expect(normalizeType("Apartamento")).toBe("piso");
    expect(normalizeType("Chalet")).toBe("casa");
    expect(normalizeType("Villa")).toBe("casa");
    expect(normalizeType("Adosado")).toBe("casa");
    expect(normalizeType("Ático")).toBe("atico");
    expect(normalizeType("Dúplex")).toBe("atico");
    expect(normalizeType("Penthouse")).toBe("atico");
    expect(normalizeType("Loft")).toBe("estudio");
    expect(normalizeType("Nave")).toBe("local");
    expect(normalizeType("Solar")).toBe("terreno");
    expect(normalizeType("Finca")).toBe("casa");
    expect(normalizeType("Garaje")).toBe("garaje");
    expect(normalizeType("Trastero")).toBe("garaje");
  });

  it("devuelve el valor normalizado si no hay sinónimo", () => {
    expect(normalizeType("Cabaña")).toBe("cabana");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ZONA
// ══════════════════════════════════════════════════════════════════════════════

describe("scoreZone", () => {
  it("match exacto zona ↔ zona", () => {
    const r = scoreZone(makeProperty(), makeDemand());
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("match case-insensitive y con acentos (Córdoba = cordoba)", () => {
    const r = scoreZone(
      makeProperty({ zona: "CENTRO" }),
      makeDemand({ zonas: "centro" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("match exacto ciudad cuando demanda especifica ciudad", () => {
    const r = scoreZone(
      makeProperty({ zona: "Nervión", ciudad: "Sevilla" }),
      makeDemand({ zonas: "Sevilla" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.85);
  });

  it("match parcial si zona de propiedad contiene zona de demanda", () => {
    const r = scoreZone(
      makeProperty({ zona: "Centro Histórico" }),
      makeDemand({ zonas: "Centro" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.7);
  });

  it("match parcial si zona de demanda contiene zona de propiedad", () => {
    const r = scoreZone(
      makeProperty({ zona: "Centro" }),
      makeDemand({ zonas: "Centro Histórico" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.7);
  });

  it("no sustituye barrio concreto por coincidencia de ciudad", () => {
    const r = scoreZone(
      makeProperty({ zona: "Norte", ciudad: "Córdoba" }),
      makeDemand({ zonas: "Centro - Córdoba" }),
    );
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("no match si zonas distintas", () => {
    const r = scoreZone(
      makeProperty({ zona: "Nervión", ciudad: "Sevilla" }),
      makeDemand({ zonas: "Macarena" }),
    );
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("match parcial (0.5) si demanda no tiene zonas definidas", () => {
    const r = scoreZone(makeProperty(), makeDemand({ zonas: "" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.5);
  });

  it("no match si propiedad sin zona ni ciudad", () => {
    const r = scoreZone(
      makeProperty({ zona: "", ciudad: "" }),
      makeDemand(),
    );
    expect(r.matched).toBe(false);
  });

  it("match con múltiples zonas separadas por coma", () => {
    const r = scoreZone(
      makeProperty({ zona: "Macarena" }),
      makeDemand({ zonas: "Centro, Macarena, Triana" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("match cuando propiedad tiene solo ciudad y demanda tiene esa ciudad", () => {
    const r = scoreZone(
      makeProperty({ zona: "", ciudad: "Málaga" }),
      makeDemand({ zonas: "Málaga" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.85);
  });

  it("zona con acentos vs zona sin acentos", () => {
    const r = scoreZone(
      makeProperty({ zona: "Albaicín" }),
      makeDemand({ zonas: "Albaicin" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("rechaza zona genérica Andalucia cuando la demanda pide barrios concretos", () => {
    const r = scoreZone(
      makeProperty({ zona: "Andalucia", ciudad: "Córdoba" }),
      makeDemand({ zonas: "Fuensanta, Arcángel, Santuario - Cordoba" }),
    );
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PRECIO
// ══════════════════════════════════════════════════════════════════════════════

describe("scorePrice", () => {
  it("precio en el centro exacto del rango → score 1.0", () => {
    const r = scorePrice(
      makeProperty({ precio: 250_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("precio dentro del rango pero no centrado → score alto ≥ 0.7", () => {
    const r = scorePrice(
      makeProperty({ precio: 290_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });

  it("precio ligeramente sobre máx (dentro de tolerancia 10%) → match bajo", () => {
    const r = scorePrice(
      makeProperty({ precio: 320_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
      10,
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(0.5);
  });

  it("precio muy por encima del máx → no match", () => {
    const r = scorePrice(
      makeProperty({ precio: 500_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("precio debajo del mín pero dentro de tolerancia → match (beneficio)", () => {
    const r = scorePrice(
      makeProperty({ precio: 190_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
      10,
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.6);
  });

  it("demanda sin presupuesto → match parcial 0.5", () => {
    const r = scorePrice(
      makeProperty({ precio: 200_000 }),
      makeDemand({ presupuestoMin: 0, presupuestoMax: 0 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.5);
  });

  it("propiedad sin precio → no match", () => {
    const r = scorePrice(
      makeProperty({ precio: 0 }),
      makeDemand(),
    );
    expect(r.matched).toBe(false);
  });

  it("solo presupuestoMin definido (sin tope) → match si precio por encima", () => {
    const r = scorePrice(
      makeProperty({ precio: 300_000 }),
      makeDemand({ presupuestoMin: 150_000, presupuestoMax: 0 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.9);
  });

  it("solo presupuestoMax definido → precio dentro → match", () => {
    const r = scorePrice(
      makeProperty({ precio: 200_000 }),
      makeDemand({ presupuestoMin: 0, presupuestoMax: 300_000 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });

  it("precio justo en el límite del rango → match con score ≥ 0.7", () => {
    const r = scorePrice(
      makeProperty({ precio: 300_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });

  it("precio justo en el límite inferior → match con score ≥ 0.7", () => {
    const r = scorePrice(
      makeProperty({ precio: 200_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });

  it("alquiler barato: 600€ dentro de rango 500–800€", () => {
    const r = scorePrice(
      makeProperty({ precio: 600 }),
      makeDemand({ presupuestoMin: 500, presupuestoMax: 800 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TIPOLOGÍA
// ══════════════════════════════════════════════════════════════════════════════

describe("scoreType", () => {
  it("tipología exacta", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Piso" }), makeDemand({ tipos: "Piso" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("sinónimo: Apartamento = Piso", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Apartamento" }), makeDemand({ tipos: "Piso" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("sinónimo: Chalet = Casa", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Chalet" }), makeDemand({ tipos: "Casa" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("sinónimo: Adosado = Casa", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Adosado" }), makeDemand({ tipos: "Casa" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("sinónimo: Penthouse = Ático", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Penthouse" }), makeDemand({ tipos: "Ático" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("tipología diferente → no match", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Local" }), makeDemand({ tipos: "Piso" }));
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("demanda con múltiples tipos → match si coincide alguno", () => {
    const r = scoreType(
      makeProperty({ tipoOfer: "Ático" }),
      makeDemand({ tipos: "Piso, Ático, Dúplex" }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("demanda sin tipología → match parcial 0.5", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Piso" }), makeDemand({ tipos: "" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.5);
  });

  it("propiedad sin tipología → no match", () => {
    const r = scoreType(makeProperty({ tipoOfer: "" }), makeDemand({ tipos: "Piso" }));
    expect(r.matched).toBe(false);
  });

  it("terreno vs solar → match (sinónimos)", () => {
    const r = scoreType(makeProperty({ tipoOfer: "Solar" }), makeDemand({ tipos: "Terreno" }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUPERFICIE
// ══════════════════════════════════════════════════════════════════════════════

describe("scoreSize", () => {
  it("propiedad sin metros → match parcial bajo (0.3)", () => {
    const r = scoreSize(makeProperty({ metrosConstruidos: 0 }), makeDemand());
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.3);
  });

  it("demanda sin criterio de metros → match parcial (0.5)", () => {
    const r = scoreSize(makeProperty({ metrosConstruidos: 90 }), makeDemand());
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.5);
  });

  it("metros dentro del rango exacto → score alto", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 100 }),
      makeDemand({ metrosMin: 80, metrosMax: 120 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });

  it("metros en el centro del rango → score máximo", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 100 }),
      makeDemand({ metrosMin: 80, metrosMax: 120 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("metros ligeramente sobre máx → match parcial", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 130 }),
      makeDemand({ metrosMin: 80, metrosMax: 120 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.4);
  });

  it("metros ligeramente bajo mín → match parcial", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 70 }),
      makeDemand({ metrosMin: 80, metrosMax: 120 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.35);
  });

  it("metros muy por fuera del rango → no match", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 200 }),
      makeDemand({ metrosMin: 60, metrosMax: 80 }),
    );
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("solo metrosMin definido → match si por encima", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 120 }),
      makeDemand({ metrosMin: 80, metrosMax: undefined }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.9);
  });

  it("solo metrosMax definido → match si por debajo", () => {
    const r = scoreSize(
      makeProperty({ metrosConstruidos: 80 }),
      makeDemand({ metrosMin: undefined, metrosMax: 120 }),
    );
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// HABITACIONES
// ══════════════════════════════════════════════════════════════════════════════

describe("scoreRooms", () => {
  it("habitaciones = mínimo → score 1.0", () => {
    const r = scoreRooms(makeProperty({ habitaciones: 2 }), makeDemand({ habitacionesMin: 2 }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(1.0);
  });

  it("habitaciones > mínimo → match con leve penalización", () => {
    const r = scoreRooms(makeProperty({ habitaciones: 4 }), makeDemand({ habitacionesMin: 2 }));
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.score).toBeLessThan(1.0);
  });

  it("1 hab menos que mín → match parcial bajo (0.3)", () => {
    const r = scoreRooms(makeProperty({ habitaciones: 2 }), makeDemand({ habitacionesMin: 3 }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.3);
  });

  it("2+ hab menos que mín → no match", () => {
    const r = scoreRooms(makeProperty({ habitaciones: 1 }), makeDemand({ habitacionesMin: 3 }));
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("demanda sin mín de habitaciones → match parcial (0.5)", () => {
    const r = scoreRooms(makeProperty({ habitaciones: 2 }), makeDemand({ habitacionesMin: 0 }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.5);
  });

  it("propiedad sin habitaciones registradas → match parcial (0.3)", () => {
    const r = scoreRooms(makeProperty({ habitaciones: 0 }), makeDemand({ habitacionesMin: 2 }));
    expect(r.matched).toBe(true);
    expect(r.score).toBe(0.3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FILTRO DURO: OPERACIÓN
// ══════════════════════════════════════════════════════════════════════════════

describe("operationMatches", () => {
  it("ambos venta → match", () => {
    expect(operationMatches(
      makeProperty({ tipoOperacion: "venta" }),
      makeDemand({ tipoOperacion: "venta" }),
    )).toBe(true);
  });

  it("venta vs alquiler → no match", () => {
    expect(operationMatches(
      makeProperty({ tipoOperacion: "venta" }),
      makeDemand({ tipoOperacion: "alquiler" }),
    )).toBe(false);
  });

  it("sin operación en propiedad → match (no se filtra)", () => {
    expect(operationMatches(
      makeProperty({ tipoOperacion: undefined }),
      makeDemand({ tipoOperacion: "venta" }),
    )).toBe(true);
  });

  it("sin operación en demanda → match (no se filtra)", () => {
    expect(operationMatches(
      makeProperty({ tipoOperacion: "alquiler" }),
      makeDemand({ tipoOperacion: undefined }),
    )).toBe(true);
  });

  it("ambos vacíos → match", () => {
    expect(operationMatches(makeProperty(), makeDemand())).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SCORE TOTAL (computeMatchScore)
// ══════════════════════════════════════════════════════════════════════════════

describe("computeMatchScore", () => {
  it("match perfecto → score ≥ 80", () => {
    const { totalScore, isMatch } = computeMatchScore(makeProperty(), makeDemand());
    expect(totalScore).toBeGreaterThanOrEqual(80);
    expect(isMatch).toBe(true);
  });

  it("precio fuera de rango pero zona y tipo coinciden → score medio", () => {
    const { totalScore, isMatch } = computeMatchScore(
      makeProperty({ precio: 500_000 }),
      makeDemand({ presupuestoMax: 200_000 }),
    );
    expect(totalScore).toBeGreaterThanOrEqual(40);
    expect(totalScore).toBeLessThan(70);
  });

  it("demanda sin criterios definidos → score parcial ~50", () => {
    const { totalScore } = computeMatchScore(
      makeProperty(),
      makeDemand({
        presupuestoMin: 0,
        presupuestoMax: 0,
        habitacionesMin: 0,
        tipos: "",
        zonas: "",
      }),
    );
    expect(totalScore).toBeGreaterThanOrEqual(30);
    expect(totalScore).toBeLessThanOrEqual(60);
  });

  it("nada coincide → score < 20, no match", () => {
    const { totalScore, isMatch } = computeMatchScore(
      makeProperty({ zona: "Norte", tipoOfer: "Local", precio: 900_000, habitaciones: 0 }),
      makeDemand({ zonas: "Sur", tipos: "Piso", presupuestoMax: 200_000, habitacionesMin: 3 }),
    );
    expect(totalScore).toBeLessThan(20);
    expect(isMatch).toBe(false);
  });

  it("threshold personalizable", () => {
    const property = makeProperty({ precio: 350_000 });
    const demand = makeDemand({ presupuestoMax: 300_000 });

    const withLowThreshold = computeMatchScore(property, demand, {
      weights: { zone: 0.30, price: 0.30, type: 0.20, size: 0.10, rooms: 0.10 },
      minScoreThreshold: 20,
      priceTolerancePercent: 10,
      sizeFallbackRangePercent: 20,
    });
    expect(withLowThreshold.isMatch).toBe(true);
  });

  it("matchScore contiene detalle por criterio", () => {
    const { matchScore } = computeMatchScore(makeProperty(), makeDemand());
    expect(matchScore.zone).toHaveProperty("matched");
    expect(matchScore.zone).toHaveProperty("score");
    expect(matchScore.zone).toHaveProperty("reason");
    expect(matchScore.price).toHaveProperty("matched");
    expect(matchScore.type).toHaveProperty("matched");
    expect(matchScore.size).toHaveProperty("matched");
    expect(matchScore.rooms).toHaveProperty("matched");
  });

  it("bloquea el caso Luis contra Sevilla aunque precio y habitaciones encajen", () => {
    const { totalScore, isMatch, matchScore, blockedByLocation } = computeMatchScore(
      makeProperty({
        codigo: "25961477",
        ref: "URUSV07SF",
        titulo: "Casa adosada en venta en Calle Río Espartero",
        tipoOfer: "Adosado",
        precio: 120_000,
        metrosConstruidos: 150,
        habitaciones: 2,
        ciudad: "Sevilla",
        zona: "Moron de la Frontera",
      }),
      makeDemand({
        codigo: "40116955",
        ref: "1251",
        nombre: "Luis",
        presupuestoMin: 105_000,
        presupuestoMax: 140_000,
        habitacionesMin: 2,
        tipos: "",
        zonas: "Fuensanta, Arcángel, Santuario",
      }),
    );

    expect(totalScore).toBeGreaterThanOrEqual(50);
    expect(matchScore.zone.matched).toBe(false);
    expect(blockedByLocation).toBe(true);
    expect(isMatch).toBe(false);
  });

  it("bloquea el caso Luis contra Andalucia aunque esté en Córdoba", () => {
    const { totalScore, isMatch, matchScore, blockedByLocation } = computeMatchScore(
      makeProperty({
        codigo: "27902283",
        ref: "URUS01VFEDE",
        titulo: "ESPECTACULAR CASA EN LA VICTORIA",
        tipoOfer: "Adosado",
        precio: 130_000,
        metrosConstruidos: 126,
        habitaciones: 3,
        ciudad: "Córdoba",
        zona: "Andalucia",
      }),
      makeDemand({
        codigo: "40116955",
        ref: "1251",
        nombre: "Luis",
        presupuestoMin: 105_000,
        presupuestoMax: 140_000,
        habitacionesMin: 2,
        tipos: "",
        zonas: "Fuensanta, Arcángel, Santuario",
      }),
    );

    expect(totalScore).toBeGreaterThanOrEqual(50);
    expect(matchScore.zone.matched).toBe(false);
    expect(blockedByLocation).toBe(true);
    expect(isMatch).toBe(false);
  });

  it("permite ciudad genérica cuando la demanda no especifica barrios", () => {
    const { isMatch, matchScore, blockedByLocation } = computeMatchScore(
      makeProperty({ zona: "Norte", ciudad: "Córdoba" }),
      makeDemand({ zonas: "Córdoba" }),
    );

    expect(matchScore.zone.matched).toBe(true);
    expect(blockedByLocation).toBe(false);
    expect(isMatch).toBe(true);
  });

  it("mantiene demanda sin zonas como parcial sin bloqueo geografico", () => {
    const { isMatch, matchScore, blockedByLocation } = computeMatchScore(
      makeProperty({ zona: "Norte", ciudad: "Córdoba" }),
      makeDemand({ zonas: "", presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );

    expect(matchScore.zone.score).toBe(0.5);
    expect(blockedByLocation).toBe(false);
    expect(isMatch).toBe(true);
  });

  it("permite zonas cercanas por contexto de catalogo", () => {
    const { isMatch, matchScore, blockedByLocation } = computeMatchScore(
      makeProperty({
        zona: "Campo de la Verdad Zona Baja",
        ciudad: "Córdoba",
        precio: 120_000,
        habitaciones: 3,
      }),
      makeDemand({
        presupuestoMin: 105_000,
        presupuestoMax: 140_000,
        habitacionesMin: 2,
        tipos: "",
        zonas: "Fuensanta, Arcángel, Santuario",
      }),
      {
        weights: { zone: 0.30, price: 0.30, type: 0.20, size: 0.10, rooms: 0.10 },
        minScoreThreshold: 50,
        priceTolerancePercent: 10,
        sizeFallbackRangePercent: 20,
        location: {
          demandCity: "Córdoba",
          exactZones: ["fuensanta - arcangel - santuario"],
          nearbyZones: ["campo de la verdad zona baja"],
          excludedZones: [],
        },
      },
    );

    expect(matchScore.zone.matched).toBe(true);
    expect(matchScore.zone.score).toBeGreaterThanOrEqual(0.7);
    expect(blockedByLocation).toBe(false);
    expect(isMatch).toBe(true);
  });

  // ── Escenarios realistas ─────────────────────────────────────────────────

  it("escenario: familia busca piso en Centro Córdoba 200-300k, 2 hab → piso 250k 3 hab Centro", () => {
    const { totalScore, isMatch, matchScore } = computeMatchScore(
      makeProperty({
        precio: 250_000, habitaciones: 3, zona: "Centro",
        ciudad: "Córdoba", tipoOfer: "Piso", metrosConstruidos: 95,
      }),
      makeDemand({
        presupuestoMin: 200_000, presupuestoMax: 300_000,
        habitacionesMin: 2, tipos: "Piso", zonas: "Centro",
        metrosMin: 80, metrosMax: 120,
      }),
    );
    expect(isMatch).toBe(true);
    expect(totalScore).toBeGreaterThanOrEqual(90);
    expect(matchScore.zone.score).toBe(1.0);
    expect(matchScore.price.score).toBe(1.0);
    expect(matchScore.type.score).toBe(1.0);
    expect(matchScore.size.score).toBeGreaterThanOrEqual(0.7);
    expect(matchScore.rooms.score).toBeGreaterThanOrEqual(0.7);
  });

  it("escenario: inversor busca local comercial en Málaga 100-200k → local 150k en Málaga", () => {
    const { totalScore, isMatch } = computeMatchScore(
      makeProperty({
        precio: 150_000, habitaciones: 0, zona: "Centro",
        ciudad: "Málaga", tipoOfer: "Local", metrosConstruidos: 60,
      }),
      makeDemand({
        presupuestoMin: 100_000, presupuestoMax: 200_000,
        habitacionesMin: 0, tipos: "Local, Oficina", zonas: "Málaga",
      }),
    );
    expect(isMatch).toBe(true);
    expect(totalScore).toBeGreaterThanOrEqual(70);
  });

  it("escenario: joven busca estudio barato → loft caro no coincide", () => {
    const { isMatch } = computeMatchScore(
      makeProperty({
        precio: 280_000, habitaciones: 1, zona: "Salamanca",
        ciudad: "Madrid", tipoOfer: "Loft", metrosConstruidos: 45,
      }),
      makeDemand({
        presupuestoMin: 50_000, presupuestoMax: 120_000,
        habitacionesMin: 0, tipos: "Estudio", zonas: "Lavapiés, Malasaña",
      }),
    );
    expect(isMatch).toBe(false);
  });

  it("escenario: pareja busca chalet Albaicín 300-500k → villa 400k Albaicin", () => {
    const { totalScore, isMatch } = computeMatchScore(
      makeProperty({
        precio: 400_000, habitaciones: 4, zona: "Albaicín",
        ciudad: "Granada", tipoOfer: "Villa", metrosConstruidos: 200,
      }),
      makeDemand({
        presupuestoMin: 300_000, presupuestoMax: 500_000,
        habitacionesMin: 3, tipos: "Chalet, Casa", zonas: "Albaicín, Sacromonte",
        metrosMin: 150, metrosMax: 250,
      }),
    );
    expect(isMatch).toBe(true);
    expect(totalScore).toBeGreaterThanOrEqual(85);
  });
});
