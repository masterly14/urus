"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import type { CeoDiagnosticRecommendation } from "@/lib/dashboard/ceo/diagnostic-types";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

interface DiagnosticResponse {
  ok: boolean;
  recommendation: CeoDiagnosticRecommendation | null;
  generatedAt: string | null;
}

export function useCeoDiagnostic() {
  const { sessionHeaders } = useSession();

  const { data, error, isLoading, mutate } = useSWR<DiagnosticResponse>(
    sessionHeaders ? ["/api/ceo/diagnostic", sessionHeaders] : null,
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

export function useRegenerateDiagnostic() {
  const { sessionHeaders } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async (): Promise<CeoDiagnosticRecommendation | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/diagnostic", {
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
