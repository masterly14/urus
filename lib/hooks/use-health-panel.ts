"use client";

import useSWR from "swr";
import { useSession } from "@/lib/hooks/use-session";

export interface HealthWorkerInfo {
  id: string;
  label: string;
  lastSuccessAt: string | null;
  status: "ok" | "degraded" | "never_run";
  lastSuccessSource:
    | "ingestion_cycle_metrics"
    | "snapshot"
    | "job_queue"
    | "execution_metrics";
  ageMinutes: number | null;
}

export interface HealthJobQueueCounts {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  deadLetter: number;
}

export interface HealthPendingJobInfo {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  availableAt: string | null;
  createdAt: string;
  sourceEventId: string | null;
  lastError: string | null;
  ageMinutes: number;
}

export interface HealthPendingJobsByType {
  type: string;
  count: number;
}

export interface HealthRecentError {
  id: string;
  type: string;
  lastError: string | null;
  failedAt: string | null;
}

export interface HealthPanelResponse {
  ok: boolean;
  status: "ok" | "degraded" | "error";
  db: "ok" | "error";
  timestamp: string;
  workers: HealthWorkerInfo[];
  jobQueue: HealthJobQueueCounts;
  pendingJobs: HealthPendingJobInfo[];
  pendingByType: HealthPendingJobsByType[];
  recentErrors: HealthRecentError[];
}

const healthFetcher = async ([url, headers]: [string, Record<string, string>]) => {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<HealthPanelResponse>;
};

export function useHealthPanel() {
  const { sessionHeaders } = useSession();

  const { data, error, isLoading, mutate } = useSWR<HealthPanelResponse>(
    sessionHeaders ? ["/api/configuracion/health", sessionHeaders] : null,
    healthFetcher,
    { revalidateOnFocus: true, dedupingInterval: 2000 },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => { mutate(); },
  };
}
