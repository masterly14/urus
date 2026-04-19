import { describe, it, expect } from "vitest";
import type { Propiedad, SemaforoStatus } from "@/lib/mock-data/types";
import {
  generateCluster,
  generatePositionHistory,
  getRecommendation,
  computeSemaforoStatus,
  computePortfolioStats,
} from "../engine";

function makeProp(overrides?: Partial<Propiedad>): Propiedad {
  return {
    id: "test-1",
    direccion: "Calle Test 1",
    precio: 300000,
    metros: 100,
    habitaciones: 3,
    zona: "Centro",
    tipologia: "Piso",
    estado: "En venta",
    semaforo: "verde",
    diasSinLlamadas: 2,
    posicionPortal: 3,
    gapPrecio: -1.5,
    extras: { terraza: true, garaje: false, ascensor: true, reformado: false },
    ...overrides,
  };
}

// ====================================================================
// generateCluster
// ====================================================================

describe("generateCluster", () => {
  const prop = makeProp({ precio: 200000, metros: 80, zona: "Ruzafa" });
  const cluster = generateCluster(prop);

  it("returns 6 comparables", () => {
    expect(cluster).toHaveLength(6);
  });

  it("generates unique ids", () => {
    const ids = cluster.map((c) => c.id);
    expect(new Set(ids).size).toBe(6);
  });

  it("applies price deltas around the base price", () => {
    const minExpected = Math.round(200000 * (1 - 0.12));
    const maxExpected = Math.round(200000 * (1 + 0.12));
    for (const c of cluster) {
      expect(c.precio).toBeGreaterThanOrEqual(minExpected);
      expect(c.precio).toBeLessThanOrEqual(maxExpected);
    }
  });

  it("preserves zona and habitaciones from original property", () => {
    for (const c of cluster) {
      expect(c.zona).toBe("Ruzafa");
      expect(c.habitaciones).toBe(prop.habitaciones);
    }
  });

  it("includes all required fields", () => {
    for (const c of cluster) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("direccion");
      expect(c).toHaveProperty("precio");
      expect(c).toHaveProperty("metros");
      expect(c).toHaveProperty("portalPos");
      expect(c).toHaveProperty("diasPublicado");
      expect(c).toHaveProperty("extras");
    }
  });

  it("handles a zero-price property without error", () => {
    const zeroProp = makeProp({ precio: 0 });
    const result = generateCluster(zeroProp);
    expect(result).toHaveLength(6);
    for (const c of result) {
      expect(c.precio).toBe(0);
    }
  });
});

// ====================================================================
// generatePositionHistory
// ====================================================================

describe("generatePositionHistory", () => {
  const deterministicRng = () => 0.5;

  it("returns 6 monthly entries", () => {
    const history = generatePositionHistory(5, deterministicRng);
    expect(history).toHaveLength(6);
  });

  it("last entry matches the current position exactly", () => {
    for (const pos of [1, 5, 12, 20]) {
      const history = generatePositionHistory(pos, deterministicRng);
      expect(history[history.length - 1].position).toBe(pos);
    }
  });

  it("all positions are >= 1", () => {
    const history = generatePositionHistory(1, deterministicRng);
    for (const entry of history) {
      expect(entry.position).toBeGreaterThanOrEqual(1);
    }
  });

  it("includes recognizable month labels", () => {
    const history = generatePositionHistory(3, deterministicRng);
    const months = history.map((h) => h.month);
    expect(months).toEqual(["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"]);
  });

  it("uses default Math.random when no rng provided", () => {
    const history = generatePositionHistory(4);
    expect(history).toHaveLength(6);
    expect(history[history.length - 1].position).toBe(4);
  });
});

// ====================================================================
// getRecommendation
// ====================================================================

describe("getRecommendation", () => {
  it("rojo + gap > 10 → 'Bajar precio'", () => {
    const prop = makeProp({ semaforo: "rojo", gapPrecio: 15, diasSinLlamadas: 40 });
    const rec = getRecommendation(prop);
    expect(rec.action).toBe("Bajar precio");
    expect(rec.colorToken).toBe("danger");
    expect(rec.text).toContain("reducirse");
    expect(rec.text).toContain(prop.zona);
  });

  it("rojo + gap <= 10 → 'Reposicionar'", () => {
    const prop = makeProp({
      semaforo: "rojo",
      gapPrecio: 5,
      diasSinLlamadas: 30,
      posicionPortal: 14,
    });
    const rec = getRecommendation(prop);
    expect(rec.action).toBe("Reposicionar");
    expect(rec.colorToken).toBe("danger");
    expect(rec.text).toContain("retirar temporalmente");
  });

  it("amarillo → 'Mejorar fotos'", () => {
    const prop = makeProp({
      semaforo: "amarillo",
      gapPrecio: 6,
      posicionPortal: 8,
    });
    const rec = getRecommendation(prop);
    expect(rec.action).toBe("Mejorar fotos");
    expect(rec.colorToken).toBe("warning");
    expect(rec.text).toContain("fotografía profesional");
  });

  it("verde → 'Mantener estrategia'", () => {
    const prop = makeProp({ semaforo: "verde", gapPrecio: -2, posicionPortal: 2 });
    const rec = getRecommendation(prop);
    expect(rec.action).toBe("Mantener estrategia");
    expect(rec.colorToken).toBe("success");
    expect(rec.text).toContain("bien posicionada");
  });

  it("includes property-specific values in text", () => {
    const prop = makeProp({
      semaforo: "rojo",
      gapPrecio: 12.5,
      precio: 400000,
      metros: 100,
      zona: "Carmen",
      diasSinLlamadas: 25,
    });
    const rec = getRecommendation(prop);
    expect(rec.text).toContain("12.5%");
    expect(rec.text).toContain("Carmen");
    expect(rec.text).toContain("25 días");
  });
});

// ====================================================================
// computeSemaforoStatus
// ====================================================================

describe("computeSemaforoStatus", () => {
  it("returns rojo for gap > 10", () => {
    expect(computeSemaforoStatus(11, 1, 0)).toBe("rojo");
  });

  it("returns rojo for high position + high days", () => {
    expect(computeSemaforoStatus(2, 11, 21)).toBe("rojo");
  });

  it("returns amarillo for moderate gap", () => {
    expect(computeSemaforoStatus(5, 3, 2)).toBe("amarillo");
  });

  it("returns amarillo for moderate position", () => {
    expect(computeSemaforoStatus(1, 7, 2)).toBe("amarillo");
  });

  it("returns amarillo for moderate days without calls", () => {
    expect(computeSemaforoStatus(1, 3, 12)).toBe("amarillo");
  });

  it("returns verde for good metrics", () => {
    expect(computeSemaforoStatus(-2, 3, 5)).toBe("verde");
  });

  it("returns verde at threshold boundaries", () => {
    expect(computeSemaforoStatus(3, 5, 10)).toBe("verde");
  });
});

// ====================================================================
// computePortfolioStats
// ====================================================================

describe("computePortfolioStats", () => {
  it("returns zeroes for empty array", () => {
    const stats = computePortfolioStats([]);
    expect(stats.total).toBe(0);
    expect(stats.verde).toBe(0);
    expect(stats.avgGap).toBe(0);
  });

  it("counts semáforo categories correctly", () => {
    const props = [
      makeProp({ semaforo: "verde" }),
      makeProp({ semaforo: "verde" }),
      makeProp({ semaforo: "amarillo" }),
      makeProp({ semaforo: "rojo", gapPrecio: 15, diasSinLlamadas: 40 }),
    ];
    const stats = computePortfolioStats(props);
    expect(stats.total).toBe(4);
    expect(stats.verde).toBe(2);
    expect(stats.amarillo).toBe(1);
    expect(stats.rojo).toBe(1);
  });

  it("identifies burned properties (rojo OR high gap + high days)", () => {
    const props = [
      makeProp({ semaforo: "rojo", gapPrecio: 5, diasSinLlamadas: 10 }),
      makeProp({ semaforo: "amarillo", gapPrecio: 12, diasSinLlamadas: 25 }),
      makeProp({ semaforo: "verde", gapPrecio: -2, diasSinLlamadas: 2 }),
    ];
    const stats = computePortfolioStats(props);
    expect(stats.burned).toBe(2);
  });

  it("computes correct averages", () => {
    const props = [
      makeProp({ precio: 200000, metros: 100, gapPrecio: 4, posicionPortal: 2 }),
      makeProp({ precio: 400000, metros: 100, gapPrecio: -2, posicionPortal: 8 }),
    ];
    const stats = computePortfolioStats(props);
    expect(stats.avgGap).toBe(1);
    expect(stats.avgPosition).toBe(5);
    expect(stats.avgPrice).toBe(300000);
    expect(stats.avgPricePerM2).toBe(3000);
  });

  it("handles single property", () => {
    const props = [makeProp({ precio: 150000, metros: 50, gapPrecio: 3 })];
    const stats = computePortfolioStats(props);
    expect(stats.total).toBe(1);
    expect(stats.avgPrice).toBe(150000);
    expect(stats.avgPricePerM2).toBe(3000);
  });
});
