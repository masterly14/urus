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

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async operation with exponential backoff.
 * Retries on 429 (rate limit) and 5xx (server errors) only.
 */
export async function fetchWithRetry(
  fn: () => Promise<Response>,
  maxRetries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw lastError;
    }

    if (response.ok || !isRetryableStatus(response.status) || attempt === maxRetries) {
      return response;
    }

    await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
  }
  throw lastError ?? new Error("fetchWithRetry: exhausted retries");
}

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

    const jsonBody = JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...payload,
    });

    const response = await fetchWithRetry(() =>
      fetchWithTimeout(
        url,
        { method: "POST", headers, body: jsonBody },
        { timeoutMs, dispatcher },
      ),
    );

    if (!response.ok) {
      await handleMetaError(response);
    }

    return response.json() as Promise<SendMessageSuccess>;
  }

  return { sendMessage };
}
