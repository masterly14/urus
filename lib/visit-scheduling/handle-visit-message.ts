/**
 * Router interno de mensajes de visita.
 *
 * Recibe un mensaje ya clasificado (intención + datos extraídos) junto con
 * la sesión activa y despacha al paso correspondiente del orquestador.
 */

import type { VisitSchedulingSession } from "@/app/generated/prisma/client";
import type { VisitIntentClassification } from "./types";
import { fromZonedTime } from "date-fns-tz";
import { WORKING_HOURS } from "./constants";

import {
  handleCommercialSlotSelection,
  handleBuyerAcceptance,
  handleBuyerRejection,
  handleBuyerPreference,
  handleVisitorData,
  handleCommercialConfirmsBuyerPreference,
  handleCommercialRejectsBuyerPreference,
  handleCancellation,
  handleRescheduling,
  handleEscalation,
} from "./orchestrator";
import { getSessionById } from "./session-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extrae el índice del slot desde un button_id como "slot_1:cxyz123".
 */
function extractSlotIndex(buttonId: string): number | null {
  const match = buttonId.match(/^slot_(\d+):/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Intenta parsear una fecha+hora extraídas por el NLU a un objeto Date.
 * Asume timezone Europe/Madrid.
 */
function parsePreferredDate(
  dateStr?: string,
  timeStr?: string,
): Date | null {
  if (!dateStr) return null;
  const time = timeStr ?? "10:00";
  const naive = `${dateStr}T${time}:00`;
  try {
    return fromZonedTime(new Date(naive), WORKING_HOURS.timezone);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// handleVisitMessage
// ---------------------------------------------------------------------------

export interface HandleVisitMessageResult {
  handled: boolean;
  error?: string;
}

/**
 * Router principal: según `session.state` + `intent`, despacha
 * la acción al orquestador correspondiente.
 *
 * @param session    Sesión activa de visit scheduling
 * @param intent     Clasificación NLU del mensaje
 * @param buttonId   ID del botón interactivo (si aplica)
 * @param senderWaId waId del remitente del mensaje
 */
export async function handleVisitMessage(
  session: VisitSchedulingSession,
  intent: VisitIntentClassification,
  buttonId: string | null,
  senderWaId: string,
): Promise<HandleVisitMessageResult> {
  const { state } = session;
  const isBuyer = senderWaId === session.buyerWaId;
  const isCommercial = senderWaId === session.comercialWaId;

  try {
    // --- CANCELAR / REPROGRAMAR (desde cualquier estado no terminal) ---
    if (intent.intent === "CANCELAR_VISITA") {
      await handleCancellation(session.id, isBuyer ? "buyer" : "commercial");
      return { handled: true };
    }

    if (intent.intent === "REPROGRAMAR_VISITA") {
      await handleRescheduling(session.id, isBuyer ? "buyer" : "commercial");
      return { handled: true };
    }

    // --- COMERCIAL: selección de slot propuesto ---
    if (state === "SLOTS_PROPOSED_TO_COMMERCIAL" && isCommercial) {
      if (buttonId) {
        const slotIndex = extractSlotIndex(buttonId);
        if (slotIndex !== null) {
          await handleCommercialSlotSelection(session.id, slotIndex);
          return { handled: true };
        }
      }
      if (intent.intent === "ACEPTA_HORARIO") {
        await handleCommercialSlotSelection(session.id, 0);
        return { handled: true };
      }
    }

    // --- COMPRADOR: acepta/rechaza horario propuesto ---
    if (state === "SLOT_PROPOSED_TO_BUYER" && isBuyer) {
      if (intent.intent === "ACEPTA_HORARIO") {
        await handleBuyerAcceptance(session.id);
        return { handled: true };
      }
      if (intent.intent === "RECHAZA_HORARIO") {
        await handleBuyerRejection(session.id);
        return { handled: true };
      }
      if (intent.intent === "INDICA_PREFERENCIA") {
        const preferred = parsePreferredDate(
          intent.extractedDate,
          intent.extractedTime,
        );
        if (preferred) {
          await handleBuyerRejection(session.id);
          const updated = await getSessionById(session.id);
          if (updated.state === "ASKING_BUYER_PREFERENCE") {
            await handleBuyerPreference(session.id, preferred);
          }
          return { handled: true };
        }
      }
    }

    // --- COMPRADOR: indica preferencia de día/hora ---
    if (state === "ASKING_BUYER_PREFERENCE" && isBuyer) {
      if (intent.intent === "INDICA_PREFERENCIA") {
        const preferred = parsePreferredDate(
          intent.extractedDate,
          intent.extractedTime,
        );
        if (preferred) {
          await handleBuyerPreference(session.id, preferred);
          return { handled: true };
        }
        return { handled: false, error: "No se pudo parsear la fecha preferida" };
      }
      if (intent.intent === "ACEPTA_HORARIO") {
        return { handled: false, error: "No hay horario pendiente de confirmar" };
      }
    }

    // --- COMERCIAL: confirma/rechaza preferencia del comprador ---
    if (state === "SPECIFIC_SLOT_TO_COMMERCIAL" && isCommercial) {
      if (intent.intent === "ACEPTA_HORARIO") {
        await handleCommercialConfirmsBuyerPreference(session.id);
        return { handled: true };
      }
      if (intent.intent === "RECHAZA_HORARIO") {
        await handleCommercialRejectsBuyerPreference(session.id);
        return { handled: true };
      }
    }

    // --- COMPRADOR: proporciona datos de visita ---
    if (state === "COLLECTING_VISITOR_DATA" && isBuyer) {
      if (intent.intent === "PROPORCIONA_DATOS") {
        const name = intent.extractedName;
        const phone = intent.extractedPhone;
        if (name && phone) {
          await handleVisitorData(session.id, {
            name,
            phone,
            count: intent.extractedCount ?? undefined,
          });
          return { handled: true };
        }
        return {
          handled: false,
          error: "Datos incompletos: se necesita nombre y teléfono",
        };
      }
    }

    // --- Intención no manejable en el estado actual ---
    if (intent.intent === "AMBIGUO" || intent.intent === "NO_VISIT_RELATED") {
      return { handled: false };
    }

    return { handled: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[handle-visit-message] Error procesando sesión ${session.id} estado=${state} intent=${intent.intent}`,
      err,
    );
    return { handled: false, error: msg };
  }
}
