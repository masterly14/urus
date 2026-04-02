/**
 * M5 — Smart Matching: handler de DEMANDA_ACTUALIZADA.
 *
 * Alineado con el plan (Día 9):
 * - Evento DEMANDA_ACTUALIZADA es la fuente de verdad del ajuste
 * - Se encola:
 *   1) UPDATE_DEMAND_PROJECTION (estado interno fresco)
 *   2) WRITE_TO_INMOVILLA (egestion: aplica ajuste en Inmovilla)
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import type { EnqueueJobInput } from "@/lib/job-queue/types";
import { prisma } from "@/lib/prisma";

type DemandUpdateVariables = {
  precioMin?: number;
  precioMax?: number;
  habitacionesMin?: number;
  metrosMin?: number;
  metrosMax?: number;
  zonas?: string[];
  tipos?: string[];
};

function pickString(map: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = map[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function joinList(values: string[] | undefined): string | null {
  if (!values?.length) return null;
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  if (!cleaned.length) return null;
  return cleaned.join(", ");
}

export async function handleDemandaActualizada(event: Event): Promise<HandlerResult> {
  const demandId = event.aggregateId;
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const variables = (p.variables ?? {}) as DemandUpdateVariables;

  const followUpJobs: EnqueueJobInput[] = [
    {
      type: "UPDATE_DEMAND_PROJECTION",
      payload: { eventId: event.id },
      idempotencyKey: `update_demand_projection:${event.id}`,
      sourceEventId: event.id,
    },
  ];

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: demandId },
    select: { codigo: true, ref: true, raw: true },
  });

  if (!snapshot) {
    const msg = `No existe demandSnapshot para demandId=${demandId} (necesario para egestion)`;
    console.error(`[consumer:smart-matching] ${msg}`);
    return { success: false, error: msg, followUpJobs };
  }

  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;

  const demandRef = snapshot.ref?.trim() || demandId;
  const clientId = pickString(raw, [
    "keycli",
    "cod_cli",
    "clientes-cod_cli",
    "clientes.cod_cli",
    "clientes-cod_clipriclave",
  ]);
  const agentId = pickString(raw, [
    "keyagente",
    "demandas-keyagente",
    "idUsuario",
    "agente",
  ]);
  const propertyTypes = pickString(raw, [
    "tipopropiedad",
    "tipos",
  ]) ?? "";

  if (!clientId || !agentId) {
    const msg =
      `No se pudo resolver clientId/agentId para demandId=${demandId} ` +
      `(clientId=${clientId ?? "null"} agentId=${agentId ?? "null"})`;
    console.error(`[consumer:smart-matching] ${msg}`);
    return { success: false, error: msg, followUpJobs };
  }

  const inmovillaPatch = {
    presupuestoMin: typeof variables.precioMin === "number" ? variables.precioMin : undefined,
    presupuestoMax: typeof variables.precioMax === "number" ? variables.precioMax : undefined,
    habitacionesMin: typeof variables.habitacionesMin === "number" ? variables.habitacionesMin : undefined,
    metrosMin: typeof variables.metrosMin === "number" ? variables.metrosMin : undefined,
    metrosMax: typeof variables.metrosMax === "number" ? variables.metrosMax : undefined,
    zonas: joinList(variables.zonas) ?? undefined,
    tipos: joinList(variables.tipos) ?? undefined,
  };

  followUpJobs.push({
    type: "WRITE_TO_INMOVILLA",
    payload: {
      operation: "updateDemandCriteria",
      args: {
        demandId,
        demandRef,
        clientId,
        agentId,
        propertyTypes,
        patch: inmovillaPatch,
      },
    },
    idempotencyKey: `write_to_inmovilla:updateDemandCriteria:${event.id}`,
    sourceEventId: event.id,
  });

  const source = (p.source ?? {}) as Record<string, unknown>;
  if (source.selectionId || source.channel === "whatsapp_feedback") {
    followUpJobs.push({
      type: "GENERATE_MICROSITE",
      payload: {
        demandId,
        comercialId: "system",
        sourceEventId: event.id,
        demand: {
          metrosMin: variables.metrosMin,
          metrosMax: variables.metrosMax,
        },
      },
      idempotencyKey: `generate_microsite:${event.id}`,
      sourceEventId: event.id,
    });
    console.log(
      `[consumer:smart-matching] DEMANDA_ACTUALIZADA demandId=${demandId} → encolado WRITE_TO_INMOVILLA + GENERATE_MICROSITE (feedback loop)`,
    );
  } else {
    console.log(
      `[consumer:smart-matching] DEMANDA_ACTUALIZADA demandId=${demandId} → encolado WRITE_TO_INMOVILLA (updateDemandCriteria)`,
    );
  }

  return { success: true, followUpJobs };
}

