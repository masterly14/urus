"use client";

import { useState, useEffect, useCallback } from "react";
import type { CeoOverviewPayload } from "@/lib/dashboard/ceo/types";
import { useSession } from "@/lib/hooks/use-session";

interface CeoOverviewResponse extends CeoOverviewPayload {
  ok: boolean;
}

export function useCeoOverview() {
  const { sessionHeaders } = useSession();
  const [data, setData] = useState<CeoOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/overview", {
        headers: JSON.parse(headersJson) as Record<string, string>,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: CeoOverviewResponse = await res.json();
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[ceo/overview] Datos recibidos del backend (GET /api/ceo/overview). KPI EBITDA =",
          json.kpis?.ebitda?.value,
          "€ — ver terminal del servidor para tabla/columna de origen.",
          json,
        );
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [headersJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
