import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ColaboradoresRecommendationSchema,
  type ColaboradoresRecommendation,
} from "../recommendation-types";
import type {
  DashboardColaboradoresPayload,
  ColaboradorDashboardRow,
} from "../dashboard-queries";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeColaboradorRow(
  overrides?: Partial<ColaboradorDashboardRow>,
): ColaboradorDashboardRow {
  return {
    id: "colab-1",
    nombre: "Gestoría Test",
    tipo: "Gestoría",
    ciudad: "Murcia",
    especialidad: "fiscal",
    contactoNombre: "Juan",
    contactoEmail: "j@test.com",
    contactoTelefono: "600000000",
    activo: true,
    notas: "",
    createdAt: new Date(),
    asignacionesActivas: 3,
    asignacionesCompletadas: 5,
    asignacionesTotales: 8,
    hitosCompletados: 12,
    hitosTotales: 15,
    hitosVencidos: 1,
    slaCumplimiento: 85,
    avgDiasHito: 4.5,
    clasificacion: {
      clasificacion: "funcional",
      slaCumplimiento: 85,
      hitosVencidos: 1,
      asignacionesTotales: 8,
    },
    facturacionVinculadaEur: 250000,
    operacionesVinculadasCount: 5,
    ...overrides,
  };
}

function makeDashboardPayload(
  overrides?: Partial<DashboardColaboradoresPayload>,
): DashboardColaboradoresPayload {
  return {
    resumen: {
      totalActivos: 5,
      slaCumplimientoGlobal: 78.5,
      hitosVencidosTotales: 3,
      facturacionTotal: 1250000,
      distribucionClasificacion: {
        partner_estrategico: 1,
        funcional: 2,
        lento: 1,
        critico: 1,
        sin_datos: 0,
      },
    },
    ranking: [
      makeColaboradorRow({
        id: "p1",
        nombre: "Notaría Premium",
        clasificacion: {
          clasificacion: "partner_estrategico",
          slaCumplimiento: 95,
          hitosVencidos: 0,
          asignacionesTotales: 12,
        },
        slaCumplimiento: 95,
        facturacionVinculadaEur: 500000,
      }),
      makeColaboradorRow({
        id: "f1",
        nombre: "Gestoría Funcional",
        clasificacion: {
          clasificacion: "funcional",
          slaCumplimiento: 80,
          hitosVencidos: 1,
          asignacionesTotales: 6,
        },
        slaCumplimiento: 80,
        facturacionVinculadaEur: 300000,
      }),
      makeColaboradorRow({
        id: "c1",
        nombre: "Tasador Lento",
        tipo: "Tasador",
        clasificacion: {
          clasificacion: "critico",
          slaCumplimiento: 40,
          hitosVencidos: 5,
          asignacionesTotales: 4,
        },
        slaCumplimiento: 40,
        hitosVencidos: 5,
        facturacionVinculadaEur: 200000,
      }),
    ],
    metricasPorTipo: [
      {
        tipo: "Gestoría",
        totalColaboradores: 2,
        avgSlaCumplimiento: 82.5,
        avgDiasHito: 4,
        hitosVencidos: 1,
        facturacionVinculadaEur: 800000,
      },
      {
        tipo: "Tasador",
        totalColaboradores: 1,
        avgSlaCumplimiento: 40,
        avgDiasHito: 12,
        hitosVencidos: 5,
        facturacionVinculadaEur: 200000,
      },
    ],
    ...overrides,
  };
}

function makeValidRecommendation(
  overrides?: Partial<ColaboradoresRecommendation>,
): ColaboradoresRecommendation {
  return {
    diagnostico:
      "La flota de 5 colaboradores tiene un SLA global del 78.5% con 3 hitos vencidos. " +
      "Se detecta 1 colaborador crítico (Tasador Lento, SLA 40%) con 200K€ en facturación vinculada en riesgo.",
    recomendaciones: [
      {
        tipo: "alertar",
        mensaje:
          "Tasador Lento tiene un SLA del 40% con 5 hitos vencidos y 200.000€ de facturación vinculada en riesgo.",
        colaboradores_afectados: ["Tasador Lento"],
        accion_sugerida:
          "Convocar reunión urgente con Tasador Lento para revisar operaciones activas y redistribuir las más críticas.",
        impacto_esperado:
          "Reducir riesgo de 200.000€ en facturación y desbloquear 5 hitos pendientes.",
        prioridad: "alta",
      },
      {
        tipo: "concentrar",
        mensaje:
          "Notaría Premium (SLA 95%, 500K€) es el colaborador más fiable. Redirigir operaciones del tasador crítico.",
        colaboradores_afectados: ["Notaría Premium"],
        accion_sugerida:
          "Asignar próximas operaciones de tasación a Notaría Premium o buscar tasador alternativo.",
        impacto_esperado:
          "Mejorar SLA global al concentrar en partners fiables.",
        prioridad: "alta",
      },
    ],
    resumen_ejecutivo:
      "1 colaborador crítico con 200K€ en riesgo. Acción urgente: redistribuir operaciones de Tasador Lento hacia partners.",
    confidence: 0.85,
    reasoning:
      "Datos suficientes (5 colaboradores, distribución variada). Alerta principal: tasador con SLA 40%.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests del schema Zod
// ---------------------------------------------------------------------------

describe("ColaboradoresRecommendationSchema", () => {
  it("valida una recomendación completa", () => {
    const rec = makeValidRecommendation();
    const result = ColaboradoresRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(true);
  });

  it("rechaza tipo de recomendación inválido", () => {
    const rec = makeValidRecommendation({
      recomendaciones: [
        {
          ...makeValidRecommendation().recomendaciones[0],
          tipo: "eliminar" as never,
        },
      ],
    });
    const result = ColaboradoresRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza recomendaciones vacías (min 1)", () => {
    const rec = makeValidRecommendation({ recomendaciones: [] });
    const result = ColaboradoresRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza confidence fuera de rango", () => {
    const rec = makeValidRecommendation({ confidence: 1.5 });
    const result = ColaboradoresRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza si falta diagnostico", () => {
    const { diagnostico: _, ...rec } = makeValidRecommendation();
    const result = ColaboradoresRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("rechaza si falta resumen_ejecutivo", () => {
    const { resumen_ejecutivo: _, ...rec } = makeValidRecommendation();
    const result = ColaboradoresRecommendationSchema.safeParse(rec);
    expect(result.success).toBe(false);
  });

  it("acepta prioridad válida", () => {
    for (const p of ["alta", "media", "baja"] as const) {
      const rec = makeValidRecommendation({
        recomendaciones: [
          { ...makeValidRecommendation().recomendaciones[0], prioridad: p },
        ],
      });
      expect(ColaboradoresRecommendationSchema.safeParse(rec).success).toBe(true);
    }
  });

  it("rechaza prioridad inválida", () => {
    const rec = makeValidRecommendation({
      recomendaciones: [
        {
          ...makeValidRecommendation().recomendaciones[0],
          prioridad: "urgente" as never,
        },
      ],
    });
    expect(ColaboradoresRecommendationSchema.safeParse(rec).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests del fallback sin datos
// ---------------------------------------------------------------------------

describe("generateColaboradoresRecommendation — fallback sin datos", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("retorna fallback sin invocar LLM cuando no hay colaboradores", async () => {
    const llmInvokeMock = vi.fn();

    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({ invoke: llmInvokeMock }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({ invoke: llmInvokeMock }),
      },
    }));

    const { generateColaboradoresRecommendation } = await import(
      "@/lib/agents/colaboradores-recommendation-graph"
    );

    const emptyPayload = makeDashboardPayload({
      resumen: {
        totalActivos: 0,
        slaCumplimientoGlobal: 0,
        hitosVencidosTotales: 0,
        facturacionTotal: 0,
        distribucionClasificacion: {
          partner_estrategico: 0,
          funcional: 0,
          lento: 0,
          critico: 0,
          sin_datos: 0,
        },
      },
      ranking: [],
      metricasPorTipo: [],
    });

    const recommendation = await generateColaboradoresRecommendation(emptyPayload);

    expect(llmInvokeMock).not.toHaveBeenCalled();
    expect(recommendation.confidence).toBeLessThan(0.5);
    expect(recommendation.diagnostico).toContain("No hay colaboradores activos");
    expect(recommendation.recomendaciones[0].tipo).toBe("investigar");

    const validation = ColaboradoresRecommendationSchema.safeParse(recommendation);
    expect(validation.success).toBe(true);
  });

  it("retorna fallback cuando todos son sin_datos", async () => {
    const llmInvokeMock = vi.fn();

    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({ invoke: llmInvokeMock }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({ invoke: llmInvokeMock }),
      },
    }));

    const { generateColaboradoresRecommendation } = await import(
      "@/lib/agents/colaboradores-recommendation-graph"
    );

    const sinDatosPayload = makeDashboardPayload({
      resumen: {
        totalActivos: 2,
        slaCumplimientoGlobal: 100,
        hitosVencidosTotales: 0,
        facturacionTotal: 0,
        distribucionClasificacion: {
          partner_estrategico: 0,
          funcional: 0,
          lento: 0,
          critico: 0,
          sin_datos: 2,
        },
      },
      ranking: [
        makeColaboradorRow({
          id: "sd1",
          clasificacion: {
            clasificacion: "sin_datos",
            slaCumplimiento: 100,
            hitosVencidos: 0,
            asignacionesTotales: 0,
          },
        }),
        makeColaboradorRow({
          id: "sd2",
          clasificacion: {
            clasificacion: "sin_datos",
            slaCumplimiento: 100,
            hitosVencidos: 0,
            asignacionesTotales: 0,
          },
        }),
      ],
    });

    const recommendation =
      await generateColaboradoresRecommendation(sinDatosPayload);

    expect(llmInvokeMock).not.toHaveBeenCalled();
    expect(recommendation.confidence).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Tests de integración con LLM mockeado
// ---------------------------------------------------------------------------

describe("generateColaboradoresRecommendation — integración mock", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("produce una recomendación válida con LLM mockeado", async () => {
    const mockLLMResponse: ColaboradoresRecommendation =
      makeValidRecommendation();

    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockResolvedValue(mockLLMResponse),
        }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockResolvedValue(mockLLMResponse),
        }),
      },
    }));

    const { generateColaboradoresRecommendation } = await import(
      "@/lib/agents/colaboradores-recommendation-graph"
    );

    const payload = makeDashboardPayload();
    const recommendation =
      await generateColaboradoresRecommendation(payload);

    expect(recommendation.diagnostico).toBeTruthy();
    expect(recommendation.recomendaciones.length).toBeGreaterThanOrEqual(1);
    expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
    expect(recommendation.confidence).toBeLessThanOrEqual(1);
    expect(recommendation.resumen_ejecutivo).toBeTruthy();

    const validation =
      ColaboradoresRecommendationSchema.safeParse(recommendation);
    expect(validation.success).toBe(true);
  });

  it("lanza error si el LLM falla", async () => {
    vi.doMock("@/lib/agents/llm", () => ({
      llm: {
        withStructuredOutput: () => ({
          invoke: vi
            .fn()
            .mockRejectedValue(new Error("OpenAI rate limit")),
        }),
      },
      llmWithStructuredOutput: {
        withStructuredOutput: () => ({
          invoke: vi
            .fn()
            .mockRejectedValue(new Error("OpenAI rate limit")),
        }),
      },
    }));

    const { generateColaboradoresRecommendation } = await import(
      "@/lib/agents/colaboradores-recommendation-graph"
    );

    const payload = makeDashboardPayload();

    await expect(
      generateColaboradoresRecommendation(payload),
    ).rejects.toThrow("Error generando recomendación de colaboradores");
  });
});
