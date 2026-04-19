/**
 * Regression test for C6 (audit-produccion-v1): el join
 * CommercialLeadFact ↔ CommercialOperationFact debe etiquetar como `closed: true`
 * los leads cuyo `inmovillaDemandId` coincide con el `demandId` de una operación cerrada.
 *
 * Antes del fix, `CommercialLeadFact.leadId` (`lead-${uuid}`) se comparaba contra
 * `CommercialOperationFact.demandId` (código Inmovilla) → nunca matcheaba → todos
 * los samples salían con `closed: false`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commercialLeadFact: {
      findMany: vi.fn(),
    },
    commercialOperationFact: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { collectLabeledSamples } from "../recalibration";
import {
  fetchHistoricalStats,
  invalidateHistoricalStatsCache,
} from "../historical-stats";

const mockLeadFindMany = vi.mocked(prisma.commercialLeadFact.findMany);
const mockOpFindMany = vi.mocked(prisma.commercialOperationFact.findMany);

beforeEach(() => {
  mockLeadFindMany.mockReset();
  mockOpFindMany.mockReset();
  invalidateHistoricalStatsCache();
});

describe("collectLabeledSamples — join CommercialLeadFact ↔ CommercialOperationFact", () => {
  it("marca como closed=true los leads cuyo inmovillaDemandId matchea una operación cerrada", async () => {
    const leadRaw = {
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
    };

    mockLeadFindMany.mockResolvedValue([
      {
        leadId: "lead-aaaa1111bbbb",
        inmovillaDemandId: "12345",
        raw: leadRaw,
        tipo: "comprador",
      },
      {
        leadId: "lead-cccc2222dddd",
        inmovillaDemandId: "67890",
        raw: leadRaw,
        tipo: "comprador",
      },
      {
        leadId: "lead-eeee3333ffff",
        inmovillaDemandId: null,
        raw: leadRaw,
        tipo: "comprador",
      },
    ] as any);

    mockOpFindMany.mockResolvedValue([
      { demandId: "12345" },
      { demandId: "99999" },
    ] as any);

    const samples = await collectLabeledSamples();

    expect(samples).toHaveLength(3);
    expect(samples[0].closed).toBe(true);
    expect(samples[1].closed).toBe(false);
    expect(samples[2].closed).toBe(false);
  });

  it("NO usa leadId (lead-xxx) para el join — debe usar inmovillaDemandId", async () => {
    // Regression: si el join comparara leadId con demandId, este lead saldría como closed=true.
    mockLeadFindMany.mockResolvedValue([
      {
        leadId: "lead-12345",
        inmovillaDemandId: null,
        raw: { preaprobacionHipotecaria: true },
        tipo: "comprador",
      },
    ] as any);

    mockOpFindMany.mockResolvedValue([{ demandId: "lead-12345" }] as any);

    const samples = await collectLabeledSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].closed).toBe(false);
  });

  it("ignora demandId null/vacío en CommercialOperationFact", async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        leadId: "lead-abc",
        inmovillaDemandId: "555",
        raw: {},
        tipo: "comprador",
      },
    ] as any);

    mockOpFindMany.mockResolvedValue([
      { demandId: null },
      { demandId: "" },
      { demandId: "555" },
    ] as any);

    const samples = await collectLabeledSamples();
    expect(samples[0].closed).toBe(true);
  });
});

describe("fetchHistoricalStats — conversion rates vía inmovillaDemandId", () => {
  it("cuenta correctamente conversionRateBySource cuando el join es por inmovillaDemandId", async () => {
    // Ciudades distintas para no mezclar con el fallback legacy por ciudad.
    mockLeadFindMany.mockResolvedValue([
      {
        leadId: "lead-1",
        inmovillaDemandId: "100",
        score: 80,
        ciudad: "Madrid",
        source: "web",
      },
      {
        leadId: "lead-2",
        inmovillaDemandId: "200",
        score: 40,
        ciudad: "Valencia",
        source: "web",
      },
      {
        leadId: "lead-3",
        inmovillaDemandId: null,
        score: 10,
        ciudad: "Barcelona",
        source: "referido",
      },
    ] as any);

    mockOpFindMany.mockResolvedValue([
      { demandId: "100", ciudad: "Madrid" },
    ] as any);

    const stats = await fetchHistoricalStats();

    expect(stats.totalClosedLeads).toBe(1);
    expect(stats.totalOpenLeads).toBe(2);

    // Source "web" tuvo 2 leads; solo lead-1 matchea por demandId → 1/2 = 0.5.
    // Este ratio depende EXCLUSIVAMENTE del join directo, no del fallback por ciudad.
    expect(stats.conversionRateBySource["web"]).toBeCloseTo(0.5, 2);

    // Source "referido" no tuvo ningún match → 0.
    expect(stats.conversionRateBySource["referido"]).toBe(0);
  });

  it("sin matches de inmovillaDemandId, no cuenta ningún cierre por source (regresión: antes TODO salía 0)", async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        leadId: "lead-1",
        inmovillaDemandId: "111",
        score: 50,
        ciudad: "Sevilla",
        source: "web",
      },
    ] as any);

    mockOpFindMany.mockResolvedValue([
      { demandId: "999", ciudad: "Madrid" },
    ] as any);

    const stats = await fetchHistoricalStats();
    expect(stats.conversionRateBySource["web"]).toBe(0);
  });
});
