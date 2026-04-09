/**
 * Job handler: NOTIFY_PRICING_WHATSAPP
 *
 * Resuelve el teléfono del comercial asignado a la propiedad
 * y envía la plantilla WhatsApp con el enlace al informe de pricing.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { resolveAgentPhoneByProperty } from "@/lib/routing/resolve-property-agent";
import { sendPricingReportToCommercial } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

const SEMAFORO_LABELS: Record<string, string> = {
  verde: "VERDE",
  amarillo: "AMARILLO",
  rojo: "ROJO",
  sin_datos: "SIN DATOS",
};

export async function handleNotifyPricingWhatsApp(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const propertyCode =
    typeof payload.propertyCode === "string" ? payload.propertyCode : null;
  const semaforo =
    typeof payload.semaforo === "string" ? payload.semaforo : "sin_datos";
  const gapPorcentaje =
    typeof payload.gapPorcentaje === "number" ? payload.gapPorcentaje : 0;

  if (!propertyCode) {
    console.error(
      `[consumer:pricing-notify] NOTIFY_PRICING_WHATSAPP job ${job.id} sin propertyCode`,
    );
    return { success: false, error: "Job sin propertyCode" };
  }

  const agent = await resolveAgentPhoneByProperty(propertyCode);

  if (!agent) {
    console.log(
      `[consumer:pricing-notify] Sin teléfono para propiedad ${propertyCode} — completando sin envío`,
    );
    return { success: true };
  }

  const informeUrl = `${getPublicAppUrl()}/platform/pricing/informe/${propertyCode}`;
  const gapStr = `${gapPorcentaje > 0 ? "+" : ""}${gapPorcentaje}%`;
  const semaforoLabel = SEMAFORO_LABELS[semaforo] ?? semaforo.toUpperCase();

  try {
    await sendPricingReportToCommercial(agent.telefono, {
      comercialNombre: agent.nombre,
      propertyCode,
      semaforo: semaforoLabel,
      gapPorcentaje: gapStr,
      informeUrl,
    });

    console.log(
      `[consumer:pricing-notify] WhatsApp enviado a ${agent.telefono} (${agent.nombre}) para ${propertyCode} semáforo=${semaforoLabel}`,
    );

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer:pricing-notify] Error enviando WhatsApp para ${propertyCode}: ${errorMsg}`,
    );
    return { success: false, error: errorMsg };
  }
}
