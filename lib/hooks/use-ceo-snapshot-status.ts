"use client";

import useSWR from "swr";
import type { SnapshotStatusResult } from "@/lib/dashboard/ceo/types";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

interface SnapshotStatusResponse extends SnapshotStatusResult {
  ok: boolean;
}

export function useCeoSnapshotStatus() {
  const { sessionHeaders } = useSession();

  const { data, error, isLoading, mutate } = useSWR<SnapshotStatusResponse>(
    sessionHeaders ? ["/api/ceo/snapshot", sessionHeaders] : null,
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
