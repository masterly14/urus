/**
 * Handler del consumer para el cruce automático de demandas.
 *
 * Se activa con PROPIEDAD_CREADA (y opcionalmente PROPIEDAD_MODIFICADA):
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

export async function handlePropertyMatching(event: Event): Promise<HandlerResult> {
  const propertyId = event.aggregateId;

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
        `[consumer:matching] Propiedad ${propertyId} — 0 matches de ${result.totalDemands} demandas`,
      );
      return { success: true, followUpJobs };
    }

    console.log(
      `[consumer:matching] Propiedad ${propertyId} — ${result.matches.length} matches encontrados`,
    );

    for (const match of result.matches) {
      const matchEvent = await appendEvent({
        type: "MATCH_GENERADO",
        aggregateType: "MATCH",
        aggregateId: `${match.demandId}:${match.propertyId}`,
        payload: {
          demandId: match.demandId,
          demandRef: match.demandRef,
          demandNombre: match.demandNombre,
          propertyId: match.propertyId,
          propertyRef: match.propertyRef,
          totalScore: match.totalScore,
          matchScore: JSON.parse(JSON.stringify(match.matchScore)),
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
    }

    return { success: true, followUpJobs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[consumer:matching] Error en cruce: ${errorMsg}`);
    return { success: false, error: errorMsg, followUpJobs };
  }
}
