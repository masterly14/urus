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

export type StatefoxClientConfig = {
  token: string;
  baseUrl?: string;
  /** Timeout por request en ms. Por defecto 30000. */
  timeoutMs?: number;
};

export type StatefoxClient = {
  get: <T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
  ) => Promise<T>;
};

function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (value === true) {
      searchParams.set(key, "");
    } else if (value !== false) {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

async function handleErrorResponse(response: Response): Promise<never> {
  let message = `${response.status} ${response.statusText}`;
  const text = await response.text();
  if (text) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const detail = body.message ?? body.error ?? body.mensaje ?? text;
      message = `${response.status} ${response.statusText}: ${String(detail)}`;
    } catch {
      message = `${response.status} ${response.statusText}: ${text}`;
    }
  }
  throw new Error(message);
}

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

  let dispatcher: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(/* webpackIgnore: true */ "undici");
    const AgentCtor = mod?.Agent ?? mod?.default?.Agent;
    if (typeof AgentCtor === "function") {
      dispatcher = new AgentCtor({
        connect: { timeout: timeoutMs },
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
      });
    }
  } catch {
    dispatcher = undefined;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function request<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    const url =
      baseUrl + path.replace(/^\//, "/") + (params ? buildQueryString(params) : "");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const init: Record<string, unknown> = {
      method: "GET",
      headers: { ...headers },
      signal: controller.signal,
    };
    if (dispatcher) {
      init.dispatcher = dispatcher;
    }

    let response: Response;
    try {
      response = await fetch(url, init as RequestInit);
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const cause = isAbort
        ? `Request timeout after ${timeoutMs}ms`
        : (err instanceof Error ? err.cause ?? err.message : String(err));
      throw new Error(`Statefox REST request failed: ${path} — ${cause}`, {
        cause: err instanceof Error ? err : undefined,
      });
    }
    if (!response.ok) {
      await handleErrorResponse(response);
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json() as Promise<T>;
    }
    return response.text() as Promise<T>;
  }

  return {
    get<T = unknown>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ): Promise<T> {
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

  return client.get<GetPropertiesResponse>("/properties", params);
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

  return client.get<GetSnapshotResponse>("/snapshot", query);
}
