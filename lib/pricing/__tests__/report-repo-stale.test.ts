import { describe, expect, it } from "vitest";
import { isStaleSinDatosRecommendation } from "../report-repo";

describe("isStaleSinDatosRecommendation", () => {
  const fallback = {
    accion: "mantener" as const,
    diagnostico:
      "No se encontraron comparables suficientes en el mercado para el inmueble X en Córdoba (Piso).",
    recomendaciones: [],
    precioSugeridoMin: null,
    precioSugeridoMax: null,
    argumentosComerciales: [],
    riesgos: [],
    confidence: 0.1,
    reasoning: "Fallback automático: semáforo sin_datos",
  };

  it("detecta fallback cuando el semáforo ya tiene datos", () => {
    expect(
      isStaleSinDatosRecommendation(
        {
          totalComparables: 29,
          precioMedioM2: 1200,
          precioMedianaM2: 1180,
          precioMinM2: 900,
          precioMaxM2: 1500,
          desviacionEstandar: 80,
          precioMedioM2Particular: null,
          precioMedioM2Profesional: null,
          gapPorcentaje: -15.24,
          semaforo: "rojo",
        },
        fallback,
      ),
    ).toBe(true);
  });

  it("no marca fallback legítimo con semáforo sin_datos", () => {
    expect(
      isStaleSinDatosRecommendation(
        {
          totalComparables: 0,
          precioMedioM2: 0,
          precioMedianaM2: 0,
          precioMinM2: 0,
          precioMaxM2: 0,
          desviacionEstandar: 0,
          precioMedioM2Particular: null,
          precioMedioM2Profesional: null,
          gapPorcentaje: 0,
          semaforo: "sin_datos",
        },
        fallback,
      ),
    ).toBe(false);
  });
});
