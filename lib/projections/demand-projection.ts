import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EventRecord } from "@/lib/event-store/types";
import type { ProjectionApplyResult } from "./types";
import { str, num, int } from "@/lib/utils/normalize";

type DemandPayloadSnapshot = {
  codigo: string;
  ref: string;
  nombre: string;
  /** Teléfono contacto/comprador si la ingesta lo incluye. */
  telefono?: string;
  estadoId: string;
  estadoNombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  fechaActualizacion: string;
  agente: string;
};

type DemandModifiedAfter = {
  telefono?: string;
  estadoId: string;
  estadoNombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  fechaActualizacion: string;
};

function listToString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const cleaned = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
    if (cleaned.length === 0) return undefined;
    return cleaned.join(", ");
  }
  return undefined;
}

function snapshotToUpsertData(
  snapshot: DemandPayloadSnapshot,
  event: EventRecord,
): { create: Prisma.DemandCurrentCreateInput; update: Prisma.DemandCurrentUpdateInput } {
  const base = {
    ref: str(snapshot.ref),
    nombre: str(snapshot.nombre),
    telefono: str(snapshot.telefono ?? ""),
    estadoId: str(snapshot.estadoId),
    estadoNombre: str(snapshot.estadoNombre),
    presupuestoMin: num(snapshot.presupuestoMin),
    presupuestoMax: num(snapshot.presupuestoMax),
    habitacionesMin: int(snapshot.habitacionesMin),
    tipos: str(snapshot.tipos),
    zonas: str(snapshot.zonas),
    fechaActualizacion: str(snapshot.fechaActualizacion),
    agente: str(snapshot.agente),
    lastEventId: event.id,
    lastEventPosition: event.position,
    lastEventAt: event.occurredAt,
  };

  return {
    create: { codigo: str(snapshot.codigo), ...base },
    update: base,
  };
}

export async function applyDemandProjection(
  event: EventRecord,
): Promise<ProjectionApplyResult> {
  const codigo = event.aggregateId;

  switch (event.type) {
    case "DEMANDA_CREADA": {
      const payload = event.payload as { snapshot?: DemandPayloadSnapshot };
      if (!payload.snapshot) {
        return { success: false, aggregateId: codigo, error: "Payload sin snapshot" };
      }

      const { create, update } = snapshotToUpsertData(payload.snapshot, event);
      await prisma.demandCurrent.upsert({
        where: { codigo },
        create,
        update,
      });

      console.log(`[projection:demand] DEMANDA_CREADA codigo=${codigo} — upserted`);
      return { success: true, aggregateId: codigo };
    }

    case "DEMANDA_MODIFICADA": {
      const payload = event.payload as { after?: DemandModifiedAfter };
      if (!payload.after) {
        return { success: false, aggregateId: codigo, error: "Payload sin campo after" };
      }

      const after = payload.after;
      await prisma.demandCurrent.upsert({
        where: { codigo },
        create: {
          codigo,
          telefono: str(after.telefono ?? ""),
          estadoId: str(after.estadoId),
          estadoNombre: str(after.estadoNombre),
          presupuestoMin: num(after.presupuestoMin),
          presupuestoMax: num(after.presupuestoMax),
          habitacionesMin: int(after.habitacionesMin),
          tipos: str(after.tipos),
          zonas: str(after.zonas),
          fechaActualizacion: str(after.fechaActualizacion),
          lastEventId: event.id,
          lastEventPosition: event.position,
          lastEventAt: event.occurredAt,
        },
        update: {
          ...(typeof after.telefono === "string" ? { telefono: str(after.telefono) } : {}),
          estadoId: str(after.estadoId),
          estadoNombre: str(after.estadoNombre),
          presupuestoMin: num(after.presupuestoMin),
          presupuestoMax: num(after.presupuestoMax),
          habitacionesMin: int(after.habitacionesMin),
          tipos: str(after.tipos),
          zonas: str(after.zonas),
          fechaActualizacion: str(after.fechaActualizacion),
          lastEventId: event.id,
          lastEventPosition: event.position,
          lastEventAt: event.occurredAt,
        },
      });

      console.log(`[projection:demand] DEMANDA_MODIFICADA codigo=${codigo} — updated`);
      return { success: true, aggregateId: codigo };
    }

    case "DEMANDA_ESTADO_CAMBIADO": {
      const payload = event.payload as { snapshot?: DemandPayloadSnapshot };
      if (!payload.snapshot) {
        return { success: false, aggregateId: codigo, error: "Payload sin snapshot" };
      }

      const { create, update } = snapshotToUpsertData(payload.snapshot, event);
      await prisma.demandCurrent.upsert({
        where: { codigo },
        create,
        update,
      });

      console.log(`[projection:demand] DEMANDA_ESTADO_CAMBIADO codigo=${codigo} — upserted`);
      return { success: true, aggregateId: codigo };
    }

    case "DEMANDA_ACTUALIZADA": {
      const payload = event.payload as {
        variables?: {
          precioMin?: number;
          precioMax?: number;
          habitacionesMin?: number;
          zonas?: string[] | string;
          tipos?: string[] | string;
        };
        detectedAt?: string;
      };

      const v = payload.variables ?? {};
      const updatedAt =
        typeof payload.detectedAt === "string" ? payload.detectedAt : new Date().toISOString();

      const tipos = listToString(v.tipos);
      const zonas = listToString(v.zonas);

      await prisma.demandCurrent.upsert({
        where: { codigo },
        create: {
          codigo,
          telefono: "",
          presupuestoMin: num(v.precioMin ?? 0),
          presupuestoMax: num(v.precioMax ?? 0),
          habitacionesMin: int(v.habitacionesMin ?? 0),
          tipos: str(tipos ?? ""),
          zonas: str(zonas ?? ""),
          fechaActualizacion: str(updatedAt),
          lastEventId: event.id,
          lastEventPosition: event.position,
          lastEventAt: event.occurredAt,
        },
        update: {
          ...(typeof v.precioMin === "number" ? { presupuestoMin: num(v.precioMin) } : {}),
          ...(typeof v.precioMax === "number" ? { presupuestoMax: num(v.precioMax) } : {}),
          ...(typeof v.habitacionesMin === "number"
            ? { habitacionesMin: int(v.habitacionesMin) }
            : {}),
          ...(tipos ? { tipos: str(tipos) } : {}),
          ...(zonas ? { zonas: str(zonas) } : {}),
          fechaActualizacion: str(updatedAt),
          lastEventId: event.id,
          lastEventPosition: event.position,
          lastEventAt: event.occurredAt,
        },
      });

      console.log(`[projection:demand] DEMANDA_ACTUALIZADA codigo=${codigo} — updated`);
      return { success: true, aggregateId: codigo };
    }

    default:
      console.warn(`[projection:demand] Tipo no soportado: ${event.type}`);
      return { success: true, aggregateId: codigo };
  }
}
