import { describe, it, expect } from "vitest";
import { calculateScoreSync } from "@/lib/scoring";
import { computePoints } from "@/lib/scoring/rules";

describe("calculateScore (MVP rules)", () => {
  it("comprador con preaprobación + presupuesto + mensaje + plazo corto => score moderado-alto", () => {
    const input = {
      tipo: "comprador" as const,
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
      mensajeConDetalles: true,
      plazoDias: 20,
      referido: false,
      soloMirando: false,
    };

    const res = calculateScoreSync(input);
    expect(res.score).toBeGreaterThanOrEqual(40);
    expect(res.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('comprador "solo mirando" penalizado', () => {
    const res = calculateScoreSync({ tipo: "comprador", soloMirando: true });
    expect(res.reasons.some((r) => r.includes("Solo estoy mirando"))).toBe(true);
    expect(res.score).toBeLessThan(40);
  });

  it("propietario urgente con exclusiva => score moderado-alto", () => {
    const res = calculateScoreSync({
      tipo: "propietario",
      urgenciaVenta: true,
      exclusivaAceptable: true,
      precioCercanoMercado: true,
      documentacionDisponible: true,
    });
    expect(res.score).toBeGreaterThanOrEqual(45);
  });

  it('propietario "probar sin agencia" penalizado', () => {
    const res = calculateScoreSync({ tipo: "propietario", probarSinAgencia: true });
    expect(res.reasons.some((r) => r.includes("Probar sin agencia"))).toBe(true);
    expect(res.score).toBeLessThan(50);
  });

  it("sin señales devuelve score razonable (>=0 <=100)", () => {
    const res = calculateScoreSync({ tipo: "comprador" });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });
});

describe("scoring v2: source bonus", () => {
  it("referido suma puntos en pclose", () => {
    const raw = computePoints({ tipo: "comprador", source: "referido" });
    expect(raw.pclose).toBeGreaterThan(0);
    expect(raw.reasons.some((r) => r.includes("Origen"))).toBe(true);
  });

  it("idealista suma +5 en pclose", () => {
    const raw = computePoints({ tipo: "comprador", source: "idealista" });
    expect(raw.pclose).toBe(5);
  });

  it("source desconocido no suma nada", () => {
    const raw = computePoints({ tipo: "comprador", source: "random_portal" });
    expect(raw.pclose).toBe(0);
  });

  it("propietario con source web_propia suma bonus", () => {
    const raw = computePoints({ tipo: "propietario", source: "web_propia" });
    expect(raw.pclose).toBe(10);
  });
});

describe("scoring v2: message quality", () => {
  it("mensaje largo (>150 chars) suma MSG_MUY_DETALLADO en value", () => {
    const raw = computePoints({
      tipo: "comprador",
      mensajeLongitud: 200,
    });
    expect(raw.value).toBeGreaterThan(0);
    expect(raw.reasons.some((r) => r.includes("Mensaje muy detallado"))).toBe(true);
  });

  it("mensaje medio (>50 chars) suma MSG_LARGO", () => {
    const raw = computePoints({
      tipo: "comprador",
      mensajeLongitud: 80,
    });
    expect(raw.value).toBeGreaterThan(0);
    expect(raw.reasons.some((r) => r.includes("contenido"))).toBe(true);
  });

  it("mensaje corto (<50 chars) no suma bonus", () => {
    const raw = computePoints({
      tipo: "comprador",
      mensajeLongitud: 20,
    });
    expect(raw.value).toBe(0);
  });

  it("keyword presupuesto suma value", () => {
    const raw = computePoints({
      tipo: "comprador",
      mensajeKeywords: ["presupuesto"],
    });
    expect(raw.value).toBe(8);
  });

  it("keyword urgencia suma urgency", () => {
    const raw = computePoints({
      tipo: "comprador",
      mensajeKeywords: ["urgencia"],
    });
    expect(raw.urgency).toBe(10);
  });

  it("múltiples keywords acumulan", () => {
    const raw = computePoints({
      tipo: "comprador",
      mensajeKeywords: ["presupuesto", "zona", "urgencia"],
    });
    expect(raw.value).toBe(8 + 5);
    expect(raw.urgency).toBe(10);
  });
});

describe("scoring v2: history signals", () => {
  it("2+ turnos WhatsApp suman HIST_WA_ENGAGED en pclose", () => {
    const raw = computePoints({
      tipo: "comprador",
      historySignals: { whatsappTurnCount: 3, visitaInteres: null, micrositeInteresCount: 0 },
    });
    expect(raw.pclose).toBe(10);
  });

  it("5+ turnos WhatsApp suman HIST_WA_VERY_ENGAGED (no acumula con engaged)", () => {
    const raw = computePoints({
      tipo: "comprador",
      historySignals: { whatsappTurnCount: 7, visitaInteres: null, micrositeInteresCount: 0 },
    });
    expect(raw.pclose).toBe(15);
  });

  it("visita con interés alto suma +20 pclose", () => {
    const raw = computePoints({
      tipo: "comprador",
      historySignals: { whatsappTurnCount: 0, visitaInteres: "alto", micrositeInteresCount: 0 },
    });
    expect(raw.pclose).toBe(20);
  });

  it("visita con interés medio suma +5 pclose", () => {
    const raw = computePoints({
      tipo: "comprador",
      historySignals: { whatsappTurnCount: 0, visitaInteres: "medio", micrositeInteresCount: 0 },
    });
    expect(raw.pclose).toBe(5);
  });

  it("microsite ME_INTERESA suma +10 value", () => {
    const raw = computePoints({
      tipo: "comprador",
      historySignals: { whatsappTurnCount: 0, visitaInteres: null, micrositeInteresCount: 2 },
    });
    expect(raw.value).toBe(10);
  });

  it("todas las señales combinadas suman correctamente", () => {
    const raw = computePoints({
      tipo: "comprador",
      source: "referido",
      mensajeLongitud: 200,
      mensajeKeywords: ["presupuesto", "zona"],
      historySignals: { whatsappTurnCount: 5, visitaInteres: "alto", micrositeInteresCount: 1 },
      preaprobacionHipotecaria: true,
      presupuestoDefinido: true,
    });
    expect(raw.pclose).toBe(20 + 15 + 20 + 25);
    expect(raw.value).toBe(10 + 8 + 5 + 10 + 15);
    expect(raw.reasons.length).toBeGreaterThanOrEqual(8);
  });
});
