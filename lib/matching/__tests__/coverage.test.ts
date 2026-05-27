/**
 * Tests unitarios para evaluación de cobertura de demanda.
 *
 * Mock de Prisma para evitar dependencia de BD.
 * Escenarios: 0 matches, todos <60, hay >=60, demanda inexistente.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeMatchScore, DEFAULT_CONFIG } from "../scoring";
import { passesHardFilters } from "../match-demands";
import type { PropertyForMatching, DemandForMatching } from "../types";

const {
  mockDemandFindUnique,
  mockPropertyFindMany,
  mockMarketZoneAliasFindMany,
  mockMarketZoneProfileFindMany,
  mockMarketZoneRelationFindMany,
  mockInmovillaEnumCiudadFindUnique,
} = vi.hoisted(() => ({
  mockDemandFindUnique: vi.fn(),
  mockPropertyFindMany: vi.fn(),
  mockMarketZoneAliasFindMany: vi.fn(),
  mockMarketZoneProfileFindMany: vi.fn(),
  mockMarketZoneRelationFindMany: vi.fn(),
  mockInmovillaEnumCiudadFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: { findUnique: mockDemandFindUnique },
    propertyCurrent: { findMany: mockPropertyFindMany },
    marketZoneAlias: { findMany: mockMarketZoneAliasFindMany },
    marketZoneProfile: { findMany: mockMarketZoneProfileFindMany },
    marketZoneRelation: { findMany: mockMarketZoneRelationFindMany },
    inmovillaEnumCiudad: { findUnique: mockInmovillaEnumCiudadFindUnique },
  },
}));

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
// passesHardFilters (ahora exportada)
// ══════════════════════════════════════════════════════════════════════════════

describe("passesHardFilters", () => {
  it("rechaza tipología incompatible", () => {
    const prop = makeProperty({ tipoOfer: "Piso" });
    const demand = makeDemand({ tipos: "Casa, Chalet" });
    expect(passesHardFilters(prop, demand)).toBe(false);
  });

  it("acepta tipología compatible", () => {
    const prop = makeProperty({ tipoOfer: "Piso" });
    const demand = makeDemand({ tipos: "Piso, Ático" });
    expect(passesHardFilters(prop, demand)).toBe(true);
  });

  it("acepta cuando la demanda no define tipos", () => {
    const prop = makeProperty({ tipoOfer: "Piso" });
    const demand = makeDemand({ tipos: "" });
    expect(passesHardFilters(prop, demand)).toBe(true);
  });

  it("acepta cuando la demanda no tiene tipoOperacion definido", () => {
    const prop = makeProperty({ tipoOfer: "Piso" });
    const demand = makeDemand({ tipoOperacion: undefined });
    expect(passesHardFilters(prop, demand)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// COVERAGE_MIN_SCORE
// ══════════════════════════════════════════════════════════════════════════════

describe("COVERAGE_MIN_SCORE", () => {
  it("exporta un valor numérico >= 0", async () => {
    const { COVERAGE_MIN_SCORE } = await import("../coverage");
    expect(typeof COVERAGE_MIN_SCORE).toBe("number");
    expect(COVERAGE_MIN_SCORE).toBeGreaterThanOrEqual(0);
  });

  it("valor por defecto es 60", async () => {
    const { COVERAGE_MIN_SCORE } = await import("../coverage");
    expect(COVERAGE_MIN_SCORE).toBe(60);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Coverage scoring scenarios (sin BD, puro scoring)
// ══════════════════════════════════════════════════════════════════════════════

describe("coverage scoring scenarios", () => {
  const config = DEFAULT_CONFIG;

  it("match perfecto: zona+tipo+precio+tamaño+habitaciones → score >= 60", () => {
    const prop = makeProperty();
    const demand = makeDemand();
    const { totalScore, isMatch } = computeMatchScore(prop, demand, config);
    expect(totalScore).toBeGreaterThanOrEqual(60);
    expect(isMatch).toBe(true);
  });

  it("zona y precio muy diferentes: score cae por debajo de 60", () => {
    const prop = makeProperty({ zona: "Periferia Norte", precio: 450_000 });
    const demand = makeDemand({ zonas: "Centro", presupuestoMax: 200_000 });
    const { totalScore } = computeMatchScore(prop, demand, config);
    expect(totalScore).toBeLessThan(60);
  });

  it("precio extremamente fuera de rango: score baja drásticamente", () => {
    const prop = makeProperty({ precio: 800_000, zona: "Las Afueras" });
    const demand = makeDemand({ presupuestoMax: 200_000, zonas: "Centro" });
    const { totalScore } = computeMatchScore(prop, demand, config);
    expect(totalScore).toBeLessThan(50);
  });

  it("sin presupuesto definido: se puede calcular score", () => {
    const prop = makeProperty();
    const demand = makeDemand({
      presupuestoMin: 0,
      presupuestoMax: 0,
      zonas: "",
      tipos: "",
      habitacionesMin: 0,
    });
    const result = computeMatchScore(prop, demand, config);
    expect(typeof result.totalScore).toBe("number");
  });
});

describe("evaluateDemandCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarketZoneAliasFindMany.mockResolvedValue([]);
    mockMarketZoneProfileFindMany.mockResolvedValue([]);
    mockMarketZoneRelationFindMany.mockResolvedValue([]);
    mockInmovillaEnumCiudadFindUnique.mockResolvedValue(null);
  });

  function mockDemandRow(overrides: Record<string, unknown> = {}) {
    mockDemandFindUnique.mockResolvedValue({
      codigo: "D-001",
      ref: "REF-D001",
      nombre: "Familia Martínez",
      presupuestoMin: 200_000,
      presupuestoMax: 300_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Fuensanta, Arcángel, Santuario - Cordoba",
      metrosMin: null,
      metrosMax: null,
      tipoOperacion: null,
      ...overrides,
    });
  }

  function mockPropertyRows(rows: Array<Record<string, unknown>>) {
    mockPropertyFindMany.mockResolvedValue(rows);
  }

  it("no considera cubierta una demanda por candidatos bloqueados geográficamente", async () => {
    const { evaluateDemandCoverage } = await import("../coverage");
    mockDemandRow();
    mockPropertyRows([
      {
        codigo: "P-001",
        ref: "PROP-001",
        titulo: "Piso fuera de zona",
        tipoOfer: "Piso",
        precio: 250_000,
        metrosConstruidos: 90,
        habitaciones: 3,
        ciudad: "Córdoba",
        zona: "Andalucia",
      },
    ]);

    const result = await evaluateDemandCoverage("D-001");

    expect(result?.bestScore).toBe(0);
    expect(result?.topMatch).toBeNull();
    expect(result?.totalCandidates).toBe(1);
  });

  it("mantiene el mejor score cuando la zona sí es compatible", async () => {
    const { evaluateDemandCoverage } = await import("../coverage");
    mockDemandRow({ zonas: "Fuensanta" });
    mockPropertyRows([
      {
        codigo: "P-001",
        ref: "PROP-001",
        titulo: "Piso en Fuensanta",
        tipoOfer: "Piso",
        precio: 250_000,
        metrosConstruidos: 90,
        habitaciones: 3,
        ciudad: "Córdoba",
        zona: "Fuensanta",
      },
    ]);

    const result = await evaluateDemandCoverage("D-001");

    expect(result?.bestScore).toBeGreaterThanOrEqual(60);
    expect(result?.topMatch?.propertyId).toBe("P-001");
  });
});
