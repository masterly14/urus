"use client";

import { useEffect, useRef, useState } from "react";

export type StatefoxImageCacheUiStatus =
  | "IMPORTED"
  | "PENDING"
  | "FAILED"
  | "BLOCKED"
  | "CAPTCHA"
  | "LISTING_REMOVED"
  | "NO_IMAGES_FOUND"
  | "UNKNOWN";

export interface StatefoxImageCacheStatusItem {
  statefoxId: string;
  status: StatefoxImageCacheUiStatus;
  cachedUrls: string[];
  importedCount: number;
  attempts: number;
  errorReason: string | null;
  updatedAt: string | null;
}

export interface UseStatefoxImageCachePollingOptions {
  /** statefoxIds a vigilar. */
  ids: string[];
  /** Estado inicial conocido (lo que devuelve el SSR del informe). */
  initial?: Map<string, StatefoxImageCacheStatusItem>;
  /** Intervalo de polling en ms (default 1500). */
  intervalMs?: number;
  /** Tiempo máximo de polling en ms (default 30000) — protege contra sesiones eternas. */
  maxDurationMs?: number;
  /** Override del endpoint para testing. */
  endpoint?: string;
  /** fetch para inyección en tests. */
  fetchImpl?: typeof fetch;
  /** Si false, el hook no consulta (útil cuando todos están IMPORTED). */
  enabled?: boolean;
}

interface PollResponse {
  items: Array<StatefoxImageCacheStatusItem | undefined>;
  count: number;
  timestamp: string;
}

const DEFAULT_INTERVAL_MS = 1_500;
const DEFAULT_MAX_DURATION_MS = 30_000;

const TERMINAL_STATES: ReadonlySet<StatefoxImageCacheUiStatus> = new Set([
  "IMPORTED",
  "BLOCKED",
  "CAPTCHA",
  "LISTING_REMOVED",
  "NO_IMAGES_FOUND",
]);

function shouldStopPolling(items: Map<string, StatefoxImageCacheStatusItem>): boolean {
  if (items.size === 0) return true;
  for (const item of items.values()) {
    if (!TERMINAL_STATES.has(item.status)) return false;
  }
  return true;
}

export function useStatefoxImageCachePolling(
  options: UseStatefoxImageCachePollingOptions,
): {
  items: Map<string, StatefoxImageCacheStatusItem>;
  isPolling: boolean;
  lastError: string | null;
} {
  const {
    ids,
    initial,
    intervalMs = DEFAULT_INTERVAL_MS,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    endpoint = "/api/statefox/image-cache/status",
    fetchImpl,
    enabled = true,
  } = options;

  const [items, setItems] = useState<Map<string, StatefoxImageCacheStatusItem>>(
    () => new Map(initial ?? []),
  );
  const [isPolling, setIsPolling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const idsKey = ids.slice().sort().join(",");
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    const fetcher = fetchImpl ?? fetch;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    startedAtRef.current = Date.now();

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as PollResponse;
        if (cancelled) return;
        const next = new Map<string, StatefoxImageCacheStatusItem>();
        for (const item of data.items) {
          if (item) next.set(item.statefoxId, item);
        }
        setItems(next);
        setLastError(null);
        if (shouldStopPolling(next)) {
          setIsPolling(false);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setLastError(err instanceof Error ? err.message : String(err));
      }

      if (Date.now() - startedAtRef.current > maxDurationMs) {
        setIsPolling(false);
        return;
      }
      timer = setTimeout(poll, intervalMs);
    };

    setIsPolling(true);
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setIsPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, endpoint, intervalMs, maxDurationMs, enabled]);

  return { items, isPolling, lastError };
}
