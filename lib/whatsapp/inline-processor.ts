/**
 * Procesamiento inline de mensajes WhatsApp — Categoría A (conversacional).
 *
 * Los mensajes que requieren respuesta inmediata (< 3s percibidos) se procesan
 * dentro del request del webhook, sin esperar al consumer. El evento se persiste
 * igualmente para trazabilidad, pero NO se encola job PROCESS_EVENT (evitando
 * procesamiento duplicado).
 *
 * Categoría A:
 * - /coach ejercicio (programa de desarrollo)
 * - Feedback de comprador con sesión activa (conversational agent / NLU)
 * - Mensajes dentro de sesión de visita activa
 * - "hecho"/"listo" (completar ejercicio)
 *
 * Si el procesamiento inline falla o excede el timeout, el evento se encola
 * normalmente como fallback y el consumer lo procesará después.
 */

import type { Event } from "@/types/domain";
import type { HandlerResult } from "@/lib/workers/consumer/types";
import { prisma } from "@/lib/prisma";
import {
  isExerciseRequest,
  routeToDevProgramIfApplicable,
} from "@/lib/dev-program/exercise-router";
import { handleConversationalFlow } from "@/lib/workers/consumer/conversational-handler";
import {
  getActiveSessionForBuyer,
  getActiveSessionForComercial,
} from "@/lib/visit-scheduling/session-manager";
import { handleVisitMessage } from "@/lib/visit-scheduling/handle-visit-message";
import {
  classifyButtonReply,
  classifyVisitIntent,
} from "@/lib/agents/visit-intent-classifier";
import { sendTextMessage } from "@/lib/whatsapp/send";
import { enqueueJob } from "@/lib/job-queue";

const INLINE_TIMEOUT_MS = 25_000;

type WhatsAppPayload = {
  messageId?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: "button_reply" | "list_reply";
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  button?: { payload?: string; text?: string };
  context?: { message_id?: string; id?: string };
  [k: string]: unknown;
};

export interface InlineProcessingResult {
  processed: boolean;
  handler?: string;
  elapsedMs?: number;
  error?: string;
}

function extractMessageText(payload: WhatsAppPayload): string | null {
  if (payload.type === "text") {
    const t = payload.text?.body;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  }
  if (payload.type === "interactive") {
    const title =
      payload.interactive?.button_reply?.title ??
      payload.interactive?.list_reply?.title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  }
  if (payload.type === "button") {
    const t = payload.button?.text;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  }
  return null;
}

/**
 * Determina si un mensaje WhatsApp es Categoría A (conversacional, requiere
 * respuesta inmediata) y, de serlo, lo procesa inline.
 *
 * Retorna `{ processed: true }` si se manejó exitosamente.
 * Retorna `{ processed: false }` si no es Categoría A o si falló y debe
 * encolarse al consumer como fallback.
 */
export async function tryInlineProcessing(
  event: Event,
): Promise<InlineProcessingResult> {
  const startMs = Date.now();
  const payload = event.payload as WhatsAppPayload;
  const waId = event.aggregateId;
  const messageText = extractMessageText(payload);

  if (!messageText) {
    return { processed: false };
  }

  const category = await classifyCategory(waId, messageText);
  if (!category) {
    return { processed: false };
  }

  try {
    const result = await Promise.race([
      executeInline(event, waId, messageText, payload, category),
      timeoutRejection(),
    ]);

    const elapsedMs = Date.now() - startMs;

    if (result.followUpJobs?.length) {
      for (const job of result.followUpJobs) {
        await enqueueJob(job);
      }
    }

    console.log(
      `[inline-processor] ${category.handler} waId=${waId} elapsed=${elapsedMs}ms — OK`,
    );

    return { processed: true, handler: category.handler, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.error(
      `[inline-processor] ${category.handler} waId=${waId} FAILED (${elapsedMs}ms): ${errorMsg} — fallback to queue`,
    );

    return { processed: false, handler: category.handler, elapsedMs, error: errorMsg };
  }
}

type CategoryClassification = {
  handler: "dev-exercise" | "visit-session" | "conversational-agent";
  visitSession?: Awaited<ReturnType<typeof getActiveSessionForBuyer>>;
};

async function classifyCategory(
  waId: string,
  messageText: string,
): Promise<CategoryClassification | null> {
  if (isExerciseRequest(messageText)) {
    return { handler: "dev-exercise" };
  }

  const [buyerVisitSession, commercialVisitSession] = await Promise.all([
    getActiveSessionForBuyer(waId),
    getActiveSessionForComercial(waId),
  ]);
  const activeVisitSession = buyerVisitSession ?? commercialVisitSession;
  if (activeVisitSession) {
    return { handler: "visit-session", visitSession: activeVisitSession };
  }

  if (process.env.CONVERSATIONAL_AGENT_ENABLED === "true") {
    const buyerSession = await prisma.whatsAppBuyerSession.findUnique({
      where: { waId },
      select: { demandId: true, selectionId: true },
    });
    if (buyerSession?.demandId) {
      return { handler: "conversational-agent" };
    }
  }

  return null;
}

async function executeInline(
  event: Event,
  waId: string,
  messageText: string,
  payload: WhatsAppPayload,
  category: CategoryClassification,
): Promise<HandlerResult> {
  switch (category.handler) {
    case "dev-exercise": {
      const result = await routeToDevProgramIfApplicable(event, messageText, waId);
      return result ?? { success: true };
    }

    case "visit-session": {
      if (!category.visitSession) return { success: true };

      const interactiveId =
        payload.interactive?.button_reply?.id ?? payload.interactive?.list_reply?.id;

      let intent = interactiveId ? classifyButtonReply(interactiveId) : null;

      if (!intent) {
        try {
          intent = await classifyVisitIntent(messageText, category.visitSession.state);
        } catch {
          await sendTextMessage(
            category.visitSession.comercialWaId,
            `No se pudo clasificar automáticamente el mensaje del comprador (${waId}). Mensaje: "${messageText}". Revísalo manualmente.`,
            {
              trace: {
                source: "inline_visit_intent_fallback",
                kind: "manual_review_alert",
                causationId: event.id,
                payload: {
                  buyerWaId: waId,
                  visitSessionId: category.visitSession.id,
                },
              },
            },
          );
          return { success: true };
        }
      }

      if (intent && intent.intent !== "NO_VISIT_RELATED") {
        const result = await handleVisitMessage(
          category.visitSession,
          intent,
          interactiveId ?? null,
          waId,
        );
        if (result.handled) return { success: true };
      }

      return { success: true };
    }

    case "conversational-agent": {
      const session = await prisma.whatsAppBuyerSession.findUnique({
        where: { waId },
        select: { demandId: true, selectionId: true },
      });
      if (!session?.demandId) return { success: true };

      return handleConversationalFlow(event, waId, messageText, {
        demandId: session.demandId,
        selectionId: session.selectionId,
      });
    }

    default:
      return { success: true };
  }
}

function timeoutRejection(): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Inline processing timeout (${INLINE_TIMEOUT_MS}ms)`)),
      INLINE_TIMEOUT_MS,
    ),
  );
}
