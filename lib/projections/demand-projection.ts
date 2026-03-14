import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EventRecord } from "@/lib/event-store/types";
import type { ProjectionApplyResult } from "./types";

type DemandPayloadSnapshot = {
  codigo: string;
  ref: string;
  nombre: string;
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
  estadoId: string;
  estadoNombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  fechaActualizacion: string;
};

function str(v: unknown): string {
  return v != null && v !== "" ? String(v) : "";
}

function num(v: unknown): number {
  return Number(v) || 0;
}

function int(v: unknown): number {
  return Math.round(num(v));
}

function snapshotToUpsertData(
  snapshot: DemandPayloadSnapshot,
  event: EventRecord,
): { create: Prisma.DemandCurrentCreateInput; update: Prisma.DemandCurrentUpdateInput } {
  const base = {
    ref: str(snapshot.ref),
    nombre: str(snapshot.nombre),
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

    default:
      console.warn(`[projection:demand] Tipo no soportado: ${event.type}`);
      return { success: true, aggregateId: codigo };
  }
}
