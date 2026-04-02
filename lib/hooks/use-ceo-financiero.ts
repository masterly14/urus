"use client";

import { useState, useEffect, useCallback } from "react";
import type { CeoFinancialRecommendation } from "@/lib/dashboard/ceo/financial-types";
import { useSession } from "@/lib/hooks/use-session";

interface FinancialResponse {
  ok: boolean;
  recommendation: CeoFinancialRecommendation | null;
  generatedAt: string | null;
}

export function useCeoFinanciero() {
  const { sessionHeaders } = useSession();
  const [data, setData] = useState<CeoFinancialRecommendation | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/financiero", {
        headers: JSON.parse(headersJson) as Record<string, string>,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: FinancialResponse = await res.json();
      setData(json.recommendation);
      setGeneratedAt(json.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [headersJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, generatedAt, loading, error, refetch: fetchData };
}

export function useRegenerateFinanciero() {
  const { sessionHeaders } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const regenerate = useCallback(async (): Promise<CeoFinancialRecommendation | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/financiero", {
        method: "POST",
        headers: JSON.parse(headersJson) as Record<string, string>,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.recommendation ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [headersJson]);

  return { regenerate, loading, error };
}
