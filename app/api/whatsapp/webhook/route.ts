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
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";

// ---- GET: verificación del challenge ----

export async function GET(request: NextRequest): Promise<NextResponse> {
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

// ---- POST: eventos entrantes ----

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // Verificar firma si WHATSAPP_APP_SECRET está configurado
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const events = parseWebhookPayload(body);

  const results = await Promise.allSettled(
    events
      .filter((e): e is ParsedWebhookMessage => e.kind === "message")
        .map(async (e) => {
          const msg = e.message as Record<string, unknown>;
          const content: Record<string, unknown> = {
            messageId: e.message.id,
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

          const stored = await appendEvent({
            type: "WHATSAPP_RECIBIDO",
            aggregateType: "WHATSAPP_CONVERSATION",
            aggregateId: e.waId,
            payload: content as import("@/lib/event-store").JsonValue,
            metadata: { source: "whatsapp_webhook" },
          });

          // Dispara el pipeline: consumer (PROCESS_EVENT) → handler WHATSAPP_RECIBIDO → NLU → DEMANDA_ACTUALIZADA
          await enqueueJob({
            type: "PROCESS_EVENT",
            payload: { eventId: stored.id, eventType: stored.type },
            sourceEventId: stored.id,
            idempotencyKey: `process-event:${stored.id}`,
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
