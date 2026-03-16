import { describe, it, expect } from "vitest";
import { selectBestAgent } from "@/lib/routing/select-agent";
import type { AgentProfile, RoutingInput } from "@/lib/routing/types";

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

describe("selectBestAgent", () => {
  it("selects agent matching city", () => {
    const agents = [
      makeAgent({ id: "a1", ciudad: "Córdoba" }),
      makeAgent({ id: "a2", ciudad: "Málaga" }),
    ];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    expect(result.assigned).toBe(true);
    expect(result.agent!.id).toBe("a1");
  });

  it("returns not assigned when no agents in city", () => {
    const agents = [makeAgent({ ciudad: "Málaga" })];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    expect(result.assigned).toBe(false);
    expect(result.agent).toBeNull();
    expect(result.reason).toContain("Córdoba");
  });

  it("filters out inactive agents", () => {
    const agents = [
      makeAgent({ id: "a1", activo: false }),
      makeAgent({ id: "a2", activo: true, cargaActual: 10 }),
    ];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    expect(result.assigned).toBe(true);
    expect(result.agent!.id).toBe("a2");
  });

  it("filters out agents at max capacity", () => {
    const agents = [
      makeAgent({ id: "a1", cargaActual: 20, cargaMaxima: 20 }),
      makeAgent({ id: "a2", cargaActual: 19, cargaMaxima: 20 }),
    ];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    expect(result.assigned).toBe(true);
    expect(result.agent!.id).toBe("a2");
  });

  it("prefers agent with more available capacity", () => {
    const agents = [
      makeAgent({ id: "a1", cargaActual: 15, cargaMaxima: 20, tasaConversion: 0.3 }),
      makeAgent({ id: "a2", cargaActual: 2, cargaMaxima: 20, tasaConversion: 0.3 }),
    ];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    expect(result.agent!.id).toBe("a2");
  });

  it("balances capacity with conversion rate", () => {
    const agents = [
      makeAgent({ id: "a1", cargaActual: 10, cargaMaxima: 20, tasaConversion: 0.8 }),
      makeAgent({ id: "a2", cargaActual: 2, cargaMaxima: 20, tasaConversion: 0.1 }),
    ];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    // a1: capacity=0.5*0.6=0.30, conversion=0.8*0.4=0.32 => 0.62
    // a2: capacity=0.9*0.6=0.54, conversion=0.1*0.4=0.04 => 0.58
    expect(result.agent!.id).toBe("a1");
  });

  it("gives specialty bonus when matching", () => {
    const agents = [
      makeAgent({ id: "a1", cargaActual: 5, tasaConversion: 0.3, especialidad: "comprador" }),
      makeAgent({ id: "a2", cargaActual: 5, tasaConversion: 0.3, especialidad: "general" }),
    ];
    const result = selectBestAgent(agents, {
      ciudad: "Córdoba",
      especialidad: "comprador",
    });
    expect(result.agent!.id).toBe("a1");
  });

  it("city match is case-insensitive", () => {
    const agents = [makeAgent({ ciudad: "córdoba" })];
    const result = selectBestAgent(agents, { ciudad: "CÓRDOBA" });
    expect(result.assigned).toBe(true);
  });

  it("returns empty list reason when agents array is empty", () => {
    const result = selectBestAgent([], { ciudad: "Córdoba" });
    expect(result.assigned).toBe(false);
    expect(result.agent).toBeNull();
  });

  it("reason string includes agent name and stats", () => {
    const agents = [makeAgent({ nombre: "Pedro López" })];
    const result = selectBestAgent(agents, { ciudad: "Córdoba" });
    expect(result.reason).toContain("Pedro López");
    expect(result.reason).toContain("Córdoba");
  });
});
