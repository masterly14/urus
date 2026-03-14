import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EventRecord } from "@/lib/event-store/types";
import type { ProjectionApplyResult } from "./types";

type PropertyPayloadSnapshot = {
  codigo: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  fechaAlta: string;
  fechaActualizacion: string;
  numFotos: number;
  agente: string;
};

type PropertyModifiedAfter = {
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
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
  snapshot: PropertyPayloadSnapshot,
  event: EventRecord,
): { create: Prisma.PropertyCurrentCreateInput; update: Prisma.PropertyCurrentUpdateInput } {
  const base = {
    ref: str(snapshot.ref),
    titulo: str(snapshot.titulo),
    tipoOfer: str(snapshot.tipoOfer),
    precio: num(snapshot.precio),
    metrosConstruidos: num(snapshot.metrosConstruidos),
    habitaciones: int(snapshot.habitaciones),
    banyos: int(snapshot.banyos),
    ciudad: str(snapshot.ciudad),
    zona: str(snapshot.zona),
    estado: str(snapshot.estado),
    fechaAlta: str(snapshot.fechaAlta),
    fechaActualizacion: str(snapshot.fechaActualizacion),
    numFotos: int(snapshot.numFotos),
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

function handlePropertyCreated(event: EventRecord): ProjectionApplyResult {
  const payload = event.payload as { snapshot?: PropertyPayloadSnapshot };
  if (!payload.snapshot) {
    return { success: false, aggregateId: event.aggregateId, error: "Payload sin snapshot" };
  }
  return { success: true, aggregateId: event.aggregateId };
}

function handlePropertyModified(event: EventRecord): ProjectionApplyResult {
  const payload = event.payload as { after?: PropertyModifiedAfter };
  if (!payload.after) {
    return { success: false, aggregateId: event.aggregateId, error: "Payload sin campo after" };
  }
  return { success: true, aggregateId: event.aggregateId };
}

function handleEstadoCambiado(event: EventRecord): ProjectionApplyResult {
  const payload = event.payload as { snapshot?: PropertyPayloadSnapshot };
  if (!payload.snapshot) {
    return { success: false, aggregateId: event.aggregateId, error: "Payload sin snapshot" };
  }
  return { success: true, aggregateId: event.aggregateId };
}

export async function applyPropertyProjection(
  event: EventRecord,
): Promise<ProjectionApplyResult> {
  const codigo = event.aggregateId;

  switch (event.type) {
    case "PROPIEDAD_CREADA": {
      const validation = handlePropertyCreated(event);
      if (!validation.success) return validation;

      const payload = event.payload as { snapshot: PropertyPayloadSnapshot };
      const { create, update } = snapshotToUpsertData(payload.snapshot, event);

      await prisma.propertyCurrent.upsert({
        where: { codigo },
        create,
        update,
      });

      console.log(`[projection:property] PROPIEDAD_CREADA codigo=${codigo} — upserted`);
      return { success: true, aggregateId: codigo };
    }

    case "PROPIEDAD_MODIFICADA": {
      const validation = handlePropertyModified(event);
      if (!validation.success) return validation;

      const payload = event.payload as { after: PropertyModifiedAfter };
      const after = payload.after;

      await prisma.propertyCurrent.upsert({
        where: { codigo },
        create: {
          codigo,
          precio: num(after.precio),
          metrosConstruidos: num(after.metrosConstruidos),
          habitaciones: int(after.habitaciones),
          banyos: int(after.banyos),
          ciudad: str(after.ciudad),
          zona: str(after.zona),
          estado: str(after.estado),
          fechaActualizacion: str(after.fechaActualizacion),
          lastEventId: event.id,
          lastEventPosition: event.position,
          lastEventAt: event.occurredAt,
        },
        update: {
          precio: num(after.precio),
          metrosConstruidos: num(after.metrosConstruidos),
          habitaciones: int(after.habitaciones),
          banyos: int(after.banyos),
          ciudad: str(after.ciudad),
          zona: str(after.zona),
          estado: str(after.estado),
          fechaActualizacion: str(after.fechaActualizacion),
          lastEventId: event.id,
          lastEventPosition: event.position,
          lastEventAt: event.occurredAt,
        },
      });

      console.log(`[projection:property] PROPIEDAD_MODIFICADA codigo=${codigo} — updated`);
      return { success: true, aggregateId: codigo };
    }

    case "ESTADO_CAMBIADO": {
      const validation = handleEstadoCambiado(event);
      if (!validation.success) return validation;

      const payload = event.payload as { snapshot: PropertyPayloadSnapshot };
      const { create, update } = snapshotToUpsertData(payload.snapshot, event);

      await prisma.propertyCurrent.upsert({
        where: { codigo },
        create,
        update,
      });

      console.log(`[projection:property] ESTADO_CAMBIADO codigo=${codigo} — upserted`);
      return { success: true, aggregateId: codigo };
    }

    default:
      console.warn(`[projection:property] Tipo no soportado: ${event.type}`);
      return { success: true, aggregateId: codigo };
  }
}
