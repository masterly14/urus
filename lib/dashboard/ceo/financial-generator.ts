/**
 * M13 — Orquestador del Control Financiero (Capa 6).
 *
 * 1. Recopila datos frescos de Capas 1+2
 * 2. Inyecta constantes de automatizaciones asumidas
 * 3. Invoca el grafo LangGraph (generateCeoFinancial)
 * 4. Persiste el resultado como evento CEO_FINANZAS_GENERADA
 * 5. Retorna el resultado
 */

import { getCeoOverview } from "./queries";
import { getCeoCityPerformance } from "./city-queries";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import {
  generateCeoFinancial,
  AUTOMATIZACIONES_ASUMIDAS,
  type CeoFinancialInput,
} from "@/lib/agents/ceo-financial-graph";
import type { CeoFinancialRecommendation } from "./financial-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CeoFinancialGeneratorResult = {
  recommendation: CeoFinancialRecommendation;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateAndPersistCeoFinancial(): Promise<CeoFinancialGeneratorResult> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const existing = await prisma.event.findFirst({
    where: {
      type: "CEO_FINANZAS_GENERADA",
      createdAt: { gte: monthStart },
    },
    orderBy: { createdAt: "desc" },
    select: { payload: true, createdAt: true },
  });
  if (existing?.payload && typeof existing.payload === "object") {
    const p = existing.payload as Record<string, unknown>;
    return {
      recommendation: {
        costes_fijos_eur: (p.costes_fijos_eur as number) ?? 0,
        costes_variables_eur: (p.costes_variables_eur as number) ?? 0,
        coste_por_operacion_eur: (p.coste_por_operacion_eur as number) ?? 0,
        ratio_fijo_variable: (p.ratio_fijo_variable as number) ?? 0,
        automatizaciones: (p.automatizaciones as CeoFinancialRecommendation["automatizaciones"]) ?? [],
        roi_automatizaciones_total: (p.roi_automatizaciones_total as number) ?? 0,
        capacidad_reinversion_eur: (p.capacidad_reinversion_eur as number) ?? 0,
        recomendaciones: (p.recomendaciones as CeoFinancialRecommendation["recomendaciones"]) ?? [],
        semaforo_financiero:
          (p.semaforo_financiero as CeoFinancialRecommendation["semaforo_financiero"]) ?? "rojo",
        resumen_ejecutivo: (p.resumen_ejecutivo as string) ?? "",
        confidence: (p.confidence as number) ?? 0,
        reasoning: (p.reasoning as string) ?? "",
      },
      generatedAt: existing.createdAt.toISOString(),
    };
  }

  const [overview, cities] = await Promise.all([
    getCeoOverview(),
    getCeoCityPerformance(),
  ]);

  const input: CeoFinancialInput = {
    overview,
    cities,
    automatizaciones: AUTOMATIZACIONES_ASUMIDAS,
  };

  const recommendation = await generateCeoFinancial(input);

  await appendEvent({
    type: "CEO_FINANZAS_GENERADA",
    aggregateType: "CEO",
    aggregateId: "ceo-financiero",
    payload: {
      costes_fijos_eur: recommendation.costes_fijos_eur,
      costes_variables_eur: recommendation.costes_variables_eur,
      coste_por_operacion_eur: recommendation.coste_por_operacion_eur,
      ratio_fijo_variable: recommendation.ratio_fijo_variable,
      automatizaciones: recommendation.automatizaciones,
      roi_automatizaciones_total: recommendation.roi_automatizaciones_total,
      capacidad_reinversion_eur: recommendation.capacidad_reinversion_eur,
      recomendaciones: recommendation.recomendaciones,
      semaforo_financiero: recommendation.semaforo_financiero,
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

export async function getLatestCeoFinancial(): Promise<CeoFinancialGeneratorResult | null> {
  const event = await prisma.event.findFirst({
    where: { type: "CEO_FINANZAS_GENERADA" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, createdAt: true },
  });

  if (!event?.payload || typeof event.payload !== "object") {
    return null;
  }

  const p = event.payload as Record<string, unknown>;

  return {
    recommendation: {
      costes_fijos_eur: (p.costes_fijos_eur as number) ?? 0,
      costes_variables_eur: (p.costes_variables_eur as number) ?? 0,
      coste_por_operacion_eur: (p.coste_por_operacion_eur as number) ?? 0,
      ratio_fijo_variable: (p.ratio_fijo_variable as number) ?? 0,
      automatizaciones: (p.automatizaciones as CeoFinancialRecommendation["automatizaciones"]) ?? [],
      roi_automatizaciones_total: (p.roi_automatizaciones_total as number) ?? 0,
      capacidad_reinversion_eur: (p.capacidad_reinversion_eur as number) ?? 0,
      recomendaciones: (p.recomendaciones as CeoFinancialRecommendation["recomendaciones"]) ?? [],
      semaforo_financiero:
        (p.semaforo_financiero as CeoFinancialRecommendation["semaforo_financiero"]) ?? "rojo",
      resumen_ejecutivo: (p.resumen_ejecutivo as string) ?? "",
      confidence: (p.confidence as number) ?? 0,
      reasoning: (p.reasoning as string) ?? "",
    },
    generatedAt: event.createdAt.toISOString(),
  };
}
