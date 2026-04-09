import { describe, it, expect, vi } from "vitest";
import type { EventRecord } from "@/lib/event-store/types";
import type { AgentProfile } from "@/lib/routing/types";
import type { HistorySignals } from "@/lib/scoring/types";
import {
  handleLeadIngestadoCore,
  buildScoringInput,
  buildRoutingInput,
  detectMessageKeywords,
} from "../lead-scoring-handler";
import type { LeadHandlerDeps } from "../lead-scoring-handler";

function makeLeadEvent(
  payload: Record<string, unknown>,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    id: "evt-lead-001",
    position: BigInt(1),
    type: "LEAD_INGESTADO",
    aggregateType: "LEAD",
    aggregateId: "lead-123",
    version: null,
    payload: payload as EventRecord["payload"],
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-03-16T08:00:00Z"),
    createdAt: new Date("2026-03-16T08:00:00Z"),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "agent-1",
    nombre: "Ana García",
    telefono: "+34600000001",
    email: "ana@urus.es",
    ciudad: "Córdoba",
    especialidad: "general",
    activo: true,
    cargaActual: 5,
    cargaMaxima: 20,
    leadsAsignados: 50,
    leadsCerrados: 15,
    tasaConversion: 0.3,
    ...overrides,
  };
}

const EMPTY_HISTORY: HistorySignals = {
  whatsappTurnCount: 0,
  visitaInteres: null,
  micrositeInteresCount: 0,
};

function makeDeps(
  agents: AgentProfile[],
  incrementLoad?: LeadHandlerDeps["incrementLoad"],
): LeadHandlerDeps {
  return {
    fetchAgents: async () => agents,
    incrementLoad: incrementLoad ?? (async () => {}),
    fetchHistory: async () => EMPTY_HISTORY,
  };
}

describe("buildScoringInput", () => {
  it("defaults to comprador when tipo is missing", () => {
    const input = buildScoringInput({});
    expect(input.tipo).toBe("comprador");
  });

  it("maps propietario tipo correctly", () => {
    const input = buildScoringInput({ tipo: "propietario" });
    expect(input.tipo).toBe("propietario");
  });

  it("maps boolean signals from payload", () => {
    const input = buildScoringInput({
      tipo: "comprador",
      preaprobacionHipotecaria: true,
      referido: true,
      plazoDias: 15,
    });
    expect(input.preaprobacionHipotecaria).toBe(true);
    expect(input.referido).toBe(true);
    expect(input.plazoDias).toBe(15);
  });
});

describe("buildRoutingInput", () => {
  it("extracts ciudad from payload", () => {
    const input = buildRoutingInput({ ciudad: "Córdoba" });
    expect(input.ciudad).toBe("Córdoba");
  });

  it("defaults ciudad to empty string", () => {
    const input = buildRoutingInput({});
    expect(input.ciudad).toBe("");
  });

  it("extracts especialidad when present", () => {
    const input = buildRoutingInput({ especialidad: "comprador" });
    expect(input.especialidad).toBe("comprador");
  });
});

describe("handleLeadIngestadoCore", () => {
  it("score alto + agente disponible => NOTIFY con agente asignado", async () => {
    const agent = makeAgent({ id: "ag-1", nombre: "Pedro" });
    const event = makeLeadEvent({
      tipo: "comprador",
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
      mensajeConDetalles: true,
      plazoDias: 20,
      ciudad: "Córdoba",
    });

    const result = await handleLeadIngestadoCore(event, makeDeps([agent]));

    expect(result.success).toBe(true);
    const notifyJob = result.followUpJobs!.find(
      (j) => j.type === "NOTIFY_LEAD_WHATSAPP",
    );
    expect(notifyJob).toBeDefined();
    expect((notifyJob!.payload as Record<string, unknown>).assignedAgentId).toBe("ag-1");
    expect((notifyJob!.payload as Record<string, unknown>).assignedAgentNombre).toBe("Pedro");
    expect(result.scoredPayload!.routingAssigned).toBe(true);
  });

  it("score alto + sin agentes => NOTIFY sin agente, routingAssigned=false", async () => {
    const event = makeLeadEvent({
      tipo: "comprador",
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
      plazoDias: 10,
      ciudad: "Sevilla",
    });

    const result = await handleLeadIngestadoCore(event, makeDeps([]));

    const notifyJob = result.followUpJobs!.find(
      (j) => j.type === "NOTIFY_LEAD_WHATSAPP",
    );
    expect(notifyJob).toBeDefined();
    expect((notifyJob!.payload as Record<string, unknown>).assignedAgentId).toBeNull();
    expect(result.scoredPayload!.routingAssigned).toBe(false);
  });

  it("score bajo (solo mirando) => FOLLOW_UP con agentId null si no hay ciudad", async () => {
    const event = makeLeadEvent({ tipo: "comprador", soloMirando: true });

    const result = await handleLeadIngestadoCore(event, makeDeps([]));

    const followUps = result.followUpJobs!.filter(
      (j) => j.type === "FOLLOW_UP_LEAD",
    );
    expect(followUps).toHaveLength(3);
    expect((followUps[0].payload as Record<string, unknown>).assignedAgentId).toBeNull();
    expect(result.scoredPayload!.routingReason).toBe("Sin ciudad en el payload del lead");
  });

  it("score bajo + ciudad + agente => FOLLOW_UP con agentId del asignado", async () => {
    const agent = makeAgent({ id: "ag-2" });
    const event = makeLeadEvent({
      tipo: "comprador",
      soloMirando: true,
      ciudad: "Córdoba",
    });

    const result = await handleLeadIngestadoCore(event, makeDeps([agent]));

    const followUps = result.followUpJobs!.filter(
      (j) => j.type === "FOLLOW_UP_LEAD",
    );
    expect(followUps).toHaveLength(3);
    expect((followUps[0].payload as Record<string, unknown>).assignedAgentId).toBe("ag-2");
  });

  it("propietario con urgencia + exclusiva + agente => asignado", async () => {
    const agent = makeAgent({ id: "ag-3", ciudad: "Málaga" });
    const event = makeLeadEvent({
      tipo: "propietario",
      urgenciaVenta: true,
      exclusivaAceptable: true,
      precioCercanoMercado: true,
      documentacionDisponible: true,
      ciudad: "Málaga",
    });

    const result = await handleLeadIngestadoCore(event, makeDeps([agent]));

    expect(result.scoredPayload!.routingAssigned).toBe(true);
    expect(result.scoredPayload!.assignedAgentId).toBe("ag-3");
  });

  it("follow-up jobs have scheduled availableAt based on occurredAt", async () => {
    const occurredAt = new Date("2026-03-16T10:00:00Z");
    const event = makeLeadEvent(
      { tipo: "comprador", soloMirando: true },
      { occurredAt },
    );

    const result = await handleLeadIngestadoCore(event, makeDeps([]));

    const followUps = result.followUpJobs!.filter(
      (j) => j.type === "FOLLOW_UP_LEAD",
    );

    const d1 = new Date(occurredAt.getTime() + 86_400_000);
    const d3 = new Date(occurredAt.getTime() + 3 * 86_400_000);
    const d7 = new Date(occurredAt.getTime() + 7 * 86_400_000);

    expect(followUps[0].availableAt).toEqual(d1);
    expect(followUps[1].availableAt).toEqual(d3);
    expect(followUps[2].availableAt).toEqual(d7);
  });

  it("empty payload defaults to comprador with base score", async () => {
    const event = makeLeadEvent({});
    const result = await handleLeadIngestadoCore(event, makeDeps([]));

    expect(result.success).toBe(true);
    expect(result.scoredPayload!.score).toBeGreaterThanOrEqual(0);
    expect(result.scoredPayload!.score).toBeLessThanOrEqual(100);
  });

  it("incrementa carga del comercial al asignar lead", async () => {
    const incrementLoad = vi.fn(async () => {});
    const agent = makeAgent({ id: "ag-inc", nombre: "Luis" });
    const event = makeLeadEvent({
      tipo: "comprador",
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
      ciudad: "Córdoba",
    });

    await handleLeadIngestadoCore(event, makeDeps([agent], incrementLoad));

    expect(incrementLoad).toHaveBeenCalledWith("ag-inc");
    expect(incrementLoad).toHaveBeenCalledTimes(1);
  });

  it("no incrementa carga si no hay agente asignado", async () => {
    const incrementLoad = vi.fn(async () => {});
    const event = makeLeadEvent({
      tipo: "comprador",
      soloMirando: true,
      ciudad: "Sevilla",
    });

    await handleLeadIngestadoCore(event, makeDeps([], incrementLoad));

    expect(incrementLoad).not.toHaveBeenCalled();
  });

  it("no bloquea el flujo si incrementAgentLoad falla", async () => {
    const incrementLoad = vi.fn(async () => {
      throw new Error("DB connection lost");
    });
    const agent = makeAgent({ id: "ag-fail" });
    const event = makeLeadEvent({
      tipo: "comprador",
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
      ciudad: "Córdoba",
    });

    const result = await handleLeadIngestadoCore(
      event,
      makeDeps([agent], incrementLoad),
    );

    expect(result.success).toBe(true);
    expect(incrementLoad).toHaveBeenCalledWith("ag-fail");
  });

  it("no bloquea el flujo si fetchHistory falla", async () => {
    const event = makeLeadEvent({ tipo: "comprador", ciudad: "Córdoba" });
    const deps: LeadHandlerDeps = {
      fetchAgents: async () => [makeAgent()],
      incrementLoad: async () => {},
      fetchHistory: async () => { throw new Error("DB down"); },
    };

    const result = await handleLeadIngestadoCore(event, deps);
    expect(result.success).toBe(true);
  });
});

describe("buildScoringInput v2 fields", () => {
  it("extracts source from payload", () => {
    const input = buildScoringInput({ source: "idealista" });
    expect(input.source).toBe("idealista");
  });

  it("calculates mensajeLongitud and keywords from mensajeRaw", () => {
    const input = buildScoringInput({
      mensajeRaw: "Busco urgente un piso en zona centro, presupuesto 200k",
    });
    expect(input.mensajeLongitud).toBe(54);
    expect(input.mensajeKeywords).toContain("urgencia");
    expect(input.mensajeKeywords).toContain("zona");
    expect(input.mensajeKeywords).toContain("presupuesto");
  });

  it("passes historySignals when provided", () => {
    const hist: HistorySignals = {
      whatsappTurnCount: 4,
      visitaInteres: "alto",
      micrositeInteresCount: 2,
    };
    const input = buildScoringInput({}, hist);
    expect(input.historySignals).toEqual(hist);
  });
});

describe("detectMessageKeywords", () => {
  it("detects presupuesto keyword", () => {
    expect(detectMessageKeywords("Mi presupuesto es 200.000€")).toContain("presupuesto");
  });

  it("detects zona keyword", () => {
    expect(detectMessageKeywords("Busco en zona norte")).toContain("zona");
  });

  it("detects urgencia keyword", () => {
    expect(detectMessageKeywords("Necesito algo urgente")).toContain("urgencia");
  });

  it("detects euro amounts as presupuesto", () => {
    expect(detectMessageKeywords("Tengo 300.000€ disponibles")).toContain("presupuesto");
  });

  it("returns empty for generic message", () => {
    expect(detectMessageKeywords("Hola buenas")).toEqual([]);
  });
});
