"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import type { CeoExpansionRecommendation } from "@/lib/dashboard/ceo/expansion-types";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

interface ExpansionResponse {
  ok: boolean;
  recommendation: CeoExpansionRecommendation | null;
  generatedAt: string | null;
}

export function useCeoExpansion() {
  const { sessionHeaders } = useSession();

  const { data, error, isLoading, mutate } = useSWR<ExpansionResponse>(
    sessionHeaders ? ["/api/ceo/expansion", sessionHeaders] : null,
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

export function useRegenerateExpansion() {
  const { sessionHeaders } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async (): Promise<CeoExpansionRecommendation | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/expansion", {
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
