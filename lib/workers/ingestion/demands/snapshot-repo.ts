import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import type { DemandSnapshotData } from "./types";
import { classifyError } from "../errors";

async function withDbRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1_000;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const classified = classifyError(err);
      if (!classified.retryable || classified.code !== "DB_ERROR" || attempt >= MAX_RETRIES) {
        throw err;
      }
      const waitMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[demand-snapshot-repo] ${label} — DB error (intento ${attempt}/${MAX_RETRIES}), reintentando en ${waitMs}ms: ${classified.message}`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export type DemandSnapshotMap = Map<string, DemandSnapshotData>;

function toSnapshotData(d: InmovillaDemand): DemandSnapshotData {
  return {
    codigo: d.codigo,
    ref: d.ref,
    nombre: d.nombre,
    estadoId: d.estadoId,
    estadoNombre: d.estadoNombre,
    presupuestoMin: d.presupuestoMin,
    presupuestoMax: d.presupuestoMax,
    habitacionesMin: d.habitacionesMin,
    tipos: d.tipos,
    zonas: d.zonas,
    fechaActualizacion: d.fechaActualizacion,
    agente: d.agente,
  };
}

export async function loadPreviousDemandSnapshot(): Promise<DemandSnapshotMap> {
  const rows = await withDbRetry(
    () => prisma.demandSnapshot.findMany(),
    "loadPreviousDemandSnapshot",
  );
  const map: DemandSnapshotMap = new Map();

  for (const row of rows) {
    map.set(row.codigo, {
      codigo: row.codigo,
      ref: row.ref,
      nombre: row.nombre,
      estadoId: row.estadoId,
      estadoNombre: row.estadoNombre,
      presupuestoMin: row.presupuestoMin,
      presupuestoMax: row.presupuestoMax,
      habitacionesMin: row.habitacionesMin,
      tipos: row.tipos,
      zonas: row.zonas,
      fechaActualizacion: row.fechaActualizacion,
      agente: row.agente,
    });
  }

  return map;
}

export async function saveCurrentDemandSnapshot(
  demands: InmovillaDemand[],
  now?: Date,
): Promise<void> {
  const ts = now ?? new Date();

  await withDbRetry(
    () =>
      prisma.$transaction(
        demands.map((d) => {
          const data = toSnapshotData(d);
          return prisma.demandSnapshot.upsert({
            where: { codigo: d.codigo },
            create: {
              ...data,
              raw: (d.raw ?? {}) as Prisma.InputJsonValue,
              firstSeenAt: ts,
              lastSeenAt: ts,
            },
            update: {
              ...data,
              raw: (d.raw ?? {}) as Prisma.InputJsonValue,
              lastSeenAt: ts,
            },
          });
        }),
      ),
    "saveCurrentDemandSnapshot",
  );
}
