import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import type { JsonValue } from "@/lib/event-store/types";

const KEYSITU_DESCARTADA = "23";

function pickString(
  raw: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && value > 0) return String(value);
  }
  return null;
}

export type DeactivateDemandResult = {
  ok: true;
  leadStatus: "PERDIDO";
  inmovillaSyncQueued: boolean;
  eventId: string;
  reason?: string;
};

export async function deactivateDemand(input: {
  demandId: string;
  updatedBy: string;
  source: string;
  reason?: string;
  causationId?: string | null;
  correlationId?: string | null;
}): Promise<DeactivateDemandResult> {
  await prisma.demandCurrent.update({
    where: { codigo: input.demandId },
    data: { leadStatus: "PERDIDO" },
  });

  const event = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: input.demandId,
    payload: {
      source: input.source,
      leadStatus: "PERDIDO",
      updatedBy: input.updatedBy,
      reason: input.reason ?? null,
    } as unknown as JsonValue,
    causationId: input.causationId ?? undefined,
    correlationId: input.correlationId ?? undefined,
  });

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo: input.demandId },
    select: { ref: true, raw: true },
  });

  if (!snapshot) {
    return {
      ok: true,
      leadStatus: "PERDIDO",
      inmovillaSyncQueued: false,
      eventId: event.id,
      reason: "missing_demand_snapshot",
    };
  }

  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
  const clientId = pickString(raw, ["keycli", "cod_cli", "clientes-cod_cli", "clientes-cod_clipriclave"]);
  const agentId = pickString(raw, ["keyagente", "demandas-keyagente", "idUsuario", "agente"]);
  const propertyTypes = pickString(raw, ["tipopropiedad", "tipos"]) ?? "";
  const demandRef = snapshot.ref?.trim() || input.demandId;

  if (!clientId || !agentId) {
    return {
      ok: true,
      leadStatus: "PERDIDO",
      inmovillaSyncQueued: false,
      eventId: event.id,
      reason: "missing_client_or_agent",
    };
  }

  await enqueueJob({
    type: "WRITE_TO_INMOVILLA",
    payload: {
      operation: "updateDemandStatus",
      args: {
        demandId: input.demandId,
        demandRef,
        clientId,
        agentId,
        propertyTypes,
        keysitu: KEYSITU_DESCARTADA,
      },
    },
    idempotencyKey: `write_to_inmovilla:updateDemandStatus:deactivate:${event.id}`,
    sourceEventId: event.id,
  });

  return {
    ok: true,
    leadStatus: "PERDIDO",
    inmovillaSyncQueued: true,
    eventId: event.id,
  };
}
