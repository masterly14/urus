import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { enqueueJob } from "@/lib/job-queue";

const MS_DAY = 86_400_000;

export interface PostventaStep {
  label: string;
  delayMs: number;
  template: string;
  /** Steps que requieren verificación de incidencia antes de enviar. */
  requiresNoIncidencia: boolean;
}

/**
 * Cadencia canónica de post-venta (M9). El step `D0_FORMULARIO` envía el
 * WhatsApp Flow que recoge nombre, fecha de nacimiento y email. Los mensajes
 * de cumpleaños y navidad NO se encolan desde aquí: se agendan dinámicamente
 * al completar el formulario (ver `lib/postventa/form-response-handler.ts`).
 */
export const POSTVENTA_CADENCE: PostventaStep[] = [
  { label: "D0_AGRADECIMIENTO", delayMs: 0, template: "agradecimiento", requiresNoIncidencia: false },
  { label: "D0_FORMULARIO", delayMs: 0, template: "formulario", requiresNoIncidencia: false },
  { label: "D3_SOPORTE", delayMs: 3 * MS_DAY, template: "soporte", requiresNoIncidencia: false },
  { label: "D10_RESENA", delayMs: 10 * MS_DAY, template: "resena", requiresNoIncidencia: true },
  { label: "D21_REFERIDOS", delayMs: 21 * MS_DAY, template: "referidos", requiresNoIncidencia: true },
  { label: "D90_RECAPTACION", delayMs: 90 * MS_DAY, template: "recaptacion", requiresNoIncidencia: true },
];

/**
 * Subconjunto de templates que aceptan idempotencyKey basado en el
 * operacionId/propertyCode (cadencia fija). Los steps `cumple` y `navidad`
 * tienen su propia convención de idempotencyKey con el año natural.
 */
export const POSTVENTA_ANNUAL_TEMPLATES = new Set(["cumple", "navidad"]);

interface StartCadencePayload {
  propertyCode: string;
  operacionId?: string;
  newEstado: string;
  closedAt: string;
  sourceEventId: string;
}

function parsePayload(raw: unknown): StartCadencePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.propertyCode !== "string" ||
    typeof p.closedAt !== "string" ||
    typeof p.sourceEventId !== "string"
  ) {
    return null;
  }
  return {
    propertyCode: p.propertyCode,
    operacionId: typeof p.operacionId === "string" ? p.operacionId : undefined,
    newEstado: typeof p.newEstado === "string" ? p.newEstado : "",
    closedAt: p.closedAt,
    sourceEventId: p.sourceEventId,
  };
}

/**
 * Job handler para START_POSTVENTA_CADENCE.
 * Encola los 5 SEND_POSTVENTA_MESSAGE con `availableAt` escalonado.
 */
export async function handleStartPostventaCadence(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "START_POSTVENTA_CADENCE: payload incompleto",
      permanent: true,
    };
  }

  const { propertyCode, operacionId, closedAt, sourceEventId } = payload;
  const baseTime = new Date(closedAt).getTime();
  const idKey = operacionId ?? propertyCode;

  let enqueued = 0;

  for (const step of POSTVENTA_CADENCE) {
    const availableAt = new Date(baseTime + step.delayMs);
    const idempotencyKey = `postventa:${idKey}:${step.label}`;

    if (step.template === "formulario") {
      await enqueueJob({
        type: "SEND_POSTVENTA_FORM",
        payload: {
          propertyCode,
          operacionId,
          closedAt,
          sourceEventId,
        },
        availableAt,
        idempotencyKey,
        sourceEventId,
      });
      enqueued++;
      continue;
    }

    await enqueueJob({
      type: "SEND_POSTVENTA_MESSAGE",
      payload: {
        propertyCode,
        operacionId,
        step: step.label,
        template: step.template,
        closedAt,
        requiresNoIncidencia: step.requiresNoIncidencia,
      },
      availableAt,
      idempotencyKey,
      sourceEventId,
    });

    enqueued++;
  }

  console.log(
    `[postventa] START_POSTVENTA_CADENCE job ${job.id} — ${enqueued} mensajes encolados para ${propertyCode}${operacionId ? ` (operacion=${operacionId})` : ""}`,
  );

  return { success: true };
}
