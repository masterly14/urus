/**
 * M13 — Orquestador de diagnóstico IA para el CEO Dashboard (Capa 4).
 *
 * 1. Recopila datos frescos de Capas 1+2, Dashboard Comercial, Alertas y Colaboradores
 * 2. Invoca el grafo LangGraph (generateCeoDiagnostic)
 * 3. Persiste el resultado como evento CEO_DIAGNOSTICO_GENERADO
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
  generateCeoDiagnostic,
  type CeoDiagnosticInput,
} from "@/lib/agents/ceo-diagnostic-graph";
import type { CeoDiagnosticRecommendation } from "./diagnostic-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CeoDiagnosticGeneratorResult = {
  recommendation: CeoDiagnosticRecommendation;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateAndPersistCeoDiagnostic(): Promise<CeoDiagnosticGeneratorResult> {
  const range = getDefaultDashboardRange();

  const [overview, cities, comercialesResult, leadScoreRows, alertasRaw, colabEvent] =
    await Promise.all([
      getCeoOverview(),
      getCeoCityPerformance(),
      getComercialesDashboard(range),
      getLeadScoreStatsByComercial(range),
      prisma.dashboardAlert.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          comercialNombre: true,
          type: true,
          severity: true,
          metric: true,
          message: true,
        },
      }),
      prisma.event.findFirst({
        where: { type: "COLABORADOR_RECOMENDACION_GENERADA" },
        orderBy: { createdAt: "desc" },
        select: { payload: true },
      }),
    ]);

  const leadScoreMap = new Map<string, LeadScoreStats>();
  for (const row of leadScoreRows) {
    leadScoreMap.set(row.comercialId, row);
  }
  const classified = classifyTeam(comercialesResult.rows, leadScoreMap);

  let colaboradoresResumen: string | null = null;
  if (colabEvent?.payload && typeof colabEvent.payload === "object") {
    const p = colabEvent.payload as Record<string, unknown>;
    if (typeof p.resumen_ejecutivo === "string") {
      colaboradoresResumen = p.resumen_ejecutivo;
      if (typeof p.diagnostico === "string") {
        colaboradoresResumen += ` ${p.diagnostico}`;
      }
    }
  }

  const input: CeoDiagnosticInput = {
    overview,
    cities,
    comerciales: {
      rows: comercialesResult.rows,
      classified,
    },
    alertas: alertasRaw,
    colaboradoresResumen,
  };

  const recommendation = await generateCeoDiagnostic(input);

  await appendEvent({
    type: "CEO_DIAGNOSTICO_GENERADO",
    aggregateType: "CEO",
    aggregateId: "ceo-diagnostic",
    payload: {
      diagnostico_general: recommendation.diagnostico_general,
      recomendaciones: recommendation.recomendaciones,
      resumen_ejecutivo: recommendation.resumen_ejecutivo,
      semaforo_global: recommendation.semaforo_global,
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
// Leer último diagnóstico del Event Store
// ---------------------------------------------------------------------------

export async function getLatestCeoDiagnostic(): Promise<CeoDiagnosticGeneratorResult | null> {
  const event = await prisma.event.findFirst({
    where: { type: "CEO_DIAGNOSTICO_GENERADO" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, createdAt: true },
  });

  if (!event?.payload || typeof event.payload !== "object") {
    return null;
  }

  const p = event.payload as Record<string, unknown>;

  return {
    recommendation: {
      diagnostico_general: (p.diagnostico_general as string) ?? "",
      recomendaciones: (p.recomendaciones as CeoDiagnosticRecommendation["recomendaciones"]) ?? [],
      resumen_ejecutivo: (p.resumen_ejecutivo as string) ?? "",
      semaforo_global: (p.semaforo_global as CeoDiagnosticRecommendation["semaforo_global"]) ?? "amarillo",
      confidence: (p.confidence as number) ?? 0,
      reasoning: (p.reasoning as string) ?? "",
    },
    generatedAt: event.createdAt.toISOString(),
  };
}
