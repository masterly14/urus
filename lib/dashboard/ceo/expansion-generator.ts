/**
 * M13 — Orquestador del Motor de Expansión Geográfica (Capa 5).
 *
 * 1. Recopila datos frescos de Capas 1+2 y comerciales clasificados
 * 2. Invoca el grafo LangGraph (generateCeoExpansion)
 * 3. Persiste el resultado como evento CEO_EXPANSION_EVALUADA
 * 4. Retorna el resultado
 */

import { getCeoOverview } from "./queries";
import { getCeoCityPerformance } from "./city-queries";
import {
  getComercialesDashboard,
  getDefaultDashboardRange,
  getLeadScoreStatsByComercial,
} from "@/lib/dashboard/comercial/queries";
import {
  classifyTeam,
  type LeadScoreStats,
} from "@/lib/dashboard/comercial/classify";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import {
  generateCeoExpansion,
  type CeoExpansionInput,
} from "@/lib/agents/ceo-expansion-graph";
import type { CeoExpansionRecommendation } from "./expansion-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CeoExpansionGeneratorResult = {
  recommendation: CeoExpansionRecommendation;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateAndPersistCeoExpansion(): Promise<CeoExpansionGeneratorResult> {
  const range = getDefaultDashboardRange();

  const [overview, cities, comercialesResult, leadScoreRows] = await Promise.all([
    getCeoOverview(),
    getCeoCityPerformance(),
    getComercialesDashboard(range),
    getLeadScoreStatsByComercial(range),
  ]);

  const leadScoreMap = new Map<string, LeadScoreStats>();
  for (const row of leadScoreRows) {
    leadScoreMap.set(row.comercialId, row);
  }
  const classified = classifyTeam(comercialesResult.rows, leadScoreMap);

  const input: CeoExpansionInput = {
    overview,
    cities,
    classified,
  };

  const recommendation = await generateCeoExpansion(input);

  await appendEvent({
    type: "CEO_EXPANSION_EVALUADA",
    aggregateType: "CEO",
    aggregateId: "ceo-expansion",
    payload: {
      readiness_global: recommendation.readiness_global,
      criterios_evaluados: recommendation.criterios_evaluados,
      ciudades_recomendadas: recommendation.ciudades_recomendadas,
      plan_expansion: recommendation.plan_expansion,
      resumen_ejecutivo: recommendation.resumen_ejecutivo,
      confidence: recommendation.confidence,
      reasoning: recommendation.reasoning,
    },
  });

  return {
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Leer última evaluación del Event Store
// ---------------------------------------------------------------------------

export async function getLatestCeoExpansion(): Promise<CeoExpansionGeneratorResult | null> {
  const event = await prisma.event.findFirst({
    where: { type: "CEO_EXPANSION_EVALUADA" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, createdAt: true },
  });

  if (!event?.payload || typeof event.payload !== "object") {
    return null;
  }

  const p = event.payload as Record<string, unknown>;

  return {
    recommendation: {
      readiness_global: (p.readiness_global as CeoExpansionRecommendation["readiness_global"]) ?? "no_apto",
      criterios_evaluados: (p.criterios_evaluados as CeoExpansionRecommendation["criterios_evaluados"]) ?? [],
      ciudades_recomendadas: (p.ciudades_recomendadas as CeoExpansionRecommendation["ciudades_recomendadas"]) ?? [],
      plan_expansion: (p.plan_expansion as string) ?? "",
      resumen_ejecutivo: (p.resumen_ejecutivo as string) ?? "",
      confidence: (p.confidence as number) ?? 0,
      reasoning: (p.reasoning as string) ?? "",
    },
    generatedAt: event.createdAt.toISOString(),
  };
}
