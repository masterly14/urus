import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

const AUTH_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 10,
};

const HEAVY_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 15,
};

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function cleanupExpired(store: Map<string, RateLimitEntry>): void {
  const now = Date.now();
  if (store.size > 10_000) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }
}

export function checkRateLimit(
  request: Request,
  storeName: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): { allowed: boolean; remaining: number; resetAt: number } {
  const store = getStore(storeName);
  cleanupExpired(store);

  const ip = getClientIp(request);
  const now = Date.now();
  const existing = store.get(ip);

  if (!existing || existing.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  existing.count++;
  const allowed = existing.count <= config.maxRequests;
  return {
    allowed,
    remaining: Math.max(0, config.maxRequests - existing.count),
    resetAt: existing.resetAt,
  };
}

export function rateLimitResponse(resetAt: number): Response {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { ok: false, error: "Demasiadas solicitudes. Intenta de nuevo más tarde." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfter)),
      },
    },
  );
}

type RouteHandler = (request: Request, context?: unknown) => Promise<Response> | Response;

export function withRateLimit(
  storeName: string,
  config: RateLimitConfig,
  handler: RouteHandler,
): RouteHandler {
  return async (request: Request, context?: unknown) => {
    const result = checkRateLimit(request, storeName, config);
    if (!result.allowed) {
      return rateLimitResponse(result.resetAt);
    }
    const response = await handler(request, context);
    return response;
  };
}

export { DEFAULT_CONFIG, AUTH_CONFIG, HEAVY_CONFIG };
export type { RateLimitConfig };
