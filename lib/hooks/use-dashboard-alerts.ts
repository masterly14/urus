"use client";

import { useState, useEffect, useCallback } from "react";

export interface DashboardAlert {
  id: string;
  comercialId: string;
  comercialNombre: string;
  type:
    | "drop"
    | "sla_breach"
    | "deviation"
    | "mh_energy_low"
    | "mh_bloqueo_recurrente"
    | "mh_sobrecarga_uso";
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
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildSearchParams(filters);
      const res = await fetch(`/api/dashboard/alerts${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: AlertsResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [
    filters.from,
    filters.to,
    filters.comercialId,
    filters.severity,
    filters.type,
    filters.resolved,
    filters.limit,
    filters.offset,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resolveAlert = useCallback(async (alertId: string) => {
    try {
      const res = await fetch(`/api/dashboard/alerts/${alertId}/resolve`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData, resolveAlert };
}
