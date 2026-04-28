/**
 * Cliente API REST de Statefox (statefox.com/public/aapi/props).
 * Solo lectura, autenticación Bearer token.
 * GET /properties (offset-based, hasta 500 items) y GET /snapshot (cursor-based, hasta 250 items).
 */

import type {
  GetPropertiesFilters,
  GetPropertiesResponse,
  GetSnapshotParams,
  GetSnapshotResponse,
  StatefoxSource,
  StatefoxHousing,
} from "./types";
import { buildQueryString, type QueryParams } from "@/lib/utils/query-string";
import { handleHttpErrorResponse } from "@/lib/utils/http-error";
import { fetchWithTimeout, tryCreateDispatcher } from "@/lib/utils/fetch-with-timeout";

const DEFAULT_BASE_URL = "https://statefox.com/public/aapi/props";
const DEFAULT_TIMEOUT_MS = 30_000;

const SOURCES: StatefoxSource[] = [
  "idealista",
  "fotocasa",
  "pisoscom",
  "habitaclia",
];
const HOUSING_TYPES: StatefoxHousing[] = [
  "flat",
  "house",
  "countryhouse",
  "duplex",
  "penthouse",
  "studio",
  "loft",
  "garage",
  "office",
  "premises",
  "land",
  "building",
  "storage",
  "warehouse",
  "room",
];

function summarizeImageShape(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sampleTypes: value.slice(0, 3).map((item) => typeof item),
      firstObjectKeys:
        value.find((item) => item && typeof item === "object" && !Array.isArray(item))
          ? Object.keys(value.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>).slice(0, 8)
          : [],
    };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const first = Object.values(obj).find((item) => item && typeof item === "object" && !Array.isArray(item));
    return {
      type: "object",
      keys: Object.keys(obj).slice(0, 8),
      firstObjectKeys: first ? Object.keys(first as Record<string, unknown>).slice(0, 8) : [],
    };
  }
  return { type: typeof value, present: value != null };
}

function debugStatefoxSnapshotShape(response: GetSnapshotResponse, params: GetSnapshotParams): void {
  const entries = Object.entries(response.result ?? {});
  const samples = entries.slice(0, 3).map(([id, prop]) => ({
    id,
    propertyKeys: Object.keys(prop as Record<string, unknown>).slice(0, 20),
    hasPropertyMainImage: typeof (prop as Record<string, unknown>).propertyMainImage === "string",
    hasImagesField: Object.prototype.hasOwnProperty.call(prop as Record<string, unknown>, "images"),
    pImages: summarizeImageShape((prop as Record<string, unknown>).pImages),
  }));
  // #region agent log
  fetch("http://127.0.0.1:7478/ingest/3a86774c-7051-4ca6-b6e8-a92160972b21", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bfe3e0" }, body: JSON.stringify({ sessionId: "bfe3e0", runId: "initial", hypothesisId: "H1,H2", location: "lib/statefox/client.ts:getSnapshot", message: "Statefox snapshot response image shape", data: { params: { items: params.items, status: params.status, type: params.type, hasNext: Boolean(params.next) }, topLevelKeys: Object.keys(response as Record<string, unknown>), resultCount: entries.length, metaKeys: Object.keys(response.meta ?? {}), samples }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
}

export type StatefoxClientConfig = {
  token: string;
  baseUrl?: string;
  /** Timeout por request en ms. Por defecto 30000. */
  timeoutMs?: number;
};

export type StatefoxClient = {
  get: <T = unknown>(
    path: string,
    params?: QueryParams,
  ) => Promise<T>;
};

export function createStatefoxClient(
  config?: Partial<StatefoxClientConfig> & { token?: string },
): StatefoxClient {
  const token =
    config?.token ??
    (typeof process !== "undefined" ? process.env?.STATEFOX_BEARER_TOKEN : undefined);
  if (!token) {
    throw new Error(
      "Statefox REST client requires token (config.token or STATEFOX_BEARER_TOKEN)",
    );
  }

  const baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const envTimeout =
    typeof process !== "undefined" ? Number(process.env?.STATEFOX_REST_TIMEOUT_MS) : NaN;
  const timeoutMs =
    config?.timeoutMs ??
    (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined) ??
    DEFAULT_TIMEOUT_MS;
  const dispatcher = tryCreateDispatcher(timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function request<T>(path: string, params?: QueryParams): Promise<T> {
    const url =
      baseUrl + path.replace(/^\//, "/") + (params ? buildQueryString(params) : "");
    const init: RequestInit = {
      method: "GET",
      headers: { ...headers },
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(url, init, { timeoutMs, dispatcher });
    } catch (err) {
      throw new Error(
        `Statefox REST request failed: ${path} — ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err : undefined },
      );
    }
    if (!response.ok) {
      await handleHttpErrorResponse(response);
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json() as Promise<T>;
    }
    return response.text() as Promise<T>;
  }

  return {
    get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
      return request<T>(path, params);
    },
  };
}

/**
 * Obtiene propiedades listadas en portales (Idealista, Fotocasa, etc.).
 * GET /properties — paginación offset-based, hasta 500 ítems por página.
 */
export async function getProperties(
  client: StatefoxClient,
  filters: GetPropertiesFilters,
): Promise<GetPropertiesResponse> {
  if (
    typeof filters.items !== "number" ||
    filters.items < 1 ||
    filters.items > 500
  ) {
    throw new Error("Statefox getProperties: items must be between 1 and 500");
  }
  if (!SOURCES.includes(filters.source)) {
    throw new Error(
      `Statefox getProperties: invalid source "${filters.source}". Valid: ${SOURCES.join(", ")}`,
    );
  }
  if (!HOUSING_TYPES.includes(filters.housing)) {
    throw new Error(
      `Statefox getProperties: invalid housing "${filters.housing}". Valid: ${HOUSING_TYPES.join(", ")}`,
    );
  }

  const params: Record<string, string | number> = {
    source: filters.source,
    type: filters.type,
    items: filters.items,
    housing: filters.housing,
  };
  if (filters.insert) {
    params.insert = filters.insert;
  }

  const raw = await client.get<{
    properties?: Record<string, unknown>;
    result?: Record<string, unknown>;
    meta?: unknown;
  }>("/properties", params);

  // Compatibilidad: la documentación interna usa `properties`, pero la API real
  // puede responder con `result`. Normalizamos a `properties`.
  const normalizedProperties = (raw.properties ?? raw.result ?? {}) as Record<string, unknown>;

  return {
    properties: normalizedProperties as GetPropertiesResponse["properties"],
    meta: (raw.meta ?? {}) as GetPropertiesResponse["meta"],
  };
}

/**
 * Obtiene el estado actual de las propiedades rastreadas (activas/inactivas).
 * GET /snapshot — paginación cursor-based, hasta 250 ítems por página.
 */
export async function getSnapshot(
  client: StatefoxClient,
  params: GetSnapshotParams,
): Promise<GetSnapshotResponse> {
  if (
    typeof params.items !== "number" ||
    params.items < 1 ||
    params.items > 250
  ) {
    throw new Error("Statefox getSnapshot: items must be between 1 and 250");
  }

  const query: Record<string, string | number | undefined | null> = {
    items: params.items,
    status: params.status ?? undefined,
    type: params.type ?? undefined,
    next: params.next ?? undefined,
  };

  const response = await client.get<GetSnapshotResponse>("/snapshot", query);
  debugStatefoxSnapshotShape(response, params);
  return response;
}
