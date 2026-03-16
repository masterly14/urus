/**
 * Tests unitarios del motor de scoring para cruce de demandas.
 * Funciones puras — no requieren base de datos ni servicios externos.
 */
import { describe, expect, it } from "vitest";
import {
  scoreZone,
  scorePrice,
  scoreType,
  scoreSize,
  scoreRooms,
  computeMatchScore,
} from "../scoring";
import type { PropertyForMatching, DemandForMatching } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<PropertyForMatching> = {}): PropertyForMatching {
  return {
    codigo: "P-001",
    ref: "REF-001",
    titulo: "Piso céntrico",
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
    nombre: "Demanda test",
    presupuestoMin: 200_000,
    presupuestoMax: 300_000,
    habitacionesMin: 2,
    tipos: "Piso",
    zonas: "Centro",
    ...overrides,
  };
}

// ── scoreZone ────────────────────────────────────────────────────────────────

describe("scoreZone", () => {
  it("match exacto por nombre de zona", () => {
    const result = scoreZone(makeProperty(), makeDemand());
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("match case-insensitive y con acentos", () => {
    const result = scoreZone(
      makeProperty({ zona: "CENTRO" }),
      makeDemand({ zonas: "centro" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("match parcial si la zona está contenida", () => {
    const result = scoreZone(
      makeProperty({ zona: "Centro Histórico" }),
      makeDemand({ zonas: "Centro" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.7);
  });

  it("no match si zonas distintas", () => {
    const result = scoreZone(
      makeProperty({ zona: "Nervión" }),
      makeDemand({ zonas: "Centro, Macarena" }),
    );
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it("match parcial (0.5) si la demanda no tiene zonas", () => {
    const result = scoreZone(makeProperty(), makeDemand({ zonas: "" }));
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.5);
  });

  it("no match si la propiedad no tiene zona ni ciudad", () => {
    const result = scoreZone(
      makeProperty({ zona: "", ciudad: "" }),
      makeDemand(),
    );
    expect(result.matched).toBe(false);
  });

  it("match con múltiples zonas separadas por coma", () => {
    const result = scoreZone(
      makeProperty({ zona: "Macarena" }),
      makeDemand({ zonas: "Centro, Macarena, Triana" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("fallback a ciudad si zona no coincide", () => {
    const result = scoreZone(
      makeProperty({ zona: "Barrio Nuevo", ciudad: "Córdoba" }),
      makeDemand({ zonas: "Córdoba" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.7);
  });
});

// ── scorePrice ───────────────────────────────────────────────────────────────

describe("scorePrice", () => {
  it("precio dentro del rango → score alto", () => {
    const result = scorePrice(
      makeProperty({ precio: 250_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("precio en el centro exacto del rango → score máximo", () => {
    const result = scorePrice(
      makeProperty({ precio: 250_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("precio ligeramente sobre el máximo (dentro de tolerancia 10%) → match con score bajo", () => {
    const result = scorePrice(
      makeProperty({ precio: 320_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
      10,
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.5);
  });

  it("precio muy por encima del máximo → no match", () => {
    const result = scorePrice(
      makeProperty({ precio: 500_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
    );
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it("precio por debajo del mínimo pero dentro de tolerancia → match favorable", () => {
    const result = scorePrice(
      makeProperty({ precio: 190_000 }),
      makeDemand({ presupuestoMin: 200_000, presupuestoMax: 300_000 }),
      10,
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.6);
  });

  it("demanda sin presupuesto → match parcial 0.5", () => {
    const result = scorePrice(
      makeProperty({ precio: 200_000 }),
      makeDemand({ presupuestoMin: 0, presupuestoMax: 0 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.5);
  });

  it("propiedad sin precio → no match", () => {
    const result = scorePrice(
      makeProperty({ precio: 0 }),
      makeDemand(),
    );
    expect(result.matched).toBe(false);
  });
});

// ── scoreType ────────────────────────────────────────────────────────────────

describe("scoreType", () => {
  it("tipología exacta → score 1.0", () => {
    const result = scoreType(
      makeProperty({ tipoOfer: "Piso" }),
      makeDemand({ tipos: "Piso" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("sinónimo reconocido → score 1.0", () => {
    const result = scoreType(
      makeProperty({ tipoOfer: "Apartamento" }),
      makeDemand({ tipos: "Piso" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("chalet vs casa → match por sinónimo", () => {
    const result = scoreType(
      makeProperty({ tipoOfer: "Chalet" }),
      makeDemand({ tipos: "Casa" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("tipología diferente → no match", () => {
    const result = scoreType(
      makeProperty({ tipoOfer: "Local" }),
      makeDemand({ tipos: "Piso" }),
    );
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it("demanda con múltiples tipos → match si coincide alguno", () => {
    const result = scoreType(
      makeProperty({ tipoOfer: "Ático" }),
      makeDemand({ tipos: "Piso, Ático, Dúplex" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("demanda sin tipología → match parcial 0.5", () => {
    const result = scoreType(
      makeProperty({ tipoOfer: "Piso" }),
      makeDemand({ tipos: "" }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.5);
  });
});

// ── scoreRooms ───────────────────────────────────────────────────────────────

describe("scoreRooms", () => {
  it("habitaciones ≥ mínimo → match", () => {
    const result = scoreRooms(
      makeProperty({ habitaciones: 3 }),
      makeDemand({ habitacionesMin: 2 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("habitaciones exactamente = mínimo → score 1.0", () => {
    const result = scoreRooms(
      makeProperty({ habitaciones: 2 }),
      makeDemand({ habitacionesMin: 2 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("1 habitación menos que mínimo → match parcial bajo", () => {
    const result = scoreRooms(
      makeProperty({ habitaciones: 2 }),
      makeDemand({ habitacionesMin: 3 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.3);
  });

  it("2+ habitaciones menos que mínimo → no match", () => {
    const result = scoreRooms(
      makeProperty({ habitaciones: 1 }),
      makeDemand({ habitacionesMin: 3 }),
    );
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it("demanda sin mínimo de habitaciones → match parcial 0.5", () => {
    const result = scoreRooms(
      makeProperty({ habitaciones: 2 }),
      makeDemand({ habitacionesMin: 0 }),
    );
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.5);
  });
});

// ── scoreSize ────────────────────────────────────────────────────────────────

describe("scoreSize", () => {
  it("propiedad con metros → match parcial (sin criterio de demanda aún)", () => {
    const result = scoreSize(makeProperty({ metrosConstruidos: 90 }), makeDemand());
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.5);
  });

  it("propiedad sin metros → match parcial bajo", () => {
    const result = scoreSize(makeProperty({ metrosConstruidos: 0 }), makeDemand());
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0.3);
  });
});

// ── computeMatchScore ────────────────────────────────────────────────────────

describe("computeMatchScore", () => {
  it("match perfecto (todos los criterios coinciden) → score alto ≥ 80", () => {
    const { totalScore, isMatch } = computeMatchScore(
      makeProperty(),
      makeDemand(),
    );
    expect(totalScore).toBeGreaterThanOrEqual(80);
    expect(isMatch).toBe(true);
  });

  it("precio fuera de rango pero zona y tipo coinciden → score medio, match borderline", () => {
    const { totalScore, isMatch } = computeMatchScore(
      makeProperty({ precio: 500_000 }),
      makeDemand({ presupuestoMax: 200_000 }),
    );
    expect(totalScore).toBeGreaterThanOrEqual(50);
    expect(totalScore).toBeLessThan(70);
    expect(isMatch).toBe(true);
  });

  it("demanda sin criterios definidos → match parcial alrededor de 50", () => {
    const { totalScore, isMatch } = computeMatchScore(
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

  it("todo no coincide → score 0, no match", () => {
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

    const withDefault = computeMatchScore(property, demand);
    const withLowThreshold = computeMatchScore(property, demand, {
      ...withDefault,
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
});
