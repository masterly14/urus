"use client";

import { useState, useEffect, useCallback } from "react";
import type { SnapshotStatusResult } from "@/lib/dashboard/ceo/types";
import { useSession } from "@/lib/hooks/use-session";

interface SnapshotStatusResponse extends SnapshotStatusResult {
  ok: boolean;
}

export function useCeoSnapshotStatus() {
  const { sessionHeaders } = useSession();
  const [data, setData] = useState<SnapshotStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/snapshot", {
        headers: JSON.parse(headersJson) as Record<string, string>,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: SnapshotStatusResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [headersJson]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { data, loading, error, refetch: fetchStatus };
}
