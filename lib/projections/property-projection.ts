import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EventRecord } from "@/lib/event-store/types";
import type { ProjectionApplyResult } from "./types";
import { str, num, int } from "@/lib/utils/normalize";
import { resolveComercialFromAgente, resolveComercialFromRef } from "@/lib/routing/resolve-comercial";

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
  nodisponible?: boolean;
  prospecto?: boolean;
  fechaAlta: string;
  fechaActualizacion: string;
  numFotos: number;
  agente: string;
  mainPhotoUrl?: string | null;
  propietarioNombre?: string | null;
  propietarioDni?: string | null;
  propietarioPhone?: string | null;
  propietarioDomicilioFiscal?: string | null;
  propietarioRegisteredAt?: string | null;
};

type PropertyModifiedAfter = {
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  nodisponible?: boolean;
  prospecto?: boolean;
  fechaActualizacion: string;
};

async function snapshotToUpsertData(
  snapshot: PropertyPayloadSnapshot,
  event: EventRecord,
): Promise<{ create: Prisma.PropertyCurrentCreateInput; update: Prisma.PropertyCurrentUpdateInput }> {
  let comercial = await resolveComercialFromAgente(snapshot.agente);
  if (!comercial) {
    comercial = await resolveComercialFromRef(snapshot.ref);
  }

  const ownerFields = {
    ...(str(snapshot.propietarioNombre)
      ? { propietarioNombre: str(snapshot.propietarioNombre) }
      : {}),
    ...(str(snapshot.propietarioDni)
      ? { propietarioDni: str(snapshot.propietarioDni) }
      : {}),
    ...(str(snapshot.propietarioPhone)
      ? { propietarioPhone: str(snapshot.propietarioPhone) }
      : {}),
    ...(str(snapshot.propietarioDomicilioFiscal)
      ? { propietarioDomicilioFiscal: str(snapshot.propietarioDomicilioFiscal) }
      : {}),
    ...(snapshot.propietarioRegisteredAt
      ? { propietarioRegisteredAt: new Date(snapshot.propietarioRegisteredAt) }
      : {}),
  };

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
    nodisponible: Boolean(snapshot.nodisponible),
    prospecto: Boolean(snapshot.prospecto),
    fechaAlta: str(snapshot.fechaAlta),
    fechaActualizacion: str(snapshot.fechaActualizacion),
    numFotos: int(snapshot.numFotos),
    agente: comercial?.nombre ?? str(snapshot.agente),
    comercialId: comercial?.id ?? null,
    mainPhotoUrl: snapshot.mainPhotoUrl ?? null,
    ...ownerFields,
    lastEventId: event.id,
    lastEventPosition: event.position,
    lastEventAt: event.occurredAt,
  };

  return {
    create: { ...base, codigo: str(snapshot.codigo) },
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
      const { create, update } = await snapshotToUpsertData(payload.snapshot, event);

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

      const payload = event.payload as {
        after: PropertyModifiedAfter;
        mainPhotoUrl?: string | null;
      };
      const after = payload.after;
      const mainPhotoUrl = payload.mainPhotoUrl ?? null;

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
          nodisponible: Boolean(after.nodisponible),
          prospecto: Boolean(after.prospecto),
          fechaActualizacion: str(after.fechaActualizacion),
          mainPhotoUrl,
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
          nodisponible: Boolean(after.nodisponible),
          prospecto: Boolean(after.prospecto),
          fechaActualizacion: str(after.fechaActualizacion),
          mainPhotoUrl,
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
      const { create, update } = await snapshotToUpsertData(payload.snapshot, event);

      await prisma.propertyCurrent.upsert({
        where: { codigo },
        create,
        update,
      });

      console.log(`[projection:property] ESTADO_CAMBIADO codigo=${codigo} — upserted`);
      return { success: true, aggregateId: codigo };
    }

    case "PROPIEDAD_ELIMINADA": {
      await prisma.propertyCurrent.deleteMany({ where: { codigo } });
      console.log(`[projection:property] PROPIEDAD_ELIMINADA codigo=${codigo} — deleted`);
      return { success: true, aggregateId: codigo };
    }

    default:
      console.warn(`[projection:property] Tipo no soportado: ${event.type}`);
      return { success: true, aggregateId: codigo };
  }
}
