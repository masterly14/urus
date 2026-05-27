import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { upsertCommercialOperationFactFromOperacionCerradaEvent } from "@/lib/dashboard/comercial/facts";
import { isClosedOperation } from "@/lib/post-sale/closed-operation";
import { updateDemandLeadStatus, updateLeadStatusByOperationId } from "@/lib/projections/update-lead-status";

interface OperacionCerradaAnalyticsPayload {
  newEstado: string;
  demandId: string | null;
  operacionId: string | null;
  source: string | null;
}

function getPayload(event: Event): OperacionCerradaAnalyticsPayload {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  return {
    newEstado: typeof payload?.newEstado === "string" ? payload.newEstado : "",
    demandId: typeof payload?.demandId === "string" ? payload.demandId : null,
    operacionId: typeof payload?.operacionId === "string" ? payload.operacionId : null,
    source: typeof payload?.source === "string" ? payload.source : null,
  };
}

async function syncLeadStatusForExternalClose(
  payload: OperacionCerradaAnalyticsPayload,
): Promise<void> {
  if (payload.source === "manual_close") return;

  try {
    if (payload.demandId) {
      await updateDemandLeadStatus(payload.demandId, "CERRADO");
    } else if (payload.operacionId) {
      await updateLeadStatusByOperationId(payload.operacionId, "CERRADO");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] OPERACION_CERRADA — no se pudo sincronizar leadStatus=CERRADO: ${message}`,
    );
  }
}

/**
 * Handler analytics-only para OPERACION_CERRADA.
 *
 * Importante:
 * - NO encola jobs de post-venta.
 * - NO altera el flujo canónico START_POSTVENTA_CADENCE.
 * - Mantiene best-effort: errores analíticos no bloquean el consumer.
 */
export async function handleOperacionCerradaAnalyticsOnly(
  event: Event,
): Promise<HandlerResult> {
  const payload = getPayload(event);
  const newEstado = payload.newEstado;
  if (!isClosedOperation(newEstado)) {
    console.log(
      `[analytics] OPERACION_CERRADA aggregateId=${event.aggregateId} newEstado="${newEstado}" — omitido (no representa cierre con facturación)`,
    );
    return { success: true };
  }

  try {
    await upsertCommercialOperationFactFromOperacionCerradaEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] OPERACION_CERRADA aggregateId=${event.aggregateId} — upsert CommercialOperationFact falló: ${message}`,
    );
  }

  await syncLeadStatusForExternalClose(payload);

  return { success: true };
}
