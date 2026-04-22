"use client";

import useSWR from "swr";
import type { CeoOverviewPayload } from "@/lib/dashboard/ceo/types";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

interface CeoOverviewResponse extends CeoOverviewPayload {
  ok: boolean;
}

export function useCeoOverview() {
  const { sessionHeaders } = useSession();

  const { data, error, isLoading, mutate } = useSWR<CeoOverviewResponse>(
    sessionHeaders ? ["/api/ceo/overview", sessionHeaders] : null,
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
