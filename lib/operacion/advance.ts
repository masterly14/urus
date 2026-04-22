import type { OperacionEstado, Operacion } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { isAdvance, isTerminal, documentKindForStage, skippedStages } from "./stages";
import { syncLeadStatusFromOperacion } from "./sync-lead-status";
import {
  validateStageRequirements,
  requirementsForSkippedAndTarget,
  type MissingFieldResult,
} from "./stage-requirements";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface AdvanceResult {
  ok: boolean;
  missingFields?: MissingFieldResult[];
  operacion?: Operacion;
  documentKind?: string | null;
  error?: string;
}

export interface AdvanceParams {
  operacionId: string;
  targetEstado: OperacionEstado;
  manualData?: Record<string, unknown>;
  comercialId: string;
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Avanza una operación a `targetEstado`. Permite saltar etapas intermedias
 * ("force"), pero valida los datos requeridos por la etapa destino.
 *
 * Flujo:
 * 1. Cargar operación, validar que no es terminal
 * 2. Validar que es un avance real (no retroceso ni mismo estado)
 * 3. Si la etapa destino tiene documento asociado: validar datos
 * 4. Actualizar `Operacion.estado`
 * 5. Emitir evento `OPERACION_AVANZADA`
 * 6. Sincronizar `LeadStatus` vía `syncLeadStatusFromOperacion`
 */
export async function advanceOperacion(
  params: AdvanceParams,
): Promise<AdvanceResult> {
  const { operacionId, targetEstado, manualData, comercialId } = params;

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
  });

  if (!operacion) {
    return { ok: false, error: `Operación ${operacionId} no encontrada` };
  }

  if (isTerminal(operacion.estado)) {
    return {
      ok: false,
      error: `Operación ${operacion.codigo} está en estado terminal (${operacion.estado})`,
    };
  }

  if (isTerminal(targetEstado)) {
    return {
      ok: false,
      error: "Para cerrar o cancelar una operación usa closeOperacion o cancelOperacion",
    };
  }

  if (!isAdvance(operacion.estado, targetEstado)) {
    return {
      ok: false,
      error: `No es un avance válido: ${operacion.estado} → ${targetEstado}`,
    };
  }

  const docKind = documentKindForStage(targetEstado);

  if (docKind) {
    const skipped = skippedStages(operacion.estado, targetEstado);
    const allRequirements = requirementsForSkippedAndTarget(skipped, targetEstado);

    if (allRequirements.length > 0) {
      const availableData = manualData ?? {};
      const missing = validateStageRequirements(targetEstado, availableData);

      if (missing.length > 0) {
        return { ok: false, missingFields: missing, documentKind: docKind };
      }
    }
  }

  const previousEstado = operacion.estado;
  const updated = await prisma.operacion.update({
    where: { id: operacionId },
    data: { estado: targetEstado },
  });

  await appendEvent({
    type: "OPERACION_AVANZADA",
    aggregateType: "OPERACION",
    aggregateId: operacion.propertyCode,
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      propertyCode: operacion.propertyCode,
      previousEstado,
      newEstado: targetEstado,
      comercialId,
      documentKind: docKind,
      skippedStages: skippedStages(previousEstado, targetEstado),
    } as unknown as JsonValue,
  });

  await syncLeadStatusFromOperacion(operacion.id, targetEstado);

  console.log(
    `[operacion] ${operacion.codigo} avanzada: ${previousEstado} → ${targetEstado} por comercial=${comercialId}`,
  );

  return { ok: true, operacion: updated, documentKind: docKind };
}
