import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EventRecord } from "@/lib/event-store/types";
import type { ProjectionApplyResult } from "./types";
import { str, num, int } from "@/lib/utils/normalize";
import { resolveComercial, resolveComercialFromRef } from "@/lib/routing/resolve-comercial";

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
  /** Iniciales del comercial (campo `siglas` de Inmovilla, ej. "MA"). Equivale a Comercial.inmovillaRefCode. */
  siglas?: string;
  /** ID numérico del agente en Inmovilla (campo `keyagente`). Equivale a Comercial.inmovillaAgentId. */
  inmovillaAgentId?: number;
  /** Ref URUS del inmueble en campo "Consultada" (cruce), p. ej. URUS103VMA. */
  refConsultada?: string;
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

/**
 * Logs de resolución comercial en proyección de demandas.
 * - Por defecto: resumen por demanda + traza detallada en `resolve-comercial`.
 * - Silenciar (p. ej. tests): `DEMAND_RESOLVE_TRACE=0`
 */
function demandResolveLoggingEnabled(): boolean {
  return process.env.DEMAND_RESOLVE_TRACE !== "0";
}

function demandResolveTraceContext(codigo: string): string | undefined {
  if (!demandResolveLoggingEnabled()) return undefined;
  return `demand:${codigo}`;
}

async function snapshotToUpsertData(
  snapshot: DemandPayloadSnapshot,
  event: EventRecord,
): Promise<{ create: Prisma.DemandCurrentCreateInput; update: Prisma.DemandCurrentUpdateInput }> {
  const traceCtx = demandResolveTraceContext(snapshot.codigo);

  // Cadena de resolución (de más estable a más frágil):
  // 1. inmovillaAgentId numérico  → Comercial.inmovillaAgentId (match único y estable)
  // 2. siglas del agente          → Comercial.inmovillaRefCode (ej. "MA" = URUS103VMA)
  // 3. agente string (usernombre) → nombre textual (fallback legacy, frágil)
  // 4. refConsultada ("Consultada" / cruce URUS…) → mismo criterio que ref de propiedad
  // 5. ref de demanda (numdemanda) → extractRefCode (casi nunca URUS)
  if (demandResolveLoggingEnabled()) {
    console.log(
      `[projection:demand:resolve] codigo=${snapshot.codigo} event=${event.id} entrada snapshot: inmovillaAgentId=${snapshot.inmovillaAgentId ?? "∅"} siglas=${snapshot.siglas ?? "∅"} refConsultada=${snapshot.refConsultada ?? "∅"} agente=${JSON.stringify(snapshot.agente)} ref(numdemanda)=${JSON.stringify(snapshot.ref)}`,
    );
  }

  let comercial = await resolveComercial({
    inmovillaAgentId: snapshot.inmovillaAgentId ?? null,
    refCode: snapshot.siglas ?? null,
    agenteName: snapshot.agente || null,
    traceContext: traceCtx,
  });
  if (!comercial && snapshot.refConsultada) {
    comercial = await resolveComercialFromRef(snapshot.refConsultada, {
      traceContext: traceCtx ? `${traceCtx}:ref-consultada` : undefined,
    });
  }
  if (!comercial) {
    comercial = await resolveComercialFromRef(snapshot.ref, {
      traceContext: traceCtx ? `${traceCtx}:ref-fallback` : undefined,
    });
  }

  if (demandResolveLoggingEnabled()) {
    console.log(
      `[projection:demand:resolve] codigo=${snapshot.codigo} resultado comercialId=${comercial?.id ?? "null"} comercialNombre=${comercial ? JSON.stringify(comercial.nombre) : "—"}`,
    );
  }

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
    agente: comercial?.nombre ?? str(snapshot.agente),
    comercialId: comercial?.id ?? null,
    lastEventId: event.id,
    lastEventPosition: event.position,
    lastEventAt: event.occurredAt,
    // leadStatus se inicializa en NUEVO al crear; los handlers de eventos
    // posteriores lo avanzan. No se sobreescribe en upserts de snapshot.
  };

  return {
    // leadStatus arranca en NUEVO solo al crear; los upserts de modificación
    // no lo tocan para preservar el estado avanzado por el pipeline.
    create: { codigo: str(snapshot.codigo), leadStatus: "NUEVO", ...base },
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

      const { create, update } = await snapshotToUpsertData(payload.snapshot, event);
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

      const { create, update } = await snapshotToUpsertData(payload.snapshot, event);
      await prisma.demandCurrent.upsert({
        where: { codigo },
        create,
        update,
      });

      console.log(`[projection:demand] DEMANDA_ESTADO_CAMBIADO codigo=${codigo} — upserted`);
      return { success: true, aggregateId: codigo };
    }

    case "DEMANDA_ELIMINADA": {
      await prisma.demandCurrent.deleteMany({ where: { codigo } });
      console.log(`[projection:demand] DEMANDA_ELIMINADA codigo=${codigo} — deleted`);
      return { success: true, aggregateId: codigo };
    }

    case "DEMANDA_ACTUALIZADA": {
      const payload = event.payload as {
        variables?: {
          precioMin?: number;
          precioMax?: number;
          habitacionesMin?: number;
          ciudad?: string;
          zonas?: string[] | string;
          tipos?: string[] | string;
          metrosMin?: number;
          metrosMax?: number;
          tipoOperacion?: string;
        };
        detectedAt?: string;
      };

      const v = payload.variables ?? {};
      const updatedAt =
        typeof payload.detectedAt === "string" ? payload.detectedAt : new Date().toISOString();

      const tipos = listToString(v.tipos);
      const rawZonas = listToString(v.zonas);
      const ciudad = typeof v.ciudad === "string" && v.ciudad.trim() ? v.ciudad.trim() : null;
      const zonas = ciudad
        ? [ciudad, rawZonas].filter(Boolean).join(", ")
        : rawZonas;

      const metrosMin = typeof v.metrosMin === "number" ? int(v.metrosMin) : undefined;
      const metrosMax = typeof v.metrosMax === "number" ? int(v.metrosMax) : undefined;
      const tipoOperacion =
        typeof v.tipoOperacion === "string" && v.tipoOperacion.trim()
          ? v.tipoOperacion.trim()
          : undefined;

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
          ...(metrosMin !== undefined ? { metrosMin } : {}),
          ...(metrosMax !== undefined ? { metrosMax } : {}),
          ...(tipoOperacion !== undefined ? { tipoOperacion } : {}),
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
          ...(metrosMin !== undefined ? { metrosMin } : {}),
          ...(metrosMax !== undefined ? { metrosMax } : {}),
          ...(tipoOperacion !== undefined ? { tipoOperacion } : {}),
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
