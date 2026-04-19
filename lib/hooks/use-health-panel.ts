"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useHealthPanel() {
  const { sessionHeaders } = useSession();
  const headers = useMemo(() => sessionHeaders, [sessionHeaders]);
  const headersKey = JSON.stringify(headers);

  const [data, setData] = useState<HealthPanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/configuracion/health", {
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const json = (await response.json()) as HealthPanelResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, headersKey]);

  return { data, loading, error, refetch: fetchData };
}
