/**
 * M11 — Orquestador de recomendaciones IA para colaboradores externos.
 *
 * 1. Obtiene datos frescos del dashboard (getDashboardColaboradores)
 * 2. Invoca el grafo LangGraph (generateColaboradoresRecommendation)
 * 3. Persiste el resultado como evento COLABORADOR_RECOMENDACION_GENERADA
 * 4. Retorna el resultado
 */

import { getDashboardColaboradores } from "./dashboard-queries";
import { generateColaboradoresRecommendation } from "@/lib/agents/colaboradores-recommendation-graph";
import { appendEvent } from "@/lib/event-store";
import type { ColaboradoresRecommendation } from "./recommendation-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationGeneratorResult = {
  recommendation: ColaboradoresRecommendation;
  colaboradoresAnalizados: number;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateAndPersistColaboradoresRecommendation(): Promise<RecommendationGeneratorResult> {
  const payload = await getDashboardColaboradores();

  const recommendation = await generateColaboradoresRecommendation(payload);

  await appendEvent({
    type: "COLABORADOR_RECOMENDACION_GENERADA",
    aggregateType: "OPERACION",
    aggregateId: "colaboradores-fleet",
    payload: {
      diagnostico: recommendation.diagnostico,
      recomendaciones: recommendation.recomendaciones,
      resumen_ejecutivo: recommendation.resumen_ejecutivo,
      confidence: recommendation.confidence,
      reasoning: recommendation.reasoning,
      colaboradoresAnalizados: payload.resumen.totalActivos,
      slaCumplimientoGlobal: payload.resumen.slaCumplimientoGlobal,
      facturacionTotal: payload.resumen.facturacionTotal,
    },
  });

  return {
    recommendation,
    colaboradoresAnalizados: payload.resumen.totalActivos,
    generatedAt: new Date().toISOString(),
  };
}
