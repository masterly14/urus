"use client";

import { useState, useEffect, useCallback } from "react";
import type { ComercialesDashboardRow, ComercialDashboardDetail } from "@/lib/dashboard/comercial/queries";

export interface DashboardComercialesFilters {
  from?: string;
  to?: string;
  includeInactive?: boolean;
}

interface ComercialesResponse {
  ok: boolean;
  rows: ComercialesDashboardRow[];
  commissionRate: number;
  range: { from: string; to: string };
}

interface ComercialDetailResponse {
  ok: boolean;
  summary: ComercialesDashboardRow | null;
  weekly: ComercialDashboardDetail["weekly"];
  commissionRate: number;
  range: { from: string; to: string };
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
  const [data, setData] = useState<ComercialesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildSearchParams(filters);
      const res = await fetch(`/api/dashboard/comerciales${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: ComercialesResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.includeInactive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useDashboardComercialDetail(
  comercialId: string | null,
  filters: DashboardComercialesFilters = {},
) {
  const [data, setData] = useState<ComercialDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!comercialId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = buildSearchParams(filters);
      const res = await fetch(`/api/dashboard/comercial/${comercialId}${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: ComercialDetailResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [comercialId, filters.from, filters.to, filters.includeInactive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
