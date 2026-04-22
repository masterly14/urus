"use client";

import { useCallback } from "react";
import useSWR from "swr";

export interface DashboardAlert {
  id: string;
  comercialId: string;
  comercialNombre: string;
  type: "drop" | "sla_breach" | "deviation";
  severity: "low" | "medium" | "high";
  metric: string;
  message: string;
  currentValue: number | null;
  baselineValue: number | null;
  threshold: number | null;
  details: Record<string, unknown>;
  notifiedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DashboardAlertsFilters {
  from?: string;
  to?: string;
  comercialId?: string;
  severity?: string;
  type?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

interface AlertsResponse {
  ok: boolean;
  alerts: DashboardAlert[];
  total: number;
}

function buildSearchParams(filters: DashboardAlertsFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.comercialId) params.set("comercialId", filters.comercialId);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.type) params.set("type", filters.type);
  if (filters.resolved !== undefined) params.set("resolved", String(filters.resolved));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useDashboardAlerts(filters: DashboardAlertsFilters = {}) {
  const qs = buildSearchParams(filters);
  const url = `/api/dashboard/alerts${qs}`;

  const { data, error, isLoading, mutate } = useSWR<AlertsResponse>(
    url,
    { keepPreviousData: true },
  );

  const resolveAlert = useCallback(async (alertId: string) => {
    const res = await fetch(`/api/dashboard/alerts/${alertId}/resolve`, {
      method: "PATCH",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    await mutate();
  }, [mutate]);

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => { mutate(); },
    resolveAlert,
  };
}
