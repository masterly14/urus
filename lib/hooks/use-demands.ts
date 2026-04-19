"use client";

import { useState, useEffect, useCallback } from "react";
import type { LeadStatus } from "@/app/generated/prisma/client";

export interface DemandRow {
  codigo: string;
  nombre: string;
  telefono: string;
  zonas: string;
  tipos: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  agente: string;
  comercialId: string | null;
  leadStatus: LeadStatus;
  fechaActualizacion: string;
  updatedAt: string;
  lastEventAt: string;
}

export type LeadStatusStats = Record<LeadStatus, number>;

export interface DemandsFilters {
  leadStatus?: LeadStatus[];
  q?: string;
  comercialId?: string;
  page?: number;
  limit?: number;
}

interface DemandsResponse {
  ok: boolean;
  demands: DemandRow[];
  total: number;
  page: number;
  limit: number;
  stats: LeadStatusStats;
}

function buildSearchParams(filters: DemandsFilters): string {
  const params = new URLSearchParams();
  if (filters.leadStatus?.length) params.set("leadStatus", filters.leadStatus.join(","));
  if (filters.q) params.set("q", filters.q);
  if (filters.comercialId) params.set("comercialId", filters.comercialId);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const EMPTY_STATS: LeadStatusStats = {
  NUEVO: 0,
  CONTACTADO: 0,
  EN_SELECCION: 0,
  VISITA_PENDIENTE: 0,
  VISITA_CONFIRMADA: 0,
  VISITA_REALIZADA: 0,
  EN_NEGOCIACION: 0,
  EN_FIRMA: 0,
  CERRADO: 0,
  PERDIDO: 0,
};

export function useDemands(filters: DemandsFilters = {}) {
  const [demands, setDemands] = useState<DemandRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<LeadStatusStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDemands = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildSearchParams(filters);
      const res = await fetch(`/api/demands${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data: DemandsResponse = await res.json();
      setDemands(data.demands ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? EMPTY_STATS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchDemands();
  }, [fetchDemands]);

  return { demands, total, stats, isLoading, error, refetch: fetchDemands };
}
