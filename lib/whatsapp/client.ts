/**
 * Cliente HTTP para la WhatsApp Cloud API (Meta).
 * Integración directa con graph.facebook.com — sin BSP (Twilio/360dialog).
 * Auth: Bearer token de acceso (system user o token de app).
 */

import { fetchWithTimeout, tryCreateDispatcher } from "@/lib/utils/fetch-with-timeout";
import type {
  WhatsAppClientConfig,
  SendMessagePayload,
  SendMessageSuccess,
  MetaApiError,
  META_API_VERSION,
} from "./types";

const DEFAULT_API_VERSION: typeof META_API_VERSION = "v20.0";
const DEFAULT_TIMEOUT_MS = 15_000;

export type WhatsAppClient = {
  sendMessage: (payload: SendMessagePayload) => Promise<SendMessageSuccess>;
};

async function handleMetaError(response: Response): Promise<never> {
  let message = `Meta API ${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as Partial<MetaApiError>;
    if (body.error?.message) {
      message = `Meta API error ${body.error.code}: ${body.error.message} (type: ${body.error.type})`;
    }
  } catch {
    // json parse fallido, usar mensaje base
  }
  throw new Error(message);
}

export function createWhatsAppClient(config?: Partial<WhatsAppClientConfig>): WhatsAppClient {
  const accessToken = config?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = config?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken) {
    throw new Error(
      "WhatsApp client: falta WHATSAPP_ACCESS_TOKEN (env o config.accessToken)",
    );
  }
  if (!phoneNumberId) {
    throw new Error(
      "WhatsApp client: falta WHATSAPP_PHONE_NUMBER_ID (env o config.phoneNumberId)",
    );
  }

  const apiVersion = config?.apiVersion ?? DEFAULT_API_VERSION;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dispatcher = tryCreateDispatcher(timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  async function sendMessage(payload: SendMessagePayload): Promise<SendMessageSuccess> {
    const url = `${baseUrl}/${phoneNumberId}/messages`;

    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...payload,
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        { method: "POST", headers, body: JSON.stringify(body) },
        { timeoutMs, dispatcher },
      );
    } catch (err) {
      throw new Error(
        `WhatsApp sendMessage falló: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : undefined },
      );
    }

    if (!response.ok) {
      await handleMetaError(response);
    }

    return response.json() as Promise<SendMessageSuccess>;
  }

  return { sendMessage };
}
