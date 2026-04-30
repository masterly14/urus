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
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { MATCHING_PAUSED, MATCHING_PAUSED_REASON } from "@/lib/matching/pause";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

type RematchPanelProps = {
  /** Etiqueta del botón que abre el diálogo (p. ej. estado vacío vs cabecera). */
  triggerLabel?: string;
  className?: string;
};

export function RematchPanel({
  triggerLabel = "Forzar cruces",
  className,
}: RematchPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
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
  const [cancelling, setCancelling] = useState(false);

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
    if (MATCHING_PAUSED) {
      setLaunchError(MATCHING_PAUSED_REASON);
      return;
    }
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

  const handleCancelRun = async () => {
    if (!activeRunId) return;
    setCancelling(true);
    setLaunchError(null);
    try {
      const res = await fetch(`/api/matching/rematch/${activeRunId}/cancel`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setLaunchError(data.error ?? `Error ${res.status}`);
        return;
      }
      await pollRun(activeRunId);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setCancelling(false);
    }
  };

  const canLaunch = !MATCHING_PAUSED && (mode === "all" || selectedDemand != null);
  /** Bloquea un nuevo lanzamiento mientras hay un run activo en curso o aún no llegó el primer GET. */
  const launchBlocked =
    activeRunId != null &&
    (runStatus === null || runStatus.status === "RUNNING");

  const progress =
    runStatus && runStatus.totalDemands > 0
      ? Math.round((runStatus.demandsProcessed / runStatus.totalDemands) * 100)
      : 0;

  const etaLabel = formatEta(runStatus?.estimatedEtaMs ?? null);

  return (
    <>
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            disabled={MATCHING_PAUSED}
            className={cn(
              "gap-1.5 border border-secondary/25 shadow-sm",
              className,
            )}
          >
            {MATCHING_PAUSED ? (
              <Ban className="h-3.5 w-3.5 text-muted-foreground" />
            ) : launchBlocked ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary-foreground" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-secondary-foreground" />
            )}
            {triggerLabel}
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-secondary" />
              Forzar rematch por demanda
            </DialogTitle>
            <DialogDescription>
              Configura y ejecuta rematch manual para una demanda puntual o todas
              las activas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {MATCHING_PAUSED && (
              <div className="text-xs text-[var(--urus-warning)] flex items-start gap-2 rounded-md border border-[var(--urus-warning)]/30 bg-[var(--urus-warning)]/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{MATCHING_PAUSED_REASON}</span>
              </div>
            )}
            {launchBlocked && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
                <Loader2 className="h-3 w-3 animate-spin text-secondary" />
                Hay un rematch en curso (o reanudando estado).
              </div>
            )}

        {/* Mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode("all");
                  setSelectedDemand(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  mode === "all"
                    ? "bg-background border-secondary/40 text-foreground"
                    : "bg-transparent border-border/40 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                }`}
              >
                Todas las demandas
              </button>
              <button
                onClick={() => setMode("single")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  mode === "single"
                    ? "bg-background border-secondary/40 text-foreground"
                    : "bg-transparent border-border/40 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
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
                {runStatus.demandsProcessed === 0 && (
                  <p className="text-[10px] text-[var(--urus-warning)]/90 leading-snug pt-1 border-t border-border/20 mt-1">
                    Si no avanza, el consumer de jobs no está procesando la cola. En local ejecuta{" "}
                    <code className="font-mono text-[10px]">npm run consumer</code>. También puedes
                    cancelar abajo y volver a intentar cuando el worker esté activo.
                  </p>
                )}
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cancelling}
                    onClick={() => void handleCancelRun()}
                    className="gap-1.5 text-xs border-[var(--urus-danger)]/40 text-[var(--urus-danger)] hover:bg-[var(--urus-danger)]/10"
                  >
                    {cancelling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Ban className="h-3.5 w-3.5" />
                    )}
                    Cancelar ejecución
                  </Button>
                </div>
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

            {!launchBlocked && (
              <div className="flex justify-end">
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
                  className="gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                >
                  {launching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {mode === "all" ? "Ejecutar sobre todas" : "Ejecutar rematch"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                Esto procesará <strong>hasta 10 demandas activas</strong>{" "}
                contra las propiedades elegibles (estado Libre, datos
                completos), priorizando por código ascendente.
              </p>
              <p>
                Cada match nuevo disparará{" "}
                <strong>notificaciones WhatsApp al comercial</strong> y al
                comprador (flujo completo). Los matches con score sin cambio
                significativo (Δ &lt; 5) se saltan automáticamente.
              </p>
              <p className="text-[var(--urus-gold)] font-medium">
                Límite actual: 10 demandas por ejecución, en lote único.
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
    </>
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
