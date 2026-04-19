/**
 * GET  /api/whatsapp/webhook — verificación del webhook al registrar en Meta Business Manager.
 * POST /api/whatsapp/webhook — recepción de mensajes y actualizaciones de estado.
 *
 * GET: Meta envía hub.mode=subscribe, hub.verify_token y hub.challenge.
 *      Devolvemos el challenge en texto plano si el token es correcto.
 *
 * POST: Meta envía el payload del evento. Verificamos la firma X-Hub-Signature-256,
 *       parseamos los mensajes entrantes y emitimos eventos WHATSAPP_RECIBIDO en el Event Store.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseWebhookPayload,
} from "@/lib/whatsapp";
import type { ParsedWebhookMessage } from "@/lib/whatsapp";
import { appendEventAndEnqueueJob } from "@/lib/event-store";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import {
  handleNotaEncargoButtonReply,
  handleNotaEncargoNfmReply,
} from "@/lib/nota-encargo";
import { handleParteVisitaNfmReply } from "@/lib/parte-visita/webhook-handler";
import { handlePostventaFormNfmReply } from "@/lib/postventa/form-response-handler";


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

    if (msg.type === "interactive" && interactive) {
      try {
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
      } catch (err) {
        console.error(
          "[whatsapp/webhook] Nota de Encargo intercept error:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  const results = await Promise.allSettled(
    events
      .filter((e): e is ParsedWebhookMessage => e.kind === "message")
        .map(async (e) => {
          const waMessageId = e.message.id;

          // Dedup: Meta may retry delivery; skip if we already stored this messageId
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
          if ("context" in msg) content["context"] = msg["context"];

          const stored = await appendEventAndEnqueueJob({
            event: {
              type: "WHATSAPP_RECIBIDO",
              aggregateType: "WHATSAPP_CONVERSATION",
              aggregateId: e.waId,
              payload: content as import("@/lib/event-store").JsonValue,
              metadata: { source: "whatsapp_webhook", waMessageId },
            },
          });

          return stored;
        }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    const errors = failed.map((r) =>
      r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : "",
    );
    console.error("[whatsapp/webhook] Error al guardar eventos:", errors);
    // Meta requiere 200 aunque fallen los side-effects para no reintentar indefinidamente
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/whatsapp/webhook" }, postHandler);
