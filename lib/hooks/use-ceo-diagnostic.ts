"use client";

import { useState, useEffect, useCallback } from "react";
import type { CeoDiagnosticRecommendation } from "@/lib/dashboard/ceo/diagnostic-types";
import { useSession } from "@/lib/hooks/use-session";

interface DiagnosticResponse {
  ok: boolean;
  recommendation: CeoDiagnosticRecommendation | null;
  generatedAt: string | null;
}

export function useCeoDiagnostic() {
  const { sessionHeaders } = useSession();
  const [data, setData] = useState<CeoDiagnosticRecommendation | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/diagnostic", {
        headers: JSON.parse(headersJson) as Record<string, string>,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: DiagnosticResponse = await res.json();
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

export function useRegenerateDiagnostic() {
  const { sessionHeaders } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headersJson = JSON.stringify(sessionHeaders);

  const regenerate = useCallback(async (): Promise<CeoDiagnosticRecommendation | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ceo/diagnostic", {
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
