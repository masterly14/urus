import type { Event } from "@/types/domain";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { POST_SALE_CADENCE, getPhaseLabel } from "./cadence";
import { upsertCommercialOperationFactFromOperacionCerradaEvent } from "@/lib/dashboard/comercial/facts";

interface OperacionCerradaPayload {
  previousEstado: string;
  newEstado: string;
  propertyCode: string;
  closedAt: string;
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

  const { propertyCode, newEstado, closedAt } = payload;
  const closedDate = new Date(closedAt);

  if (isNaN(closedDate.getTime())) {
    console.warn(
      `[post-sale] OPERACION_CERRADA propertyCode=${propertyCode} — closedAt inválido: ${closedAt}`,
    );
    return { success: true };
  }

  // Persistencia best-effort para Dashboard Comercial (M10). No debe bloquear cadencias.
  try {
    await upsertCommercialOperationFactFromOperacionCerradaEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] No se pudo upsert CommercialOperationFact propertyCode=${propertyCode}: ${message}`,
    );
  }

  const followUpJobs: EnqueueJobInput[] = [];

  for (const step of POST_SALE_CADENCE) {
    const availableAt = new Date(closedDate.getTime() + step.delayMs);

    followUpJobs.push({
      type: step.jobType,
      payload: {
        propertyCode,
        newEstado,
        phase: step.phase,
        stepLabel: step.label,
        closedAt,
        sourceEventId: event.id,
      },
      availableAt,
      idempotencyKey: `post_sale:${propertyCode}:${step.phase}`,
      sourceEventId: event.id,
    });
  }

  console.log(
    `[post-sale] OPERACION_CERRADA propertyCode=${propertyCode} estado="${newEstado}" → ${followUpJobs.length} cadencias encoladas: ${POST_SALE_CADENCE.map((s) => `${s.label} (${getPhaseLabel(s.phase)})`).join(", ")}`,
  );

  return { success: true, followUpJobs };
}
