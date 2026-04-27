"use client";

import useSWR from "swr";
import type {
  ConversationDetailResult,
  ConversationListResult,
} from "@/lib/conversations/types";

export interface ConversationFilters {
  q?: string;
  direction?: "all" | "inbound" | "outbound";
  agentOnly?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}

function buildListParams(filters: ConversationFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.direction && filters.direction !== "all") {
    params.set("direction", filters.direction);
  }
  if (filters.agentOnly) params.set("agent", "1");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useConversations(filters: ConversationFilters = {}) {
  const qs = buildListParams(filters);
  const { data, error, isLoading, mutate } = useSWR<
    ConversationListResult & { ok: boolean; error?: string }
  >(`/api/conversations${qs}`, { keepPreviousData: true });

  return {
    conversations: data?.conversations ?? [],
    nextCursor: data?.nextCursor ?? null,
    isLoading,
    error: data?.error ?? error?.message ?? null,
    refetch: () => {
      mutate();
    },
  };
}

export function useConversation(waId: string | null, direction: ConversationFilters["direction"] = "all") {
  const params = new URLSearchParams({ limit: "200" });
  if (direction && direction !== "all") params.set("direction", direction);
  const key = waId ? `/api/conversations/${waId}?${params.toString()}` : null;
  const { data, error, isLoading, mutate } = useSWR<
    ConversationDetailResult & { ok: boolean; error?: string }
  >(key);

  return {
    messages: data?.messages ?? [],
    context: data?.context ?? { demand: null, selections: [] },
    nextOffset: data?.nextOffset ?? null,
    isLoading,
    error: data?.error ?? error?.message ?? null,
    refetch: () => {
      mutate();
    },
  };
}

