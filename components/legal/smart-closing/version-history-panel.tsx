"use client";

import { useCallback, useEffect, useState } from "react";
import { History, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VersionEvent {
  id: string;
  occurredAt: string;
  payload: {
    templateVersion?: string;
    summary?: string;
    operationId?: string;
    cloudinary?: { secureUrl?: string };
    contractInput?: unknown;
  };
}

interface DiffChange {
  path: string;
  kind: "added" | "removed" | "changed";
  oldValue?: unknown;
  newValue?: unknown;
}

export function VersionHistoryPanel({
  propertyCode,
}: {
  propertyCode: string;
}) {
  const [events, setEvents] = useState<VersionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<Record<number, DiffChange[]>>(
    {},
  );
  const [diffLoading, setDiffLoading] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/events?aggregateId=${encodeURIComponent(propertyCode)}&type=CONTRATO_VERSIONADO`,
        );
        if (res.ok) {
          const data = (await res.json()) as { events?: VersionEvent[] };
          setEvents(data.events ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [propertyCode]);

  const loadDiff = useCallback(
    async (idx: number) => {
      if (idx === 0 || diffResult[idx]) {
        setExpandedIdx(expandedIdx === idx ? null : idx);
        return;
      }

      const prev = events[idx - 1];
      const curr = events[idx];
      if (!prev?.payload?.contractInput || !curr?.payload?.contractInput) {
        setExpandedIdx(expandedIdx === idx ? null : idx);
        return;
      }

      setDiffLoading(idx);
      try {
        const res = await fetch("/api/contracts/diff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previousInput: prev.payload.contractInput,
            nextInput: curr.payload.contractInput,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { changes: DiffChange[] };
          setDiffResult((prev) => ({ ...prev, [idx]: data.changes }));
        }
      } catch {
        // silent
      } finally {
        setDiffLoading(null);
        setExpandedIdx(expandedIdx === idx ? null : idx);
      }
    },
    [events, diffResult, expandedIdx],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando historial...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Sin versiones anteriores.
      </p>
    );
  }

  return (
    <Card className="border-border/50 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" />
          Historial de versiones ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {events.map((ev, idx) => {
          const expanded = expandedIdx === idx;
          const changes = diffResult[idx];
          return (
            <div key={ev.id} className="border border-border/30 rounded-lg">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/20 transition-colors rounded-lg"
                onClick={() => loadDiff(idx)}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono shrink-0"
                >
                  {ev.payload.templateVersion ?? `v${idx + 1}`}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {ev.payload.summary ?? "Versión del contrato"}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {new Date(ev.occurredAt).toLocaleString("es-ES", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {diffLoading === idx && (
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                )}
              </button>

              {expanded && (
                <div className="px-3 pb-2 pt-0">
                  {idx === 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Versión inicial — sin diff previo.
                    </p>
                  )}
                  {changes && changes.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Sin cambios detectados.
                    </p>
                  )}
                  {changes && changes.length > 0 && (
                    <ul className="space-y-1">
                      {changes.map((ch, ci) => (
                        <li
                          key={ci}
                          className="text-[10px] font-mono flex items-start gap-1.5"
                        >
                          <span
                            className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                              ch.kind === "added"
                                ? "bg-green-500"
                                : ch.kind === "removed"
                                  ? "bg-red-500"
                                  : "bg-yellow-500"
                            }`}
                          />
                          <span className="text-muted-foreground">
                            {ch.path}
                          </span>
                          {ch.kind === "changed" && (
                            <span>
                              {String(ch.oldValue ?? "")} →{" "}
                              {String(ch.newValue ?? "")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
