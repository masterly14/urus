import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { POST_SALE_CADENCE, getPhaseLabel } from "./cadence";
import { upsertCommercialOperationFactFromOperacionCerradaEvent } from "@/lib/dashboard/comercial/facts";
import { updateDemandLeadStatus, updateLeadStatusByOperationId } from "@/lib/projections/update-lead-status";

interface OperacionCerradaPayload {
  previousEstado: string;
  newEstado: string;
  propertyCode: string;
  closedAt: string;
  operacionId?: string;
  sourceEstadoCambiadoEventId?: string;
}

function isOperacionCerradaPayload(p: unknown): p is OperacionCerradaPayload {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.propertyCode === "string" &&
    typeof obj.newEstado === "string" &&
    typeof obj.closedAt === "string"
  );
}

/**
 * Handler para el evento OPERACION_CERRADA.
 *
 * Encola toda la cadencia post-venta (M9):
 *   D0  → Agradecimiento
 *   D+5 → Soporte
 *   D+12 → Reseña (Google Review)
 *   D+25 → Referidos
 *   D+120 → Re-captación
 *
 * Cada step se encola como un job con `availableAt` diferido y
 * clave de idempotencia única por propiedad + fase, garantizando
 * que re-procesar el evento no duplica mensajes.
 */
export async function handleOperacionCerrada(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload;

  if (!isOperacionCerradaPayload(payload)) {
    console.warn(
      `[post-sale] OPERACION_CERRADA aggregateId=${event.aggregateId} — payload inválido, omitiendo cadencia`,
    );
    return { success: true };
  }

  const { propertyCode, newEstado, closedAt, operacionId } = payload;
  const demandIdFromPayload = typeof (payload as Record<string, unknown>).demandId === "string"
    ? (payload as Record<string, unknown>).demandId as string
    : null;
  const closedDate = new Date(closedAt);

  if (isNaN(closedDate.getTime())) {
    console.warn(
      `[post-sale] OPERACION_CERRADA propertyCode=${propertyCode} — closedAt inválido: ${closedAt}`,
    );
    return { success: true };
  }

  try {
    await upsertCommercialOperationFactFromOperacionCerradaEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] No se pudo upsert CommercialOperationFact propertyCode=${propertyCode}: ${message}`,
    );
  }

  const idKey = operacionId ?? propertyCode;
  const followUpJobs: EnqueueJobInput[] = [];

  for (const step of POST_SALE_CADENCE) {
    const availableAt = new Date(closedDate.getTime() + step.delayMs);

    followUpJobs.push({
      type: step.jobType,
      payload: {
        propertyCode,
        operacionId,
        newEstado,
        phase: step.phase,
        stepLabel: step.label,
        closedAt,
        sourceEventId: event.id,
      },
      availableAt,
      idempotencyKey: `post_sale:${idKey}:${step.phase}`,
      sourceEventId: event.id,
    });
  }

  if (demandIdFromPayload) {
    try {
      await updateDemandLeadStatus(demandIdFromPayload, "CERRADO");
    } catch (err) {
      console.warn(
        `[post-sale] Error actualizando leadStatus a CERRADO (directo): ${err instanceof Error ? err.message : err}`,
      );
    }
  } else if (operacionId) {
    try {
      await updateLeadStatusByOperationId(operacionId, "CERRADO");
    } catch (err) {
      console.warn(
        `[post-sale] Error actualizando leadStatus a CERRADO: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `[post-sale] OPERACION_CERRADA propertyCode=${propertyCode}${operacionId ? ` operacion=${operacionId}` : ""} estado="${newEstado}" → ${followUpJobs.length} cadencias encoladas: ${POST_SALE_CADENCE.map((s) => `${s.label} (${getPhaseLabel(s.phase)})`).join(", ")}`,
  );

  return { success: true, followUpJobs };
}
