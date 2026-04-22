import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { safeUpdateProperty } from "@/lib/inmovilla/rest/safe-update";

/**
 * Job handler para UPDATE_PROPERTY_STATUS_INMOVILLA.
 *
 * Actualiza `estadoficha` de una propiedad en Inmovilla vía REST API
 * (`safeUpdateProperty`). Opcionalmente vincula el comprador mediante `keycli`.
 *
 * Payload esperado:
 *   - propertyCode: string  (ref de la propiedad en Inmovilla)
 *   - estadoficha: number   (valor numérico: 2=Alquilada, 3=Vendida, 6=Traspaso)
 *   - operacionId?: string  (para trazabilidad)
 *   - buyerClientCode?: string (cod_cli numérico del comprador → se envía como `keycli`)
 */
export async function handleUpdatePropertyStatusInmovilla(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const propertyCode = typeof payload.propertyCode === "string" ? payload.propertyCode : "";
  const estadoficha = typeof payload.estadoficha === "number" ? payload.estadoficha : null;
  const buyerClientCode = typeof payload.buyerClientCode === "string" ? payload.buyerClientCode : null;

  if (!propertyCode) {
    return {
      success: false,
      error: "UPDATE_PROPERTY_STATUS_INMOVILLA sin propertyCode",
      permanent: true,
    };
  }

  if (estadoficha === null) {
    return {
      success: false,
      error: "UPDATE_PROPERTY_STATUS_INMOVILLA sin estadoficha numérico",
      permanent: true,
    };
  }

  const client = createInmovillaRestClient();

  const patch: Record<string, unknown> = { estadoficha: String(estadoficha) };
  if (buyerClientCode) {
    patch.keycli = String(buyerClientCode);
  }

  try {
    const result = await safeUpdateProperty(
      client,
      { ref: propertyCode },
      patch,
    );

    if (!result.ok) {
      return {
        success: false,
        error: `safeUpdateProperty devolvió ok=false para ref=${propertyCode}`,
      };
    }

    console.log(
      `[operacion] UPDATE_PROPERTY_STATUS_INMOVILLA job ${job.id} — ref=${propertyCode} estadoficha=${estadoficha}` +
        (buyerClientCode ? ` keycli=${buyerClientCode}` : "") +
        " OK" +
        (result.removedFields.length > 0
          ? ` (campos removidos: ${result.removedFields.join(", ")})`
          : ""),
    );

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[operacion] UPDATE_PROPERTY_STATUS_INMOVILLA job ${job.id} — error: ${message}`,
    );
    return { success: false, error: message };
  }
}
