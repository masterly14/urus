"use client";

import { useState, useEffect, useCallback } from "react";
import type { CeoCityPerformancePayload } from "@/lib/dashboard/ceo/types";
import { useSession } from "@/lib/hooks/use-session";

interface CeoCityResponse extends CeoCityPerformancePayload {
  ok: boolean;
}

export function useCeoCityPerformance(from?: string, to?: string) {
  const { sessionHeaders } = useSession();
  const [data, setData] = useState<CeoCityPerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const url = `/api/ceo/cities${qs ? `?${qs}` : ""}`;

      const res = await fetch(url, {
        headers: JSON.parse(headersJson) as Record<string, string>,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: CeoCityResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [headersJson, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
