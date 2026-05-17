import { prisma } from "@/lib/prisma";
import { startNluInitialContactForDemand, type InitialContactSource } from "@/lib/nlu/initial-contact";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";

const VALID_SOURCES: InitialContactSource[] = [
  "auto_demand_creada",
  "auto_demand_modificada_phone",
  "manual_ui",
  "script_dry_run",
  "backfill",
];

function parseSource(value: unknown): InitialContactSource {
  if (typeof value === "string" && VALID_SOURCES.includes(value as InitialContactSource)) {
    return value as InitialContactSource;
  }
  return "auto_demand_creada";
}

/**
 * Handler del job START_NLU_INITIAL_CONTACT.
 *
 * Disparado por:
 * - DEMANDA_CREADA (encola siempre que el handler de evento termine la
 *   proyeccion sincrona).
 * - DEMANDA_MODIFICADA con `telefono` en changedFields y `after.telefono`
 *   no vacio.
 * - Script de backfill manual.
 *
 * Idempotencia por demanda: antes de enviar, verifica si ya existe un
 * `NLU_CONTACTO_INICIADO` con `sent=true` en el Event Store para esta
 * `aggregateId`. Si existe, completa sin reenviar.
 */
export async function handleStartNluInitialContact(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const demandId = typeof payload.demandId === "string" ? payload.demandId : "";

  if (!demandId) {
    return {
      success: false,
      error: "START_NLU_INITIAL_CONTACT sin payload.demandId",
      permanent: true,
    };
  }

  const alreadySent = await prisma.event.findFirst({
    where: {
      type: "NLU_CONTACTO_INICIADO",
      aggregateId: demandId,
      payload: { path: ["sent"], equals: true },
    },
    select: { id: true },
  });
  if (alreadySent) {
    console.log(
      `[consumer:nlu-initial-job] job ${job.id} demandId=${demandId} — NLU_CONTACTO_INICIADO sent=true ya existe (evt=${alreadySent.id}), skip`,
    );
    return { success: true };
  }

  const source = parseSource(payload.source);
  const causationId =
    typeof payload.causationId === "string"
      ? payload.causationId
      : job.sourceEventId ?? null;
  const correlationId =
    typeof payload.correlationId === "string" ? payload.correlationId : null;

  const result = await startNluInitialContactForDemand({
    demandId,
    source,
    causationId,
    correlationId,
  });

  console.log(
    `[consumer:nlu-initial-job] job ${job.id} demandId=${demandId} source=${source} sent=${result.sent} skippedReason=${result.skippedReason ?? "-"} eventId=${result.eventId}`,
  );

  return { success: true };
}
