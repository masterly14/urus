"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import type { CeoFinancialRecommendation } from "@/lib/dashboard/ceo/financial-types";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

interface FinancialResponse {
  ok: boolean;
  recommendation: CeoFinancialRecommendation | null;
  generatedAt: string | null;
}

export function useCeoFinanciero() {
  const { sessionHeaders } = useSession();

  const { data, error, isLoading, mutate } = useSWR<FinancialResponse>(
    sessionHeaders ? ["/api/ceo/financiero", sessionHeaders] : null,
    swrAuthFetcher,
    { keepPreviousData: true },
  );

  return {
    data: data?.recommendation ?? null,
    generatedAt: data?.generatedAt ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => { mutate(); },
  };
}

export function useRegenerateFinanciero() {
  const { sessionHeaders } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async (): Promise<CeoFinancialRecommendation | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/financiero", {
        method: "POST",
        headers: sessionHeaders,
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
  }, [sessionHeaders]);

  return { regenerate, loading, error };
}
