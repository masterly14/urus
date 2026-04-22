import type { OperacionEstado, LeadStatus } from "@prisma/client";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import { prisma } from "@/lib/prisma";

/**
 * Mapeo OperacionEstado → LeadStatus para sincronización automática.
 * CANCELADA queda fuera a propósito: el comercial decide manualmente.
 */
const ESTADO_TO_LEAD_STATUS: Partial<Record<OperacionEstado, LeadStatus>> = {
  OFERTA_FIRME: "EN_NEGOCIACION",
  RESERVA: "EN_NEGOCIACION",
  ARRAS: "EN_NEGOCIACION",
  PENDIENTE_FIRMA: "EN_FIRMA",
  CERRADA_VENTA: "CERRADO",
  CERRADA_ALQUILER: "CERRADO",
  CERRADA_TRASPASO: "CERRADO",
};

/**
 * Sincroniza `DemandCurrent.leadStatus` a partir de un cambio en
 * `Operacion.estado`. No-op si:
 * - El estado no tiene mapeo (EN_CURSO, CANCELADA)
 * - La operación no tiene demandId vinculada
 */
export async function syncLeadStatusFromOperacion(
  operacionId: string,
  newEstado: OperacionEstado,
): Promise<void> {
  const targetLeadStatus = ESTADO_TO_LEAD_STATUS[newEstado];
  if (!targetLeadStatus) return;

  const op = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { demandId: true },
  });
  if (!op?.demandId) return;

  await updateDemandLeadStatus(op.demandId, targetLeadStatus);
}

/**
 * Dado un `OperacionEstado`, retorna el `LeadStatus` que le corresponde,
 * o `null` si no hay sincronización automática para ese estado.
 */
export function leadStatusForOperacionEstado(
  estado: OperacionEstado,
): LeadStatus | null {
  return ESTADO_TO_LEAD_STATUS[estado] ?? null;
}
