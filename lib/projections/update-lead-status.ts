/**
 * Helpers para actualizar el LeadStatus interno de una demanda.
 *
 * El estado se persiste en DemandCurrent.leadStatus y representa el ciclo de
 * vida del lead dentro de nuestro pipeline. No se sincroniza con Inmovilla.
 * Ver docs/lead-status-pipeline.md para la máquina de estados completa.
 */

import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@prisma/client";

/**
 * Actualiza el LeadStatus de una demanda identificada por su código (demandId).
 * Es una operación best-effort: si la demanda no existe en demands_current el
 * updateMany no afecta ningún registro y no lanza error.
 */
export async function updateDemandLeadStatus(
  demandId: string,
  status: LeadStatus,
): Promise<void> {
  const result = await prisma.demandCurrent.updateMany({
    where: { codigo: demandId },
    data: { leadStatus: status },
  });
  if (result.count === 0) {
    console.warn(
      `[lead-status] updateDemandLeadStatus: no DemandCurrent found for demandId=${demandId} — status=${status} not applied`,
    );
  } else {
    console.log(
      `[lead-status] demandId=${demandId} → leadStatus=${status}`,
    );
  }
}

/**
 * Actualiza el LeadStatus buscando la demanda a través de una Operacion.
 * Acepta tanto el `id` (cuid) como el `codigo` (ej: "OP-2026-0001")
 * para cubrir callers que propagan uno u otro formato.
 * Si la operacion no tiene demandId vinculado, la actualización se omite.
 */
export async function updateLeadStatusByOperationId(
  operationId: string,
  status: LeadStatus,
): Promise<void> {
  const op = await prisma.operacion.findFirst({
    where: {
      OR: [{ id: operationId }, { codigo: operationId }],
    },
    select: { demandId: true },
  });

  if (!op?.demandId) {
    console.warn(
      `[lead-status] updateLeadStatusByOperationId: operationId=${operationId} sin demandId vinculado — status=${status} no aplicado`,
    );
    return;
  }

  await updateDemandLeadStatus(op.demandId, status);
}
