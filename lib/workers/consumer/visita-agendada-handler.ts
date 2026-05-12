import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { upsertCommercialVisitFactFromVisitaAgendadaEvent } from "@/lib/dashboard/comercial/facts";
import { scheduleFollowUpDemanda } from "@/lib/visitas/follow-up-demanda";

export async function handleVisitaAgendada(event: Event): Promise<HandlerResult> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const visitSessionId =
    typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  const comercialId =
    typeof payload.comercialId === "string" ? payload.comercialId.trim() : "";
  const visitDate = typeof payload.fecha === "string" ? payload.fecha.trim() : "";
  const visitStartTime =
    typeof payload.horaInicio === "string" ? payload.horaInicio.trim() : "";
  const demandId =
    typeof payload.demandId === "string" ? payload.demandId.trim() : null;
  const propertyCode =
    typeof payload.propertyCode === "string" ? payload.propertyCode.trim() : null;
  const visitorName =
    typeof payload.visitorName === "string" ? payload.visitorName.trim() : "";
  const visitorPhone =
    typeof payload.visitorPhone === "string" ? payload.visitorPhone.trim() : "";

  if (visitSessionId && comercialId && visitDate && visitStartTime) {
    try {
      const scheduleResult = await scheduleFollowUpDemanda({
        visitSessionId,
        comercialId,
        demandId,
        propertyCode,
        visitorName,
        visitorPhone,
        visitDate,
        visitStartTime,
      });

      if (scheduleResult.scheduled) {
        console.log(
          `[visitas] Follow-up demanda programado visitSessionId=${visitSessionId} sendAt=${scheduleResult.sendAtIso}`,
        );
      } else {
        console.warn(
          `[visitas] No se programó follow-up demanda visitSessionId=${visitSessionId}: ${scheduleResult.reason}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[visitas] Error programando follow-up demanda sessionId=${visitSessionId}: ${message}`,
      );
      return { success: false, error: message };
    }
  } else {
    console.warn(
      `[visitas] VISITA_AGENDADA sin datos mínimos para follow-up (sessionId/comercialId/fecha/horaInicio) aggregateId=${event.aggregateId}`,
    );
  }

  try {
    await upsertCommercialVisitFactFromVisitaAgendadaEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[analytics] No se pudo registrar VISITA_AGENDADA en CommercialVisitFact demandId=${event.aggregateId}: ${message}`,
    );
  }

  return { success: true };
}

