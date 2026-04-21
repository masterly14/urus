/**
 * Helpers para actualizar el LeadStatus interno de una demanda.
 *
 * El estado se persiste en DemandCurrent.leadStatus y representa el ciclo de
 * vida del lead dentro de nuestro pipeline.
 *
 * Opcionalmente, si ENABLE_INMOVILLA_STATUS_SYNC=true, al llegar a estados
 * terminales (CERRADO, PERDIDO) se encola una escritura de demandas-keysitu
 * en Inmovilla vía guardar.php.
 *
 * Ver docs/lead-status-pipeline.md para la máquina de estados completa.
 */

import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";
import { appendEvent } from "@/lib/event-store";
import type { LeadStatus } from "@prisma/client";
import type { JsonValue } from "@/lib/event-store/types";

const INMOVILLA_STATUS_MAP: Partial<Record<LeadStatus, string>> = {
  CERRADO: "26",
  PERDIDO: "23",
};

function isInmovillaStatusSyncEnabled(): boolean {
  return process.env.ENABLE_INMOVILLA_STATUS_SYNC === "true";
}

/**
 * Actualiza el LeadStatus de una demanda identificada por su código (demandId).
 * Es una operación best-effort: si la demanda no existe en demands_current el
 * updateMany no afecta ningún registro y no lanza error.
 *
 * Si ENABLE_INMOVILLA_STATUS_SYNC=true y el estado es terminal (CERRADO/PERDIDO),
 * encola WRITE_TO_INMOVILLA con updateDemandStatus.
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
    return;
  }

  console.log(
    `[lead-status] demandId=${demandId} → leadStatus=${status}`,
  );

  const keysitu = INMOVILLA_STATUS_MAP[status];
  if (!keysitu || !isInmovillaStatusSyncEnabled()) return;

  try {
    const snapshot = await prisma.demandSnapshot.findUnique({
      where: { codigo: demandId },
      select: { ref: true, raw: true },
    });
    if (!snapshot) return;

    const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
    const pick = (keys: string[]): string | null => {
      for (const k of keys) {
        const v = raw[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number" && v > 0) return String(v);
      }
      return null;
    };

    const clientId = pick(["keycli", "cod_cli", "clientes-cod_cli", "clientes-cod_clipriclave"]);
    const agentId = pick(["keyagente", "demandas-keyagente", "idUsuario", "agente"]);
    const propertyTypes = pick(["tipopropiedad", "tipos"]) ?? "";
    const demandRef = snapshot.ref?.trim() || demandId;

    if (!clientId || !agentId) {
      console.warn(
        `[lead-status] Status sync skipped for ${demandId}: missing clientId or agentId`,
      );
      return;
    }

    const event = await appendEvent({
      type: "DEMANDA_ACTUALIZADA",
      aggregateType: "DEMAND",
      aggregateId: demandId,
      payload: {
        source: "status-sync-inmovilla",
        keysitu,
        leadStatus: status,
      } as unknown as JsonValue,
    });

    await enqueueJob({
      type: "WRITE_TO_INMOVILLA",
      payload: {
        operation: "updateDemandStatus",
        args: {
          demandId,
          demandRef,
          clientId,
          agentId,
          propertyTypes,
          keysitu,
        },
      },
      idempotencyKey: `write_to_inmovilla:updateDemandStatus:${event.id}`,
      sourceEventId: event.id,
    });

    console.log(
      `[lead-status] demandId=${demandId} → enqueued WRITE_TO_INMOVILLA updateDemandStatus keysitu=${keysitu}`,
    );
  } catch (err) {
    console.warn(
      `[lead-status] Inmovilla status sync failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
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
