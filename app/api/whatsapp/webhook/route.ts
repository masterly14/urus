/**
 * GET  /api/whatsapp/webhook — verificación del webhook al registrar en Meta Business Manager.
 * POST /api/whatsapp/webhook — recepción de mensajes y actualizaciones de estado.
 *
 * GET: Meta envía hub.mode=subscribe, hub.verify_token y hub.challenge.
 *      Devolvemos el challenge en texto plano si el token es correcto.
 *
 * POST: Meta envía el payload del evento. Verificamos la firma X-Hub-Signature-256,
 *       parseamos los mensajes entrantes y emitimos eventos WHATSAPP_RECIBIDO en el Event Store.
 *
 * Categoría A (procesamiento inline):
 *   Mensajes conversacionales (feedback comprador, visitas) se procesan
 *   dentro del request para garantizar respuesta < 3s. El evento se persiste siempre.
 *   Si el procesamiento inline falla, se encola un job como fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseWebhookPayload,
} from "@/lib/whatsapp";
import type { ParsedWebhookMessage } from "@/lib/whatsapp";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import {
  handleNotaEncargoButtonReply,
  handleNotaEncargoNfmReply,
} from "@/lib/nota-encargo";
import {
  handleParteVisitaNfmReply,
  handleParteVisitaOffFlowMessage,
} from "@/lib/parte-visita/webhook-handler";
import { handlePostventaFormNfmReply } from "@/lib/postventa/form-response-handler";
import { tryInlineProcessing } from "@/lib/whatsapp/inline-processor";
import {
  downloadWhatsAppMedia,
  getWhatsAppMediaMetadata,
} from "@/lib/whatsapp/media";
import { uploadWhatsAppAudio } from "@/lib/cloudinary/upload-whatsapp-audio";
import { processInboundExpenseSync } from "@/lib/expenses";


// ---- GET: verificación del challenge ----

const getHandler = async (request: NextRequest): Promise<NextResponse> => {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries()) as {
    "hub.mode"?: string;
    "hub.verify_token"?: string;
    "hub.challenge"?: string;
  };

  const challenge = verifyWebhookChallenge(params);
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ error: "Verificación de webhook fallida" }, { status: 403 });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/whatsapp/webhook" }, getHandler);

// ---- POST: eventos entrantes ----

const postHandler = async (request: NextRequest): Promise<NextResponse> => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[whatsapp/webhook] WHATSAPP_APP_SECRET no configurado — rechazando request (fail-closed)");
    return NextResponse.json(
      { error: "Configuración de seguridad incompleta: WHATSAPP_APP_SECRET requerido" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const events = parseWebhookPayload(body);

  // --- Nota de Encargo: intercept button replies & Flow nfm_reply ---
  for (const evt of events) {
    if (evt.kind !== "message") continue;
    const msg = evt.message as Record<string, unknown>;
    const from = evt.waId;
    const interactive = msg.interactive as Record<string, unknown> | undefined;

    try {
      if (msg.type === "interactive" && interactive) {
        if (interactive.type === "button_reply") {
          const btnReply = interactive.button_reply as { id: string } | undefined;
          if (btnReply?.id) {
            const handled = await handleNotaEncargoButtonReply(from, btnReply.id);
            if (handled) continue;
          }
        }

        if (interactive.type === "nfm_reply") {
          const nfmReply = interactive.nfm_reply as { name?: string; response_json?: string } | undefined;
          if (nfmReply?.name === "flow" && nfmReply.response_json) {
            const handled = await handleNotaEncargoNfmReply(from, nfmReply.response_json);
            if (handled) continue;

            const handledPV = await handleParteVisitaNfmReply(from, nfmReply.response_json);
            if (handledPV) continue;

            const handledPostventa = await handlePostventaFormNfmReply(
              from,
              nfmReply.response_json,
            );
            if (handledPostventa) continue;
          }
        }
      }

      // Mitigación: si llega un mensaje fuera del Flow mientras parte-visita
      // está en FORMULARIO_ENVIADO, reenviar el Flow para guiar al comprador.
      if (
        msg.type === "audio" ||
        msg.type === "text" ||
        msg.type === "button"
      ) {
        await handleParteVisitaOffFlowMessage(from);
      }
    } catch (err) {
      console.error(
        "[whatsapp/webhook] Nota de Encargo intercept error:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const results = await Promise.allSettled(
    events
      .filter((e): e is ParsedWebhookMessage => e.kind === "message")
        .map(async (e) => {
          const waMessageId = e.message.id;

          const existing = await prisma.event.findFirst({
            where: {
              type: "WHATSAPP_RECIBIDO",
              aggregateType: "WHATSAPP_CONVERSATION",
              aggregateId: e.waId,
              payload: { path: ["messageId"], equals: waMessageId },
            },
            select: { id: true },
          });
          if (existing) return { deduplicated: true, messageId: waMessageId };

          const msg = e.message as Record<string, unknown>;
          const content: Record<string, unknown> = {
            messageId: waMessageId,
            from: e.waId,
            profileName: e.profileName ?? null,
            phoneNumberId: e.phoneNumberId,
            timestamp: e.message.timestamp,
            type: e.message.type,
          };
          if (e.message.type === "text" && "text" in msg) content["text"] = msg["text"];
          if (e.message.type === "interactive" && "interactive" in msg) content["interactive"] = msg["interactive"];
          if (e.message.type === "button" && "button" in msg) content["button"] = msg["button"];
          if (e.message.type === "audio" && "audio" in msg) {
            const audio = msg["audio"];
            if (audio && typeof audio === "object") {
              const audioRecord = audio as Record<string, unknown>;
              const audioId =
                typeof audioRecord.id === "string" ? audioRecord.id : "";
              const audioPayload: Record<string, unknown> = {
                id: audioId,
                mime_type:
                  typeof audioRecord.mime_type === "string"
                    ? audioRecord.mime_type
                    : null,
                sha256:
                  typeof audioRecord.sha256 === "string"
                    ? audioRecord.sha256
                    : null,
                voice:
                  typeof audioRecord.voice === "boolean"
                    ? audioRecord.voice
                    : null,
              };
              if (audioId) {
                try {
                  const metadata = await getWhatsAppMediaMetadata(audioId);
                  const downloaded = await downloadWhatsAppMedia(metadata.url);
                  const uploaded = await uploadWhatsAppAudio({
                    buffer: downloaded.buffer,
                    mediaId: audioId,
                    waId: e.waId,
                    mimeType: metadata.mimeType ?? downloaded.mimeType,
                    messageId: waMessageId,
                  });
                  audioPayload["cloudinaryUrl"] = uploaded.secureUrl;
                  audioPayload["cloudinaryPublicId"] = uploaded.publicId;
                  audioPayload["bytes"] = uploaded.bytes;
                } catch (err) {
                  console.warn(
                    `[whatsapp/webhook] audio upload failed (messageId=${waMessageId}, mediaId=${audioId}):`,
                    err instanceof Error ? err.message : err,
                  );
                }
              }
              content["audio"] = audioPayload;
            }
          }
          if (e.message.type === "image" && "image" in msg) {
            const image = msg["image"];
            if (image && typeof image === "object") {
              const imageRecord = image as Record<string, unknown>;
              const imageId =
                typeof imageRecord.id === "string" ? imageRecord.id : "";
              const imagePayload: Record<string, unknown> = {
                id: imageId,
                mime_type:
                  typeof imageRecord.mime_type === "string"
                    ? imageRecord.mime_type
                    : null,
                sha256:
                  typeof imageRecord.sha256 === "string"
                    ? imageRecord.sha256
                    : null,
                caption:
                  typeof imageRecord.caption === "string"
                    ? imageRecord.caption
                    : null,
              };
              if (imageId) {
                try {
                  const metadata = await getWhatsAppMediaMetadata(imageId);
                  imagePayload["file_size"] = metadata.fileSize ?? null;
                  imagePayload["mime_type"] = metadata.mimeType;
                } catch (err) {
                  console.warn(
                    `[whatsapp/webhook] image metadata failed (messageId=${waMessageId}, mediaId=${imageId}):`,
                    err instanceof Error ? err.message : err,
                  );
                }
              }
              content["image"] = imagePayload;
            }
          }
          if (e.message.type === "document" && "document" in msg) {
            const document = msg["document"];
            if (document && typeof document === "object") {
              const documentRecord = document as Record<string, unknown>;
              const documentId =
                typeof documentRecord.id === "string" ? documentRecord.id : "";
              const documentPayload: Record<string, unknown> = {
                id: documentId,
                mime_type:
                  typeof documentRecord.mime_type === "string"
                    ? documentRecord.mime_type
                    : null,
                sha256:
                  typeof documentRecord.sha256 === "string"
                    ? documentRecord.sha256
                    : null,
                filename:
                  typeof documentRecord.filename === "string"
                    ? documentRecord.filename
                    : null,
                caption:
                  typeof documentRecord.caption === "string"
                    ? documentRecord.caption
                    : null,
              };
              if (documentId) {
                try {
                  const metadata = await getWhatsAppMediaMetadata(documentId);
                  documentPayload["file_size"] = metadata.fileSize ?? null;
                  documentPayload["mime_type"] = metadata.mimeType;
                } catch (err) {
                  console.warn(
                    `[whatsapp/webhook] document metadata failed (messageId=${waMessageId}, mediaId=${documentId}):`,
                    err instanceof Error ? err.message : err,
                  );
                }
              }
              content["document"] = documentPayload;
            }
          }
          if ("context" in msg) content["context"] = msg["context"];

          const eventPayload = content as import("@/lib/event-store").JsonValue;
          const eventInput = {
            type: "WHATSAPP_RECIBIDO" as const,
            aggregateType: "WHATSAPP_CONVERSATION" as const,
            aggregateId: e.waId,
            payload: eventPayload,
            metadata: { source: "whatsapp_webhook", waMessageId } as import("@/lib/event-store").JsonValue,
          };

          // Persist event (always — traceability is non-negotiable)
          const storedEvent = await appendEvent(eventInput);

          const interactive = msg["interactive"];
          const interactiveReply =
            interactive && typeof interactive === "object"
              ? (() => {
                  const interactiveRecord = interactive as Record<string, unknown>;
                  const interactiveType =
                    typeof interactiveRecord.type === "string"
                      ? interactiveRecord.type
                      : "";
                  if (interactiveType === "button_reply") {
                    const buttonReply = interactiveRecord.button_reply;
                    if (buttonReply && typeof buttonReply === "object") {
                      const br = buttonReply as Record<string, unknown>;
                      return {
                        type: interactiveType,
                        buttonId:
                          typeof br.id === "string" ? br.id : undefined,
                        buttonTitle:
                          typeof br.title === "string" ? br.title : undefined,
                      };
                    }
                  }
                  return { type: interactiveType };
                })()
              : null;

          const expenseResult = await processInboundExpenseSync({
            waId: e.waId,
            messageId: waMessageId,
            timestamp: typeof e.message.timestamp === "string" ? e.message.timestamp : undefined,
            type: e.message.type,
            textBody:
              e.message.type === "text" && "text" in msg && msg["text"] && typeof msg["text"] === "object"
                ? (msg["text"] as Record<string, unknown>).body as string | undefined
                : null,
            interactiveReply,
            message: msg,
          });

          if (expenseResult.handled && expenseResult.skipQueue) {
            return { expense: expenseResult.reason, messageId: waMessageId };
          }

          // Attempt inline processing for Category A (conversational) messages.
          // If successful, skip enqueueing a job — the response was already sent.
          const inlineResult = await tryInlineProcessing(storedEvent);

          if (!inlineResult.processed) {
            // Not Category A, or inline failed → enqueue for consumer (fallback)
            await enqueueJob({
              type: "PROCESS_EVENT",
              payload: { eventId: storedEvent.id, eventType: storedEvent.type },
              sourceEventId: storedEvent.id,
              idempotencyKey: `process-event:${storedEvent.id}`,
            });
          }

          return storedEvent;
        }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    const errors = failed.map((r) =>
      r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : "",
    );
    console.error("[whatsapp/webhook] Error al guardar eventos:", errors);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/whatsapp/webhook" }, postHandler);
