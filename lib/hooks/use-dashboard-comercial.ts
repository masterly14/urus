"use client";

import useSWR from "swr";
import type { ComercialesDashboardRow, ComercialDashboardDetail } from "@/lib/dashboard/comercial/queries";
import type { ComercialProfile } from "@/lib/dashboard/comercial/classify";
import { useSession } from "@/lib/hooks/use-session";
import { swrAuthFetcher } from "@/lib/swr/config";

export interface DashboardComercialesFilters {
  from?: string;
  to?: string;
  includeInactive?: boolean;
}

export type DashboardRowWithClassification = ComercialesDashboardRow & {
  classification: {
    profile: ComercialProfile;
    confidence: number;
  };
};

interface ComercialesResponse {
  ok: boolean;
  rows: DashboardRowWithClassification[];
  commissionRate: number;
  range: { from: string; to: string };
}

interface ComercialDetailResponse {
  ok: boolean;
  summary: ComercialesDashboardRow | null;
  weekly: ComercialDashboardDetail["weekly"];
  commissionRate: number;
  range: { from: string; to: string };
  classification: {
    profile: ComercialProfile;
    confidence: number;
  } | null;
}

function buildSearchParams(filters: DashboardComercialesFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.includeInactive) params.set("includeInactive", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useDashboardComerciales(filters: DashboardComercialesFilters = {}) {
  const { sessionHeaders } = useSession();
  const qs = buildSearchParams(filters);
  const url = `/api/dashboard/comerciales${qs}`;

  const { data, error, isLoading, mutate } = useSWR<ComercialesResponse>(
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

export function useDashboardComercialDetail(
  comercialId: string | null,
  filters: DashboardComercialesFilters = {},
) {
  const { sessionHeaders } = useSession();
  const qs = buildSearchParams(filters);
  const url = comercialId ? `/api/dashboard/comercial/${comercialId}${qs}` : null;

  const { data, error, isLoading, mutate } = useSWR<ComercialDetailResponse>(
    url && sessionHeaders ? [url, sessionHeaders] : null,
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
