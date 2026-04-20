"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Timer,
  Zap,
  SkipForward,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const POLL_INTERVAL_MS = 5_000;

interface DemandOption {
  codigo: string;
  ref: string;
  nombre: string;
}

interface RematchRunStatus {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  totalDemands: number;
  totalBatches: number;
  currentBatch: number;
  demandsProcessed: number;
  matchesEmitted: number;
  matchesSkipped: number;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  estimatedEtaMs: number | null;
}

export function RematchPanel() {
  const [mode, setMode] = useState<"single" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [demands, setDemands] = useState<DemandOption[]>([]);
  const [loadingDemands, setLoadingDemands] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<DemandOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RematchRunStatus | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "single" || searchQuery.length < 2) {
      setDemands([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingDemands(true);
      try {
        const res = await fetch(
          `/api/matching/rematch/demands?q=${encodeURIComponent(searchQuery)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setDemands(data.demands ?? []);
          setShowDropdown(true);
        }
      } catch {
        // silent
      } finally {
        setLoadingDemands(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pollRun = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/matching/rematch/${runId}`);
      if (res.ok) {
        const data: RematchRunStatus = await res.json();
        setRunStatus(data);
        if (data.status !== "RUNNING") {
          setActiveRunId(null);
        }
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    pollRun(activeRunId);
    const interval = setInterval(() => pollRun(activeRunId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeRunId, pollRun]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/matching/rematch/active");
        if (res.ok) {
          const data = await res.json();
          if (data.runId) {
            setActiveRunId(data.runId);
          }
        }
      } catch {
        // silent
      }
    })();
  }, []);

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const body =
        mode === "all"
          ? { demandIds: "all" }
          : { demandIds: selectedDemand ? [selectedDemand.codigo] : [] };

      const res = await fetch("/api/matching/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setLaunchError(data.error ?? `Error ${res.status}`);
        if (data.runId) {
          setActiveRunId(data.runId);
        }
        return;
      }

      setActiveRunId(data.runId);
      setRunStatus(null);
      setConfirmOpen(false);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLaunching(false);
    }
  };

  const canLaunch = mode === "all" || selectedDemand != null;
  const isRunning = activeRunId != null;

  const progress =
    runStatus && runStatus.totalDemands > 0
      ? Math.round((runStatus.demandsProcessed / runStatus.totalDemands) * 100)
      : 0;

  const etaLabel = formatEta(runStatus?.estimatedEtaMs ?? null);

  return (
    <Card className="border-secondary/30 bg-secondary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-secondary" />
          Forzar Matching por Demanda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Mode selector */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMode("all");
              setSelectedDemand(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              mode === "all"
                ? "bg-secondary/15 border-secondary/40 text-secondary"
                : "bg-accent/30 border-border/30 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            Todas las demandas
          </button>
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              mode === "single"
                ? "bg-secondary/15 border-secondary/40 text-secondary"
                : "bg-accent/30 border-border/30 text-muted-foreground hover:bg-accent/50"
            }`}
          >
            Demanda específica
          </button>
        </div>

        {/* Demand search (single mode) */}
        {mode === "single" && (
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar demanda por nombre o referencia..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedDemand(null);
                }}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border/50 bg-background/80 focus:outline-none focus:ring-1 focus:ring-secondary/50"
              />
              {loadingDemands && (
                <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {showDropdown && demands.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-card shadow-lg">
                {demands.map((d) => (
                  <button
                    key={d.codigo}
                    onClick={() => {
                      setSelectedDemand(d);
                      setSearchQuery(`${d.nombre} (${d.ref})`);
                      setShowDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-accent/40 transition-colors flex justify-between items-center"
                  >
                    <span className="font-medium truncate">{d.nombre}</span>
                    <span className="text-muted-foreground ml-2 shrink-0">
                      {d.ref}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedDemand && (
              <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/10 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-secondary shrink-0" />
                <span className="truncate">
                  {selectedDemand.nombre} ({selectedDemand.ref})
                </span>
              </div>
            )}
          </div>
        )}

        {/* Active run progress */}
        {runStatus && runStatus.status === "RUNNING" && (
          <div className="space-y-2 p-3 rounded-lg bg-background/60 border border-border/30">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-secondary font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />
                Procesando...
              </span>
              <span className="text-muted-foreground font-mono">
                Lote {runStatus.currentBatch + 1}/{runStatus.totalBatches}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {runStatus.demandsProcessed}/{runStatus.totalDemands} demandas
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                {runStatus.matchesEmitted} matches
                {runStatus.matchesSkipped > 0 && (
                  <>
                    {" · "}
                    <SkipForward className="h-2.5 w-2.5" />
                    {runStatus.matchesSkipped} sin cambio
                  </>
                )}
              </span>
            </div>
            {etaLabel && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Timer className="h-2.5 w-2.5" />
                ETA: {etaLabel}
              </div>
            )}
          </div>
        )}

        {/* Completed run summary */}
        {runStatus && runStatus.status === "COMPLETED" && (
          <div className="p-3 rounded-lg bg-[var(--urus-success)]/5 border border-[var(--urus-success)]/20">
            <div className="flex items-center gap-2 text-xs text-[var(--urus-success)] font-medium mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Rematch completado
            </div>
            <p className="text-[10px] text-muted-foreground">
              {runStatus.demandsProcessed} demandas procesadas ·{" "}
              {runStatus.matchesEmitted} matches generados ·{" "}
              {runStatus.matchesSkipped} sin cambio
            </p>
          </div>
        )}

        {/* Failed run */}
        {runStatus && runStatus.status === "FAILED" && (
          <div className="p-3 rounded-lg bg-[var(--urus-danger)]/5 border border-[var(--urus-danger)]/20">
            <div className="flex items-center gap-2 text-xs text-[var(--urus-danger)] font-medium mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Error en rematch
            </div>
            <p className="text-[10px] text-muted-foreground">
              {runStatus.errorMessage ?? "Error desconocido"}
            </p>
          </div>
        )}

        {/* Launch error */}
        {launchError && (
          <div className="text-xs text-[var(--urus-danger)] flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {launchError}
          </div>
        )}

        {/* Launch button */}
        {!isRunning && (
          <Button
            onClick={() => {
              if (mode === "all") {
                setConfirmOpen(true);
              } else {
                handleLaunch();
              }
            }}
            disabled={!canLaunch || launching}
            size="sm"
            className="w-full gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
          >
            {launching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {mode === "all" ? "Forzar matching — Todas" : "Forzar matching"}
          </Button>
        )}

        {/* Confirmation dialog for "all" */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[var(--urus-gold)]" />
                Confirmar rematch masivo
              </DialogTitle>
              <DialogDescription className="space-y-2 pt-2">
                <p>
                  Esto procesará <strong>todas las demandas activas</strong>{" "}
                  contra las propiedades elegibles (estado Libre, datos
                  completos).
                </p>
                <p>
                  Cada match nuevo disparará{" "}
                  <strong>notificaciones WhatsApp al comercial</strong> y al
                  comprador (flujo completo). Los matches con score sin cambio
                  significativo (Δ &lt; 5) se saltan automáticamente.
                </p>
                <p className="text-[var(--urus-gold)] font-medium">
                  Se procesará en lotes de 10 con 30s de pausa entre cada uno.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={launching}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleLaunch}
                disabled={launching}
                className="gap-2 bg-secondary hover:bg-secondary/90"
              >
                {launching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Ejecutar rematch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function formatEta(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `~${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `~${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
