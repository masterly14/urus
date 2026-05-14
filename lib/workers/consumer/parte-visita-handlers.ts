/**
 * Handler legacy del Parte de Visita.
 *
 * El flujo canónico es **QStash schedule → `/api/parte-visita/send`** (ver
 * `lib/parte-visita/schedule.ts`). Este handler se mantiene únicamente como
 * red de seguridad para drenar jobs `PARTE_VISITA_ENVIAR_FORMULARIO` que
 * quedaran en `job_queue` antes del cambio de arquitectura. Delega en
 * `sendParteVisitaForSession`, que es idempotente.
 */

import { sendParteVisitaForSession } from "@/lib/parte-visita/send";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";

export async function handleParteVisitaEnviarFormulario(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";

  if (!sessionId) {
    return {
      success: false,
      error: "PARTE_VISITA_ENVIAR_FORMULARIO: missing sessionId",
      permanent: true,
    };
  }

  const result = await sendParteVisitaForSession(sessionId);
  if (!result.ok) {
    return { success: false, error: result.error, permanent: result.permanent };
  }
  return { success: true };
}
