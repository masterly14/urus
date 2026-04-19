import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import type { DemandSnapshotData } from "./types";
import { classifyError } from "../errors";
import { extractRefConsultadaFromDemandMap } from "@/lib/inmovilla/api/ref-consultada";

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
    telefono: d.telefono ?? "",
  };
}

/** Hard cap to prevent OOM on unbounded snapshot load. Sized for current catalogue (~5k demands). */
const DEMAND_SNAPSHOT_LOAD_LIMIT = 10_000;

export async function loadPreviousDemandSnapshot(): Promise<DemandSnapshotMap> {
  const rows = await withDbRetry(
    () => prisma.demandSnapshot.findMany({ take: DEMAND_SNAPSHOT_LOAD_LIMIT }),
    "loadPreviousDemandSnapshot",
  );
  const map: DemandSnapshotMap = new Map();

  for (const row of rows) {
    const rawObj =
      row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
        ? (row.raw as Record<string, unknown>)
        : {};
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
      telefono: row.telefono ?? "",
      refConsultada: extractRefConsultadaFromDemandMap(rawObj),
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
