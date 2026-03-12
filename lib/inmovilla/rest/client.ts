/**
 * Cliente API REST v1 de Inmovilla (procesos.inmovilla.com/api/v1).
 * Auth por token estático; sin sesión, sin cookies.
 * lib/inmovilla/api/ es el cliente legacy (sesión/cookies) para operaciones no cubiertas por REST.
 *
 * Rate limits (doc): propiedades 10/min, clientes 20/min, propietarios 20/min, enums 2/min.
 */

import type { InmovillaRestErrorBody } from "./types";

const DEFAULT_BASE_URL = "https://procesos.inmovilla.com/api/v1";

export type InmovillaRestClientConfig = {
  token: string;
  baseUrl?: string;
};

export type InmovillaRestClient = {
  get: <T = unknown>(path: string, params?: Record<string, string | number | boolean>) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
};

function buildQueryString(params: Record<string, string | number | boolean>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === true) {
      searchParams.set(key, "");
    } else if (value !== false && value !== undefined && value !== null) {
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
      const body = JSON.parse(text) as InmovillaRestErrorBody;
      if (body.mensaje) {
        message = `${response.status} ${response.statusText}: ${body.mensaje}`;
      } else if (body.codigo !== undefined) {
        message = `${response.status} (codigo ${body.codigo})${body.mensaje ? `: ${body.mensaje}` : ""}`;
      } else {
        message = `${response.status} ${response.statusText}: ${text}`;
      }
    } catch {
      message = `${response.status} ${response.statusText}: ${text}`;
    }
  }
  throw new Error(message);
}

export function createInmovillaRestClient(
  config?: Partial<InmovillaRestClientConfig> & { token?: string },
): InmovillaRestClient {
  const token =
    config?.token ??
    (typeof process !== "undefined" ? process.env?.INMOVILLA_API_TOKEN : undefined);
  if (!token) {
    throw new Error("Inmovilla REST client requires token (config.token or INMOVILLA_API_TOKEN)");
  }

  const baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Token: token,
  };

  async function request<T>(
    method: string,
    path: string,
    options?: { params?: Record<string, string | number | boolean>; body?: unknown },
  ): Promise<T> {
    const url =
      baseUrl + path.replace(/^\//, "/") + (options?.params ? buildQueryString(options.params) : "");
    const init: RequestInit = {
      method,
      headers: { ...headers },
    };
    if (options?.body !== undefined && (method === "POST" || method === "PUT")) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);
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
    get<T = unknown>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
      return request<T>("GET", path, { params });
    },
    post<T = unknown>(path: string, body?: unknown): Promise<T> {
      return request<T>("POST", path, { body });
    },
    put<T = unknown>(path: string, body?: unknown): Promise<T> {
      return request<T>("PUT", path, { body });
    },
    delete<T = unknown>(path: string): Promise<T> {
      return request<T>("DELETE", path);
    },
  };
}
