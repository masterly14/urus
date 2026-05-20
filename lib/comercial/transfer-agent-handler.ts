import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { safeUpdateProperty } from "@/lib/inmovilla/rest/safe-update";

function isRateLimitError(message: string): boolean {
  return /408|Has superado el límite|límite de peticiones/i.test(message);
}

function isInvalidTargetAgentError(message: string): boolean {
  return /keyagente/i.test(message) && /no es valido|no válido|requerido|required/i.test(message);
}

function shouldFallbackToSafeUpdate(message: string): boolean {
  // El contrato oficial de Inmovilla para editar propiedades indica reenviar
  // la ficha completa. Si el update mínimo falla por validación de payload,
  // hacemos fallback al safe update (merge de ficha + retry adaptativo).
  return /406|400003|campo .*requerido|no es valido|no válido/i.test(message);
}

function resolveSafeUpdateMaxAttempts(): number {
  const raw = process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
}

/**
 * Job handler para TRANSFER_PROPERTY_AGENT.
 *
 * Actualiza el agente gestor (`keyagente`) de una propiedad en Inmovilla.
 *
 * Estrategia:
 *  1) Intento mínimo: POST /propiedades/ con { ref, keyagente }.
 *     - Reduce requests y evita golpear rate-limit con payloads grandes.
 *  2) Fallback: si el mínimo falla por validación de payload/contrato, usa
 *     safeUpdateProperty (GET actual + merge + retry adaptativo por campo).
 *
 * Se encola cuando un Comercial es eliminado y sus propiedades se transfieren.
 *
 * Payload esperado:
 *   - propertyRef: string   (ref de la propiedad en Inmovilla, de PropertyCurrent.ref)
 *   - newKeyagente: number  (Comercial.inmovillaAgentId del comercial destino)
 *   - comercialTransferId?: string  (id interno del comercial destino, para trazabilidad)
 */
export async function handleTransferPropertyAgent(job: JobRecord): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const propertyRef = typeof payload.propertyRef === "string" ? payload.propertyRef.trim() : "";
  const newKeyagente =
    typeof payload.newKeyagente === "number"
      ? payload.newKeyagente
      : typeof payload.newKeyagente === "string"
        ? parseInt(payload.newKeyagente, 10)
        : null;
  const comercialTransferId =
    typeof payload.comercialTransferId === "string" ? payload.comercialTransferId : undefined;

  if (!propertyRef) {
    return {
      success: false,
      error: "TRANSFER_PROPERTY_AGENT sin propertyRef",
      permanent: true,
    };
  }

  if (newKeyagente === null || isNaN(newKeyagente)) {
    return {
      success: false,
      error: "TRANSFER_PROPERTY_AGENT sin newKeyagente numérico válido",
      permanent: true,
    };
  }

  const client = createInmovillaRestClient();
  const keyagenteStr = String(newKeyagente);

  try {
    // 1) Path optimizado: update mínimo.
    try {
      await client.post("/propiedades/", {
        ref: propertyRef,
        keyagente: keyagenteStr,
      });
      console.log(
        `[transfer-agent] TRANSFER_PROPERTY_AGENT job ${job.id} — ref=${propertyRef} keyagente=${newKeyagente}` +
          (comercialTransferId ? ` transferTo=${comercialTransferId}` : "") +
          " OK (payload mínimo)",
      );
      return { success: true };
    } catch (minimalErr) {
      const message = minimalErr instanceof Error ? minimalErr.message : String(minimalErr);

      if (isRateLimitError(message)) {
        return { success: false, error: message };
      }

      if (isInvalidTargetAgentError(message)) {
        return {
          success: false,
          error: message,
          permanent: true,
        };
      }

      if (!shouldFallbackToSafeUpdate(message)) {
        return { success: false, error: message };
      }

      // 2) Fallback de compatibilidad con contrato de edición completa.
      console.warn(
        `[transfer-agent] ref=${propertyRef} fallback a safeUpdateProperty tras fallo de payload mínimo: ${message}`,
      );
    }

    const result = await safeUpdateProperty(client, { ref: propertyRef }, { keyagente: keyagenteStr }, {
      maxAttempts: resolveSafeUpdateMaxAttempts(),
    });
    if (!result.ok) {
      return {
        success: false,
        error: `safeUpdateProperty devolvió ok=false para ref=${propertyRef}`,
      };
    }

    console.log(
      `[transfer-agent] TRANSFER_PROPERTY_AGENT job ${job.id} — ref=${propertyRef} keyagente=${newKeyagente}` +
        (comercialTransferId ? ` transferTo=${comercialTransferId}` : "") +
        " OK (safe-update fallback)" +
        (result.removedFields.length > 0
          ? ` (campos removidos: ${result.removedFields.join(", ")})`
          : ""),
    );

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[transfer-agent] TRANSFER_PROPERTY_AGENT job ${job.id} — ref=${propertyRef} error: ${message}`,
    );
    return { success: false, error: message };
  }
}
