import { describe, it, expect, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import type { AgentProfile } from "@/lib/routing/types";
import type { AIScoringResult } from "@/lib/scoring/ai-types";
import { handleLeadIngestadoCore } from "../lead-scoring-handler";
import type { LeadHandlerDeps } from "../lead-scoring-handler";

vi.mock("@/lib/scoring/historical-stats", () => ({
  fetchHistoricalStats: vi.fn().mockResolvedValue({
    conversionRateByCity: { "Córdoba": 0.25 },
    conversionRateBySource: {},
    avgScoreClosedLeads: 72,
    avgScoreOpenLeads: 35,
    totalClosedLeads: 10,
    totalOpenLeads: 40,
  }),
}));

vi.mock("@/lib/scoring/weights-loader", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/scoring/weights-loader")>();
  return {
    ...original,
    getActiveWeights: vi.fn().mockResolvedValue({
      pclose: 0.55,
      value: 0.3,
      urgency: 0.15,
      version: null,
    }),
  };
});

function makeEvent(payload: Record<string, unknown>): EventRecord {
  return {
    id: "evt-ai-001",
    position: BigInt(1),
    type: "LEAD_INGESTADO",
    aggregateType: "LEAD",
    aggregateId: "lead-ai-123",
    version: null,
    payload: payload as EventRecord["payload"],
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-04-05T08:00:00Z"),
    createdAt: new Date("2026-04-05T08:00:00Z"),
  };
}

function makeAgent(): AgentProfile {
  return {
    id: "ag-ai-1",
    nombre: "AI Test Agent",
    telefono: "+34600000099",
    email: "ai@urus.es",
    ciudad: "Córdoba",
    especialidad: "general",
    activo: true,
    cargaActual: 2,
    cargaMaxima: 20,
    leadsAsignados: 10,
    leadsCerrados: 3,
    tasaConversion: 0.3,
  };
}

const mockAIResult: AIScoringResult = {
  pcloseAdjustment: 10,
  valueAdjustment: 5,
  urgencyAdjustment: -5,
  qualitativeSignals: ["Tono urgente en mensaje"],
  confidence: 0.85,
  reasoning: "El comprador muestra urgencia implícita",
};

describe("handleLeadIngestadoCore with AI scoring", () => {
  it("blends AI adjustments when aiEnabled=true", async () => {
    const event = makeEvent({
      tipo: "comprador",
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
      plazoDias: 20,
      ciudad: "Córdoba",
      mensajeRaw: "Necesito comprar urgentemente",
    });

    const deps: LeadHandlerDeps = {
      fetchAgents: async () => [makeAgent()],
      incrementLoad: async () => {},
      aiEnabled: true,
      scoreWithAI: async () => mockAIResult,
    };

    const result = await handleLeadIngestadoCore(event, deps);

    expect(result.success).toBe(true);
    expect(result.scoredPayload!.aiScoringUsed).toBe(true);
    expect(result.scoredPayload!.aiConfidence).toBe(0.85);
    expect(result.scoredPayload!.reasons).toContain("[IA] Tono urgente en mensaje");
  });

  it("falls back to rules-only when AI throws", async () => {
    const event = makeEvent({
      tipo: "comprador",
      presupuestoDefinido: true,
      ciudad: "Córdoba",
    });

    const deps: LeadHandlerDeps = {
      fetchAgents: async () => [makeAgent()],
      incrementLoad: async () => {},
      aiEnabled: true,
      scoreWithAI: async () => {
        throw new Error("OpenAI timeout");
      },
    };

    const result = await handleLeadIngestadoCore(event, deps);

    expect(result.success).toBe(true);
    expect(result.scoredPayload!.aiScoringUsed).toBe(false);
    expect(result.scoredPayload!.aiConfidence).toBeNull();
  });

  it("skips AI when aiEnabled=false", async () => {
    const scoreWithAI = vi.fn();
    const event = makeEvent({
      tipo: "comprador",
      presupuestoDefinido: true,
      ciudad: "Córdoba",
    });

    const deps: LeadHandlerDeps = {
      fetchAgents: async () => [makeAgent()],
      incrementLoad: async () => {},
      aiEnabled: false,
      scoreWithAI,
    };

    const result = await handleLeadIngestadoCore(event, deps);

    expect(result.success).toBe(true);
    expect(scoreWithAI).not.toHaveBeenCalled();
    expect(result.scoredPayload!.aiScoringUsed).toBe(false);
  });
});
