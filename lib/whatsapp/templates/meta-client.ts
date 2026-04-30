import { fetchWithRetry } from "@/lib/whatsapp/client";
import { META_API_VERSION } from "@/lib/whatsapp/types";
import type { WabaTemplate } from "./types";

const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 20_000;

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

type MessageTemplatesResponse = {
  data?: WabaTemplate[];
  paging?: {
    next?: string;
  };
};

export type WabaTemplatesClientConfig = {
  accessToken?: string;
  wabaId?: string;
  apiVersion?: string;
  timeoutMs?: number;
};

function requiredEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`WhatsApp templates: falta ${name}`);
  }
  return trimmed;
}

async function parseGraphResponse(response: Response): Promise<MessageTemplatesResponse> {
  const json = await response.json() as MessageTemplatesResponse & GraphError;
  if (!response.ok) {
    const error = json.error;
    const detail = error?.message
      ? `Meta API error ${error.code ?? response.status}: ${error.message}`
      : `Meta API ${response.status} ${response.statusText}`;
    throw new Error(detail);
  }
  return json;
}

export function createWabaTemplatesClient(config: WabaTemplatesClientConfig = {}) {
  const accessToken = requiredEnv(
    "WHATSAPP_ACCESS_TOKEN",
    config.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN,
  );
  const wabaId = requiredEnv(
    "WHATSAPP_BUSINESS_ID",
    config.wabaId ?? process.env.WHATSAPP_BUSINESS_ID,
  );
  const apiVersion = config.apiVersion ?? META_API_VERSION;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function fetchPage(url: string): Promise<MessageTemplatesResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchWithRetry(() =>
        fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        }),
      );
      return parseGraphResponse(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async listTemplates(): Promise<WabaTemplate[]> {
      const fields = [
        "id",
        "name",
        "language",
        "status",
        "category",
        "components",
      ].join(",");
      const params = new URLSearchParams({
        fields,
        limit: String(DEFAULT_LIMIT),
      });
      let nextUrl: string | undefined =
        `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?${params.toString()}`;
      const templates: WabaTemplate[] = [];

      while (nextUrl) {
        const page = await fetchPage(nextUrl);
        templates.push(...(page.data ?? []));
        nextUrl = page.paging?.next;
      }

      return templates;
    },
  };
}
