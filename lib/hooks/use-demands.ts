"use client";

import useSWR from "swr";
import type { LeadStatus } from "@prisma/client";

export interface DemandRow {
  codigo: string;
  nombre: string;
  telefono: string;
  zonas: string;
  tipos: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  metrosMin: number | null;
  metrosMax: number | null;
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
  const qs = buildSearchParams(filters);
  const { data, error, isLoading, mutate } = useSWR<DemandsResponse>(
    `/api/demands${qs}`,
    { keepPreviousData: true },
  );

  return {
    demands: data?.demands ?? [],
    total: data?.total ?? 0,
    stats: data?.stats ?? EMPTY_STATS,
    isLoading,
    error: error?.message ?? null,
    refetch: () => { mutate(); },
  };
}
