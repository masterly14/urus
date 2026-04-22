"use client";

import useSWR from "swr";
import type { CeoCityPerformancePayload } from "@/lib/dashboard/ceo/types";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

interface CeoCityResponse extends CeoCityPerformancePayload {
  ok: boolean;
}

export function useCeoCityPerformance(from?: string, to?: string) {
  const { sessionHeaders } = useSession();

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const url = `/api/ceo/cities${qs ? `?${qs}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<CeoCityResponse>(
    sessionHeaders ? [url, sessionHeaders] : null,
    swrAuthFetcher,
    { keepPreviousData: true },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => { mutate(); },
  };
}
