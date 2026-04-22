/**
 * In-memory caching wrapper for Inmovilla REST API reads.
 * Protects against rate limits (10 props/min, 20 clients/min) by caching
 * GET responses with endpoint-specific TTLs.
 *
 * Cache is process-level: resets on each deploy/restart (Vercel serverless).
 */

import type { InmovillaRestClient, InmovillaRestClientConfig } from "./client";
import { createInmovillaRestClient } from "./client";
import { createHash } from "crypto";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min

const PATH_TTL_OVERRIDES: Record<string, number> = {
  "/clientes": 2 * 60 * 1000,       // 2 min for clients
  "/propietarios": 2 * 60 * 1000,   // 2 min for owners
};

function getTtlForPath(path: string): number {
  for (const [prefix, ttl] of Object.entries(PATH_TTL_OVERRIDES)) {
    if (path.startsWith(prefix)) return ttl;
  }
  return DEFAULT_TTL_MS;
}

function buildCacheKey(
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  const paramStr = params ? JSON.stringify(params, Object.keys(params).sort()) : "";
  const hash = paramStr
    ? createHash("md5").update(paramStr).digest("hex").slice(0, 12)
    : "no-params";
  return `GET:${path}:${hash}`;
}

const cache = new Map<string, CacheEntry>();

function pruneExpired(): void {
  if (cache.size < 500) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export function createCachedInmovillaRestClient(
  config?: Partial<InmovillaRestClientConfig> & { token?: string },
): InmovillaRestClient {
  const inner = createInmovillaRestClient(config);

  return {
    async get<T = unknown>(
      path: string,
      params?: Record<string, string | number | boolean>,
    ): Promise<T> {
      const key = buildCacheKey(path, params);
      const now = Date.now();

      const existing = cache.get(key);
      if (existing && existing.expiresAt > now) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[inmovilla-cache] HIT ${key}`);
        }
        return existing.data as T;
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[inmovilla-cache] MISS ${key}`);
      }

      const data = await inner.get<T>(path, params);

      cache.set(key, { data, expiresAt: now + getTtlForPath(path) });
      pruneExpired();

      return data;
    },

    post<T = unknown>(path: string, body?: unknown): Promise<T> {
      return inner.post<T>(path, body);
    },

    put<T = unknown>(path: string, body?: unknown): Promise<T> {
      return inner.put<T>(path, body);
    },

    delete<T = unknown>(path: string): Promise<T> {
      return inner.delete<T>(path);
    },
  };
}

/** Clears the entire in-memory cache. Useful in tests. */
export function clearInmovillaCache(): void {
  cache.clear();
}
