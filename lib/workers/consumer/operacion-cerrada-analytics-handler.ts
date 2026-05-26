import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { upsertCommercialOperationFactFromOperacionCerradaEvent } from "@/lib/dashboard/comercial/facts";
import { isBillableClosedOperation } from "@/lib/post-sale/closed-operation";

function getPayloadNewEstado(event: Event): string {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  return typeof payload?.newEstado === "string" ? payload.newEstado : "";
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
  const newEstado = getPayloadNewEstado(event);
  if (!isBillableClosedOperation(newEstado)) {
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

  return { success: true };
}
