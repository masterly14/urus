import { describe, it, expect } from "vitest";
import { calculateScoreSync } from "@/lib/scoring";

describe("calculateScore (MVP rules)", () => {
  it("comprador con preaprobación + presupuesto + mensaje + plazo corto => score >= 80", () => {
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
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('comprador "solo mirando" penalizado', () => {
    const res = calculateScoreSync({ tipo: "comprador", soloMirando: true });
    expect(res.reasons).toContain('"Solo estoy mirando" -20' || '"Solo estoy mirando" -20');
    expect(res.score).toBeLessThan(40);
  });

  it("propietario urgente con exclusiva => score alto", () => {
    const res = calculateScoreSync({
      tipo: "propietario",
      urgenciaVenta: true,
      exclusivaAceptable: true,
      precioCercanoMercado: true,
      documentacionDisponible: true,
    });
    expect(res.score).toBeGreaterThanOrEqual(70);
  });

  it('propietario "probar sin agencia" penalizado', () => {
    const res = calculateScoreSync({ tipo: "propietario", probarSinAgencia: true });
    expect(res.reasons).toContain('"Probar sin agencia" -25' || '"Probar sin agencia" -25');
    expect(res.score).toBeLessThan(50);
  });

  it("sin señales devuelve score razonable (>=0 <=100)", () => {
    const res = calculateScoreSync({ tipo: "comprador" });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });
});
