/**
 * Orquestador de jobs de transferencia al eliminar un Comercial.
 *
 * Encola dos tipos de jobs por cada registro reasignado:
 *  - TRANSFER_PROPERTY_AGENT (REST v1) — actualiza `keyagente` en Inmovilla.
 *  - WRITE_TO_INMOVILLA / updateDemandAgent (legacy guardar.php) — actualiza
 *    `demandas-keyagente` en Inmovilla.
 *
 * Si el comercial destino no tiene `inmovillaAgentId`, solo se habrá actualizado
 * la BD local (hecho ya en la transacción del caller); no se encola ningún job.
 *
 * Idempotencia: la `idempotencyKey` es única por (codigo, target.id), por lo que
 * llamar a este helper dos veces para la misma operación no duplica jobs.
 */

import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";

export type TransferTarget = {
  id: string;
  nombre: string;
  inmovillaAgentId: number | null;
};

export type TransferProperty = {
  codigo: string;
  ref: string;
};

export type TransferDemand = {
  codigo: string;
  ref: string;
  tipos: string;
};

export type EnqueueTransferJobsResult = {
  propertyJobsEnqueued: number;
  demandJobsEnqueued: number;
  skipped: string[];
};

/**
 * Encola los jobs de Inmovilla para transferir propiedades y demandas al nuevo
 * comercial. Debe llamarse DESPUÉS de la transacción Prisma que reasignó los
 * `comercialId` en BD.
 */
export async function enqueueTransferJobs(params: {
  properties: TransferProperty[];
  demands: TransferDemand[];
  target: TransferTarget;
}): Promise<EnqueueTransferJobsResult> {
  const { properties, demands, target } = params;
  const skipped: string[] = [];
  let propertyJobsEnqueued = 0;
  let demandJobsEnqueued = 0;

  if (target.inmovillaAgentId === null) {
    console.warn(
      `[transfer-jobs] Comercial destino ${target.id} (${target.nombre}) no tiene inmovillaAgentId. ` +
        `DB actualizada localmente; NO se encolan jobs de Inmovilla para ${properties.length} propiedades y ${demands.length} demandas.`,
    );
    return { propertyJobsEnqueued: 0, demandJobsEnqueued: 0, skipped: [] };
  }

  // --- Propiedades (REST v1) ---
  for (const prop of properties) {
    if (!prop.ref.trim()) {
      skipped.push(`property:${prop.codigo} (sin ref)`);
      continue;
    }

    try {
      await enqueueJob({
        type: "TRANSFER_PROPERTY_AGENT",
        payload: {
          propertyRef: prop.ref,
          newKeyagente: target.inmovillaAgentId,
          comercialTransferId: target.id,
        },
        idempotencyKey: `transfer-property:${prop.codigo}:${target.id}`,
      });
      propertyJobsEnqueued++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Unique constraint|P2002/i.test(msg)) {
        // Job ya encolado para esta combinación — idempotente, OK.
        propertyJobsEnqueued++;
      } else {
        throw err;
      }
    }
  }

  // --- Demandas (legacy guardar.php via updateDemandAgent) ---
  if (demands.length > 0) {
    // Obtener keycli (cod_cli) de los snapshots de demanda en un solo query.
    const codigosSet = demands.map((d) => d.codigo);
    const snapshots = await prisma.demandSnapshot.findMany({
      where: { codigo: { in: codigosSet } },
      select: { codigo: true, raw: true },
    });

    const keycliByCodigoMap = new Map<string, string>();
    for (const snap of snapshots) {
      const raw = snap.raw as Record<string, unknown>;
      const keycli = raw?.keycli;
      if (keycli !== undefined && keycli !== null && String(keycli).trim() !== "") {
        keycliByCodigoMap.set(snap.codigo, String(keycli));
      }
    }

    for (const demand of demands) {
      const clientId = keycliByCodigoMap.get(demand.codigo);

      if (!clientId) {
        skipped.push(`demand:${demand.codigo} (sin keycli en snapshot)`);
        continue;
      }

      if (!demand.ref.trim()) {
        skipped.push(`demand:${demand.codigo} (sin ref)`);
        continue;
      }

      try {
        await enqueueJob({
          type: "WRITE_TO_INMOVILLA",
          payload: {
            operation: "updateDemandAgent",
            args: {
              demandId: demand.codigo,
              demandRef: demand.ref,
              clientId,
              agentId: String(target.inmovillaAgentId),
              newAgentId: String(target.inmovillaAgentId),
              propertyTypes: demand.tipos,
            },
          },
          idempotencyKey: `transfer-demand:${demand.codigo}:${target.id}`,
        });
        demandJobsEnqueued++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/Unique constraint|P2002/i.test(msg)) {
          demandJobsEnqueued++;
        } else {
          throw err;
        }
      }
    }
  }

  if (skipped.length > 0) {
    console.warn(
      `[transfer-jobs] ${skipped.length} registros omitidos del job de Inmovilla: ${skipped.join(", ")}`,
    );
  }

  console.log(
    `[transfer-jobs] Transfer completado → target=${target.id} (${target.nombre}) ` +
      `keyagente=${target.inmovillaAgentId} ` +
      `propiedades=${propertyJobsEnqueued}/${properties.length} demandas=${demandJobsEnqueued}/${demands.length} ` +
      `omitidos=${skipped.length}`,
  );

  return { propertyJobsEnqueued, demandJobsEnqueued, skipped };
}
