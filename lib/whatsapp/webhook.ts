/**
 * Verificación y parsing del webhook de WhatsApp Cloud API (Meta).
 *
 * GET  /api/whatsapp/webhook — verificación del challenge (suscripción inicial).
 * POST /api/whatsapp/webhook — eventos entrantes: mensajes y actualizaciones de estado.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type {
  WhatsAppWebhookPayload,
  WhatsAppWebhookMessage,
  WhatsAppWebhookStatus,
} from "./types";

// ---- Verificación del challenge (GET) ----

export type WebhookVerifyParams = {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
};

/**
 * Verifica el challenge de Meta al registrar el webhook.
 * Devuelve la cadena challenge si la verificación es correcta, null si falla.
 */
export function verifyWebhookChallenge(
  params: WebhookVerifyParams,
  verifyToken?: string,
): string | null {
  const token = verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token) return null;

  if (
    params["hub.mode"] === "subscribe" &&
    params["hub.verify_token"] === token &&
    params["hub.challenge"]
  ) {
    return params["hub.challenge"];
  }
  return null;
}

// ---- Verificación de firma (POST) ----

/**
 * Verifica la firma HMAC-SHA256 enviada por Meta en la cabecera X-Hub-Signature-256.
 * Usar siempre en producción para evitar payloads falsificados.
 *
 * @param rawBody   Buffer o string con el body crudo (antes de parsear).
 * @param signature Valor de la cabecera X-Hub-Signature-256 (formato "sha256=<hex>").
 * @param appSecret App Secret del Meta App (WHATSAPP_APP_SECRET o argumento explícito).
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  appSecret?: string,
): boolean {
  const secret = appSecret ?? process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
  const expected = `sha256=${hmac.digest("hex")}`;

  if (expected.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

// ---- Parsing del payload ----

export type ParsedWebhookMessage = {
  kind: "message";
  message: WhatsAppWebhookMessage;
  waId: string;
  profileName?: string;
  phoneNumberId: string;
};

export type ParsedWebhookStatus = {
  kind: "status";
  status: WhatsAppWebhookStatus;
  phoneNumberId: string;
};

export type ParsedWebhookUnknown = {
  kind: "unknown";
  raw: unknown;
};

export type ParsedWebhookEvent =
  | ParsedWebhookMessage
  | ParsedWebhookStatus
  | ParsedWebhookUnknown;

/**
 * Parsea el payload del webhook de Meta y normaliza los eventos.
 * Devuelve un array de eventos tipados: mensajes entrantes y actualizaciones de estado.
 */
export function parseWebhookPayload(body: unknown): ParsedWebhookEvent[] {
  const events: ParsedWebhookEvent[] = [];

  const payload = body as Partial<WhatsAppWebhookPayload>;
  if (payload?.object !== "whatsapp_business_account") {
    events.push({ kind: "unknown", raw: body });
    return events;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id ?? "";

      for (const message of value.messages ?? []) {
        const contact = value.contacts?.find((c) => c.wa_id === message.from);
        events.push({
          kind: "message",
          message,
          waId: message.from,
          profileName: contact?.profile?.name,
          phoneNumberId,
        });
      }

      for (const status of value.statuses ?? []) {
        events.push({ kind: "status", status, phoneNumberId });
      }
    }
  }

  return events;
}
