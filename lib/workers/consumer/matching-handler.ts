/**
 * Handler del consumer para el cruce automático de demandas.
 *
 * Se activa con PROPIEDAD_CREADA y PROPIEDAD_MODIFICADA (cuando cambian
 * campos relevantes para el matching: precio, zona, ciudad, tipología, metros, habitaciones).
 *
 * 1. Ejecuta matchDemandsToPropertyById(aggregateId).
 * 2. Para cada match, emite evento MATCH_GENERADO.
 * 3. Encola follow-up jobs: projection + notificación.
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { JsonValue } from "@/lib/event-store/types";
import type { PropertyForMatching } from "@/lib/matching";
import { matchDemandsToPropertyById, matchDemandsToProperty } from "@/lib/matching";
import { appendEvent } from "@/lib/event-store";
import { prisma } from "@/lib/prisma";
import { isMatchingPaused, MATCHING_PAUSED_REASON } from "@/lib/matching/pause";

type PropertySnapshot = {
  codigo?: string;
  ref?: string;
  titulo?: string;
  tipoOfer?: string;
  precio?: number;
  metrosConstruidos?: number;
  habitaciones?: number;
  ciudad?: string;
  zona?: string;
};

const MATCHING_RELEVANT_FIELDS = new Set([
  "precio",
  "metrosConstruidos",
  "habitaciones",
  "zona",
  "ciudad",
  "tipoOfer",
]);

/**
 * H20: Límite duro de fan-out por ejecución de matching para una propiedad.
 * Evita que una propiedad con decenas/cientos de matches dispare avalanchas de
 * eventos MATCH_GENERADO y jobs PROCESS_EVENT en un único handler.
 * Se toman los N mejores por `totalScore` (matches vienen ya ordenados).
 */
const MAX_MATCHES_PER_PROPERTY = 20;
const SCORE_DELTA_THRESHOLD = 5;

type PropertyMatchSource = "auto_property_creada" | "auto_property_modificada";

const PRICING_RELEVANT_FIELDS = new Set([
  "precio",
  "metrosConstruidos",
  "habitaciones",
  "banyos",
  "estado",
]);

function extractPropertyFromPayload(
  event: Event,
): PropertyForMatching | null {
  const payload = event.payload as { snapshot?: PropertySnapshot } | null;
  const s = payload?.snapshot;
  if (!s?.codigo) return null;
  return {
    codigo: s.codigo,
    ref: s.ref ?? "",
    titulo: s.titulo ?? "",
    tipoOfer: s.tipoOfer ?? "",
    precio: s.precio ?? 0,
    metrosConstruidos: s.metrosConstruidos ?? 0,
    habitaciones: s.habitaciones ?? 0,
    ciudad: s.ciudad ?? "",
    zona: s.zona ?? "",
  };
}

function hasMatchingRelevantChanges(event: Event): boolean {
  const payload = event.payload as Record<string, unknown> | null;
  const changedFields = Array.isArray(payload?.changedFields)
    ? (payload.changedFields as string[])
    : [];
  if (changedFields.length === 0) return true;
  return changedFields.some((f) => MATCHING_RELEVANT_FIELDS.has(f));
}

function hasPricingRelevantChanges(event: Event): boolean {
  const payload = event.payload as Record<string, unknown> | null;
  const changedFields = Array.isArray(payload?.changedFields)
    ? (payload.changedFields as string[])
    : [];
  if (changedFields.length === 0) return true;
  return changedFields.some((f) => PRICING_RELEVANT_FIELDS.has(f));
}

const ANTI_LOOP_WINDOW_MS = 30 * 60 * 1000; // 30 min

/**
 * If the price change was originated by our own PRICING_PRECIO_APLICADO event
 * (i.e. a commercial applied a pricing recommendation), skip re-analysis to
 * avoid a feedback loop: apply → ingestion detects change → re-analyze → new rec.
 */
async function isPriceChangeFromRecommendation(propertyCode: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ANTI_LOOP_WINDOW_MS);
  const recentApply = await prisma.event.findFirst({
    where: {
      type: "PRICING_PRECIO_APLICADO",
      aggregateType: "PROPERTY",
      aggregateId: propertyCode,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return recentApply !== null;
}

function getPropertyMatchSource(event: Event): PropertyMatchSource {
  return event.type === "PROPIEDAD_MODIFICADA"
    ? "auto_property_modificada"
    : "auto_property_creada";
}

export async function handlePropertyMatching(event: Event): Promise<HandlerResult> {
  const propertyId = event.aggregateId;

  if (event.type === "PROPIEDAD_MODIFICADA" && !hasMatchingRelevantChanges(event)) {
    console.log(
      `[consumer:matching] PROPIEDAD_MODIFICADA ${propertyId} — sin campos relevantes para matching, solo projection`,
    );
    const jobs: EnqueueJobInput[] = [
      {
        type: "UPDATE_PROPERTY_PROJECTION",
        payload: { eventId: event.id },
        idempotencyKey: `update_property_projection:${event.id}`,
        sourceEventId: event.id,
      },
    ];
    if (hasPricingRelevantChanges(event)) {
      const fromOwnRecommendation = await isPriceChangeFromRecommendation(propertyId);
      if (fromOwnRecommendation) {
        console.log(
          `[consumer:matching] PROPIEDAD_MODIFICADA ${propertyId} — cambio de precio originado por recomendación propia, omitiendo re-análisis`,
        );
      } else {
        jobs.push({
          type: "RUN_PRICING_ANALYSIS",
          payload: { propertyCode: propertyId },
          idempotencyKey: `run-pricing:${event.id}`,
          sourceEventId: event.id,
        });
      }
    }
    return { success: true, followUpJobs: jobs };
  }

  console.log(
    `[consumer:matching] ${event.type} propertyId=${propertyId} → ejecutando cruce de demandas`,
  );

  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "UPDATE_PROPERTY_PROJECTION",
      payload: { eventId: event.id },
      idempotencyKey: `update_property_projection:${event.id}`,
      sourceEventId: event.id,
    },
  ];
  if (event.type !== "PROPIEDAD_MODIFICADA" || hasPricingRelevantChanges(event)) {
    const fromOwnRecommendation = await isPriceChangeFromRecommendation(propertyId);
    if (fromOwnRecommendation) {
      console.log(
        `[consumer:matching] ${event.type} ${propertyId} — cambio de precio originado por recomendación propia, omitiendo re-análisis`,
      );
    } else {
      followUpJobs.push({
        type: "RUN_PRICING_ANALYSIS",
        payload: { propertyCode: propertyId },
        idempotencyKey: `run-pricing:${event.id}`,
        sourceEventId: event.id,
      });
    }
  }

  if (isMatchingPaused()) {
    console.warn(
      `[consumer:matching] ${event.type} propertyId=${propertyId} — cruce pausado: ${MATCHING_PAUSED_REASON}`,
    );
    return { success: true, followUpJobs };
  }

  try {
    let result = await matchDemandsToPropertyById(propertyId);

    if (!result) {
      const fromPayload = extractPropertyFromPayload(event);
      if (fromPayload) {
        result = await matchDemandsToProperty(fromPayload);
      }
    }

    if (!result) {
      console.warn(
        `[consumer:matching] Propiedad ${propertyId} no encontrada — solo projection`,
      );
      return { success: true, followUpJobs };
    }

    if (result.matches.length === 0) {
      console.log(
        `[consumer:matching] Propiedad ${propertyId} — 0 matches de ${result.totalDemands} demandas (${result.filteredOut} filtradas)`,
      );
      return { success: true, followUpJobs };
    }

    // H20: limitar fan-out a los top-N por totalScore (ya ordenados desc en matchDemandsToProperty)
    const totalMatches = result.matches.length;
    const topMatches = result.matches.slice(0, MAX_MATCHES_PER_PROPERTY);
    if (totalMatches > MAX_MATCHES_PER_PROPERTY) {
      console.warn(
        `[consumer:matching] Propiedad ${propertyId} — ${totalMatches} matches detectados, limitando a top-${MAX_MATCHES_PER_PROPERTY} (${totalMatches - MAX_MATCHES_PER_PROPERTY} descartados)`,
      );
    } else {
      console.log(
        `[consumer:matching] Propiedad ${propertyId} — ${totalMatches} matches encontrados (${result.filteredOut} filtradas)`,
      );
    }

    const source = getPropertyMatchSource(event);
    let emitted = 0;
    let skipped = 0;

    for (const match of topMatches) {
      const aggregateId = `${match.demandId}:${match.propertyId}`;
      const lastMatch = await prisma.event.findFirst({
        where: { type: "MATCH_GENERADO", aggregateId },
        orderBy: { position: "desc" },
        select: { payload: true },
      });

      if (lastMatch) {
        const prevPayload = lastMatch.payload as Record<string, unknown> | null;
        const prevScore =
          typeof prevPayload?.totalScore === "number" ? prevPayload.totalScore : 0;
        const delta = Math.abs(match.totalScore - prevScore);
        if (delta < SCORE_DELTA_THRESHOLD) {
          skipped++;
          continue;
        }
      }

      const matchEvent = await appendEvent({
        type: "MATCH_GENERADO",
        aggregateType: "MATCH",
        aggregateId,
        payload: {
          demandId: match.demandId,
          demandRef: match.demandRef,
          demandNombre: match.demandNombre,
          propertyId: match.propertyId,
          propertyRef: match.propertyRef,
          totalScore: match.totalScore,
          matchScore: JSON.parse(JSON.stringify(match.matchScore)),
          source,
          sourceEventId: event.id,
          causationId: event.id,
        } as unknown as JsonValue,
        correlationId: event.correlationId ?? undefined,
        causationId: event.id,
      });

      followUpJobs.push({
        type: "PROCESS_EVENT",
        payload: { eventId: matchEvent.id },
        idempotencyKey: `process_event:${matchEvent.id}`,
        sourceEventId: matchEvent.id,
      });
      emitted++;
    }

    console.log(
      `[consumer:matching] Propiedad ${propertyId} source=${source} — ${emitted} MATCH_GENERADO emitidos, ${skipped} saltados (Δ<${SCORE_DELTA_THRESHOLD})`,
    );

    return { success: true, followUpJobs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[consumer:matching] Error en cruce: ${errorMsg}`);
    return { success: false, error: errorMsg, followUpJobs };
  }
}
