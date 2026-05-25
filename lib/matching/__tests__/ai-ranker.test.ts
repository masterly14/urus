import { describe, expect, it } from "vitest";
import { buildCandidateExpansionSteps } from "../candidate-expansion";
import {
  rankPropertiesWithAI,
  validateAIRankerOutput,
  type AIRankerCandidate,
} from "../ai-ranker";
import type { DemandFilterInput } from "@/lib/statefox";
import type { LocationMatchContext } from "../types";

const demand: DemandFilterInput = {
  tipos: "Piso",
  zonas: "Fuensanta, Arcangel, Santuario - Cordoba",
  presupuestoMin: 120_000,
  presupuestoMax: 180_000,
  habitacionesMin: 2,
};

const location: LocationMatchContext = {
  demandCity: "Cordoba",
  exactZones: ["fuensanta", "arcangel", "santuario"],
  nearbyZones: ["cairo", "levante"],
  excludedZones: ["sevilla", "andalucia"],
};

function candidate(overrides: Partial<AIRankerCandidate> = {}): AIRankerCandidate {
  return {
    propertyId: "P-1",
    deterministicScore: 92,
    geoFit: "exact",
    title: "Piso en Fuensanta",
    city: "Cordoba",
    zone: "Fuensanta",
    price: 150_000,
    rooms: 3,
    metersBuilt: 80,
    imagesCount: 6,
    advertiserType: "professional",
    ...overrides,
  };
}

describe("ai-ranker", () => {
  it("rechaza IDs que no pertenecen al pool de candidatos", () => {
    expect(() =>
      validateAIRankerOutput(
        {
          selected: [
            {
              propertyId: "P-999",
              rank: 1,
              fitScore: 90,
              reason: "Inventado por la IA",
              risks: [],
            },
          ],
          rejected: [],
          needsMoreCandidates: false,
          buyerFacingSummary: "Resumen",
        },
        new Set(["P-1"]),
      ),
    ).toThrow(/unknown propertyId/);
  });

  it("usa fallback determinista sin OPENAI_API_KEY y no repite propiedades rechazadas", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await rankPropertiesWithAI({
        demandId: "D-1",
        demand,
        location,
        candidates: [
          candidate({ propertyId: "P-1", deterministicScore: 80 }),
          candidate({ propertyId: "P-2", deterministicScore: 95 }),
        ],
        feedback: { intent: "more_options", rejectedPropertyIds: ["P-2"] },
        minPreferredProperties: 2,
      });

      expect(result.fallbackApplied).toBe(true);
      expect(result.selected.map((item) => item.propertyId)).toEqual(["P-1"]);
      expect(result.rejected.map((item) => item.propertyId)).toEqual(["P-2"]);
      expect(result.needsMoreCandidates).toBe(true);
    } finally {
      if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("construye expansiones controladas sin borrar la zona de la demanda", () => {
    const steps = buildCandidateExpansionSteps(demand, location);
    expect(steps.map((step) => step.relaxation)).toEqual([
      "exact",
      "price",
      "nearby_zones",
      "nearby_zones_price",
    ]);
    expect(steps.every((step) => step.demand.zonas.trim().length > 0)).toBe(true);
    expect(steps.some((step) => step.demand.zonas.includes("levante"))).toBe(true);
  });
});

