import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";
import type { PropertySnapshotData } from "./types";

export type SnapshotMap = Map<string, PropertySnapshotData>;

function str(v: unknown): string {
  return v != null && v !== "" ? String(v) : "";
}

function toSnapshotData(p: InmovillaProperty): PropertySnapshotData {
  return {
    codigo: str(p.codigo),
    ref: str(p.ref),
    titulo: str(p.titulo),
    tipoOfer: str(p.tipoOfer),
    precio: Number(p.precio) || 0,
    metrosConstruidos: Number(p.metrosConstruidos) || 0,
    habitaciones: Number(p.habitaciones) || 0,
    banyos: Number(p.banyos) || 0,
    ciudad: str(p.ciudad),
    zona: str(p.zona),
    estado: str(p.estado),
    fechaAlta: str(p.fechaAlta),
    fechaActualizacion: str(p.fechaActualizacion),
    numFotos: Number(p.numFotos) || 0,
    agente: str(p.agente),
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
