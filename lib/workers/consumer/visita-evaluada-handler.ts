/**
 * Handler del consumer para el evento VISITA_EVALUADA.
 *
 * Flujo principal:
 *   1. Lee la demanda actual desde DemandCurrent.
 *   2. Calcula el scoring ajustado por nivel de interés (alto/medio/bajo).
 *   3. Consulta el stock de mercado de Statefox usando el traductor demanda→filtros.
 *   4. Decide si se debe generar un microsite para el comprador.
 *   5. Encola el job GENERATE_MICROSITE si aplica.
 */

import type { Event } from "@/types/domain";
import type { EnqueueJobInput, JsonValue } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import type { DemandFilterInput } from "@/lib/statefox";
import { prisma } from "@/lib/prisma";
import { createStatefoxClient, getProperties } from "@/lib/statefox";
import { buildStatefoxQuery, filterStatefoxResults } from "@/lib/statefox";
import { upsertCommercialVisitEvaluationFactFromVisitaEvaluadaEvent } from "@/lib/dashboard/comercial/facts";

// ---------------------------------------------------------------------------
// Constantes de negocio
// ---------------------------------------------------------------------------

/** Stock mínimo de propiedades en mercado para generar microsite. */
const MIN_STOCK_FOR_MICROSITE = 3;

/** Ajuste de score por nivel de interés declarado por el comercial. */
const INTERES_SCORE_DELTA: Record<string, number> = {
  alto: 20,
  medio: 0,
  bajo: -15,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface VisitaEvaluadaPayload {
  interes: "alto" | "medio" | "bajo";
  notas: string;
  comercialId: string;
  propertyCode?: string;
}

function parsePayload(payload: unknown): VisitaEvaluadaPayload {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    interes: (p.interes as "alto" | "medio" | "bajo") ?? "bajo",
    notas: typeof p.notas === "string" ? p.notas : "",
    comercialId: typeof p.comercialId === "string" ? p.comercialId : "system",
    propertyCode: typeof p.propertyCode === "string" ? p.propertyCode : undefined,
  };
}

/**
 * Consulta el stock de mercado en Statefox filtrado por los criterios de la demanda.
 * Devuelve el número de propiedades que encajan con la demanda.
 */
async function fetchStockForDemand(demand: DemandFilterInput): Promise<number> {
  let client;
  try {
    client = createStatefoxClient();
  } catch {
    // Sin token configurado: no podemos consultar Statefox
    console.warn("[consumer:visita-evaluada] STATEFOX_BEARER_TOKEN no configurado — omitiendo consulta de stock");
    return 0;
  }

  const { queryParams, resultFilters } = buildStatefoxQuery(demand, {
    type: "sale",
    source: "idealista",
    items: 50,
  });

  try {
    const response = await getProperties(client, {
      source: queryParams.source,
      type: queryParams.type,
      items: queryParams.items,
      housing: queryParams.housing,
    });

    const allProperties = Object.values(response.properties);
    const matching = filterStatefoxResults(allProperties, resultFilters);

    return matching.length;
  } catch (err) {
    console.error(
      `[consumer:visita-evaluada] Error consultando Statefox: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function handleVisitaEvaluada(event: Event): Promise<HandlerResult> {
  const demandId = event.aggregateId;
  const { interes, notas, comercialId } = parsePayload(event.payload);

  console.log(
    `[consumer:visita-evaluada] VISITA_EVALUADA demandId=${demandId} interes=${interes} comercialId=${comercialId}`,
  );

  // 1. Leer demanda actual
  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
  });

  if (!demand) {
    console.warn(
      `[consumer:visita-evaluada] Demanda ${demandId} no encontrada en DemandCurrent — posible lag en proyección`,
    );
    return { success: true };
  }

  // Persistencia best-effort para dashboard (no debe bloquear el flujo principal).
  try {
    await upsertCommercialVisitEvaluationFactFromVisitaEvaluadaEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] No se pudo upsert CommercialVisitEvaluationFact demandId=${demandId}: ${message}`,
    );
  }

  // 2. Score ajustado por interés
  const scoreDelta = INTERES_SCORE_DELTA[interes] ?? 0;
  console.log(
    `[consumer:visita-evaluada] demandId=${demandId} ajuste de score por interés "${interes}": ${scoreDelta > 0 ? "+" : ""}${scoreDelta} puntos`,
  );

  // 3. Consultar stock en Statefox
  const demandFilter: DemandFilterInput = {
    tipos: demand.tipos,
    zonas: demand.zonas,
    presupuestoMin: demand.presupuestoMin,
    presupuestoMax: demand.presupuestoMax,
    habitacionesMin: demand.habitacionesMin,
  };

  const stockCount = await fetchStockForDemand(demandFilter);

  console.log(
    `[consumer:visita-evaluada] demandId=${demandId} stock Statefox para demanda: ${stockCount} propiedades`,
  );

  // 4. Decisión: generar microsite
  const shouldGenerateMicrosite = interes === "alto" && stockCount >= MIN_STOCK_FOR_MICROSITE;

  console.log(
    `[consumer:visita-evaluada] demandId=${demandId} generarMicrosite=${shouldGenerateMicrosite} ` +
    `(interes=${interes}, stock=${stockCount}, minStock=${MIN_STOCK_FOR_MICROSITE})`,
  );

  // 5. Follow-up jobs
  const followUpJobs: EnqueueJobInput[] = [];

  if (shouldGenerateMicrosite) {
    followUpJobs.push({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId,
        comercialId,
        interes,
        notas,
        scoreDelta,
        stockCount,
        demand: demandFilter as unknown as JsonValue,
        sourceEventId: event.id,
      } as unknown as JsonValue,
      priority: 50,
      idempotencyKey: `generate_microsite:${demandId}:${event.id}`,
      sourceEventId: event.id,
    });
  }

  return { success: true, followUpJobs };
}
