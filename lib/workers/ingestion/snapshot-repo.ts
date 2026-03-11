import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertySnapshotData } from "./types";

export type SnapshotMap = Map<string, PropertySnapshotData>;

function toSnapshotData(p: InmovillaProperty): PropertySnapshotData {
  return {
    codigo: p.codigo,
    ref: p.ref,
    titulo: p.titulo,
    tipoOfer: p.tipoOfer,
    precio: p.precio,
    metrosConstruidos: p.metrosConstruidos,
    habitaciones: p.habitaciones,
    banyos: p.banyos,
    ciudad: p.ciudad,
    zona: p.zona,
    estado: p.estado,
    fechaAlta: p.fechaAlta,
    fechaActualizacion: p.fechaActualizacion,
    numFotos: p.numFotos,
    agente: p.agente,
  };
}

export async function loadPreviousSnapshot(): Promise<SnapshotMap> {
  const rows = await prisma.propertySnapshot.findMany();
  const map: SnapshotMap = new Map();
  for (const row of rows) {
    map.set(row.codigo, {
      codigo: row.codigo,
      ref: row.ref,
      titulo: row.titulo,
      tipoOfer: row.tipoOfer,
      precio: row.precio,
      metrosConstruidos: row.metrosConstruidos,
      habitaciones: row.habitaciones,
      banyos: row.banyos,
      ciudad: row.ciudad,
      zona: row.zona,
      estado: row.estado,
      fechaAlta: row.fechaAlta,
      fechaActualizacion: row.fechaActualizacion,
      numFotos: row.numFotos,
      agente: row.agente,
    });
  }
  return map;
}

export async function saveCurrentSnapshot(
  properties: InmovillaProperty[],
  now?: Date,
): Promise<void> {
  const ts = now ?? new Date();

  await prisma.$transaction(
    properties.map((p) => {
      const data = toSnapshotData(p);
      return prisma.propertySnapshot.upsert({
        where: { codigo: p.codigo },
        create: {
          ...data,
          raw: (p.raw ?? {}) as Prisma.InputJsonValue,
          firstSeenAt: ts,
          lastSeenAt: ts,
        },
        update: {
          ...data,
          raw: (p.raw ?? {}) as Prisma.InputJsonValue,
          lastSeenAt: ts,
        },
      });
    }),
  );
}
