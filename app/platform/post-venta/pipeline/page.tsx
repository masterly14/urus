"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    PackageCheck,
    Filter,
    TrendingUp,
    CheckCircle2,
    Briefcase,
    MessageSquare,
    GitBranch,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OperationCard, tipoClienteConfig, type OperationCardPanelSummary } from "@/components/post-venta/operation-card";
import { operaciones } from "@/lib/mock-data/operaciones";
import { comerciales } from "@/lib/mock-data/comerciales";
import type { PanelSummary } from "@/lib/postventa/panel/types";
import type {
    LeadStatusPipeline,
    OperacionPostVenta,
    PipelineComercialFilter,
    TipoCliente,
} from "@/lib/postventa/pipeline-types";
import {
    DEMAND_STATUS_NA,
    PIPELINE_LEAD_STATUS_VALUES,
    PIPELINE_OPERACION_ESTADO_VALUES,
    operacionEstadoFilterLabels,
} from "@/lib/postventa/pipeline-filter-options";

const leadStatusFilterLabels: Record<LeadStatusPipeline, string> = {
    NUEVO: "Nuevo",
    CONTACTADO: "Contactado",
    EN_SELECCION: "En selección",
    VISITA_PENDIENTE: "Visita pendiente",
    VISITA_CONFIRMADA: "Visita confirmada",
    VISITA_REALIZADA: "Visita realizada",
    EN_NEGOCIACION: "En negociación",
    EN_FIRMA: "En firma",
    CERRADO: "Cerrado",
    PERDIDO: "Perdido",
};

function PipelineContent() {
    const searchParams = useSearchParams();
    // Modo visual demo para revisión de UI sin backend real.
    const mockMode = searchParams.get("mock") === "1";
    const [filterComercial, setFilterComercial] = useState<string>("all");
    const [filterTipo, setFilterTipo] = useState<string>("all");
    const [filterDemandStatus, setFilterDemandStatus] = useState<string>("all");
    const [filterOperationStatus, setFilterOperationStatus] = useState<string>("all");
    const [viewMode, setViewMode] = useState<"mensajes" | "estado">("estado");
    const [operations, setOperations] = useState<OperacionPostVenta[]>(mockMode ? operaciones : []);
    const [commercialFilters, setCommercialFilters] = useState<PipelineComercialFilter[]>(
        mockMode
            ? [
                  { id: "system", nombre: "Sin comercial asignado" },
                  ...comerciales.map((c) => ({ id: c.id, nombre: c.nombre })),
              ]
            : []
    );
    const [loading, setLoading] = useState<boolean>(!mockMode);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [panelSummaries, setPanelSummaries] = useState<Record<string, OperationCardPanelSummary>>({});

    useEffect(() => {
        if (mockMode) {
            setOperations(operaciones);
            setCommercialFilters([
                { id: "system", nombre: "Sin comercial asignado" },
                ...comerciales.map((c) => ({ id: c.id, nombre: c.nombre })),
            ]);
            setLoading(false);
            setLoadError(null);
            return;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const response = await fetch("/api/postventa/pipeline", {
                    method: "GET",
                    credentials: "same-origin",
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    const message = typeof body?.error === "string" ? body.error : "No se pudo cargar el pipeline";
                    throw new Error(message);
                }
                const body = await response.json() as {
                    operaciones: OperacionPostVenta[];
                    comerciales: PipelineComercialFilter[];
                };
                if (!cancelled) {
                    setOperations(body.operaciones ?? []);
                    setCommercialFilters(body.comerciales ?? []);
                }
            } catch (error) {
                if (!cancelled) {
                    const message =
                        error instanceof Error ? error.message : "Error inesperado al cargar pipeline";
                    setLoadError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [mockMode]);

    // Carga de summaries del panel lateral (notas/checklist/adjuntos) para badges.
    useEffect(() => {
        if (mockMode || operations.length === 0) return;

        let cancelled = false;
        const ids = operations.map((op) => op.id);
        const idsParam = ids.join(",");

        const load = async () => {
            try {
                const response = await fetch(
                    `/api/postventa/operaciones/panel-summary?ids=${encodeURIComponent(idsParam)}`,
                    { credentials: "same-origin" },
                );
                if (!response.ok) return;
                const body = (await response.json()) as { summaries: PanelSummary[] };
                if (cancelled) return;
                const map: Record<string, OperationCardPanelSummary> = {};
                for (const s of body.summaries) {
                    map[s.operacionId] = {
                        notasVisibles: s.notasVisibles,
                        checklistTotal: s.checklistTotal,
                        checklistCompletados: s.checklistCompletados,
                        adjuntos: s.adjuntos,
                    };
                }
                setPanelSummaries(map);
            } catch {
                // ignorar — los badges son opcionales
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [mockMode, operations]);

    // Filter operations
    const filteredOps = useMemo(() => {
        return operations.filter((op) => {
            if (filterComercial !== "all" && op.comercial !== filterComercial) return false;
            if (filterTipo !== "all" && op.tipoCliente !== filterTipo) return false;
            if (filterDemandStatus !== "all" && (op.demandLeadStatus ?? "N/A") !== filterDemandStatus) return false;
            if (filterOperationStatus !== "all" && (op.operacionEstado ?? "N/A") !== filterOperationStatus) return false;
            return true;
        });
    }, [operations, filterComercial, filterTipo, filterDemandStatus, filterOperationStatus]);

    // KPIs
    const totalOps = filteredOps.length;
    const completedChecklist = filteredOps.filter((op) => op.checklistCompleto).length;
    const totalMessages = filteredOps.reduce((s, op) => s + op.mensajes.length, 0);
    const avgEtapa = filteredOps.length > 0
        ? (filteredOps.reduce((s, op) => s + op.etapaActual, 0) / filteredOps.length).toFixed(1)
        : "0";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                        <PackageCheck className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Pipeline Post-Venta</h1>
                        <p className="text-sm text-muted-foreground">
                            Seguimiento automatizado de operaciones cerradas por 4 etapas
                        </p>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-secondary/15 p-2">
                                <Briefcase className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Operaciones</p>
                                <p className="text-xl font-bold font-mono">{totalOps}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2">
                                <CheckCircle2 className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Checklist OK</p>
                                <p className="text-xl font-bold font-mono">
                                    {completedChecklist}<span className="text-sm text-muted-foreground font-normal">/{totalOps}</span>
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-info)]/15 p-2">
                                <MessageSquare className="h-4 w-4 text-[var(--urus-info)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mensajes</p>
                                <p className="text-xl font-bold font-mono">{totalMessages}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-warning)]/15 p-2">
                                <TrendingUp className="h-4 w-4 text-[var(--urus-warning)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Etapa Media</p>
                                <p className="text-xl font-bold font-mono">{avgEtapa}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
                        </div>

                        {/* Comercial filter */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Comercial:</span>
                            <select
                                value={filterComercial}
                                onChange={(e) => setFilterComercial(e.target.value)}
                                className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                            >
                                <option value="all">Todos</option>
                                {commercialFilters.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Type filter */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Tipo:</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setFilterTipo("all")}
                                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${filterTipo === "all"
                                            ? "bg-card border-secondary/30 text-foreground font-medium"
                                            : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                        }`}
                                >
                                    Todos
                                </button>
                                {(Object.entries(tipoClienteConfig) as [TipoCliente, typeof tipoClienteConfig.comprador][]).map(
                                    ([key, cfg]) => (
                                        <button
                                            key={key}
                                            onClick={() => setFilterTipo(key)}
                                            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${filterTipo === key
                                                    ? "bg-card border-secondary/30 text-foreground font-medium"
                                                    : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                                }`}
                                        >
                                            {cfg.emoji} {cfg.label}
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Results count */}
                        <Badge variant="outline" className="text-[10px] ml-auto">
                            {filteredOps.length} operaciones
                        </Badge>
                    </div>

                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Estado demanda:</span>
                            <select
                                value={filterDemandStatus}
                                onChange={(e) => setFilterDemandStatus(e.target.value)}
                                className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                            >
                                <option value="all">Todos</option>
                                {PIPELINE_LEAD_STATUS_VALUES.map((status) => (
                                    <option key={status} value={status}>
                                        {leadStatusFilterLabels[status as LeadStatusPipeline]}
                                    </option>
                                ))}
                                <option value={DEMAND_STATUS_NA}>Sin demanda / N/A</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Estado operación:</span>
                            <select
                                value={filterOperationStatus}
                                onChange={(e) => setFilterOperationStatus(e.target.value)}
                                className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                            >
                                <option value="all">Todos</option>
                                {PIPELINE_OPERACION_ESTADO_VALUES.map((status) => (
                                    <option key={status} value={status}>
                                        {operacionEstadoFilterLabels[status]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Vista del pipeline:</span>
                        <button
                            onClick={() => setViewMode("mensajes")}
                            className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                                viewMode === "mensajes"
                                    ? "bg-card border-secondary/30 text-foreground font-medium"
                                    : "border-border/30 text-muted-foreground hover:bg-accent/30"
                            }`}
                        >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Mensajes
                        </button>
                        <button
                            onClick={() => setViewMode("estado")}
                            className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                                viewMode === "estado"
                                    ? "bg-card border-secondary/30 text-foreground font-medium"
                                    : "border-border/30 text-muted-foreground hover:bg-accent/30"
                            }`}
                        >
                            <GitBranch className="h-3.5 w-3.5" />
                            Estado demanda + operación
                        </button>
                    </div>
                </CardContent>
            </Card>

            {loadError && (
                <Card className="border-[var(--urus-danger)]/30 bg-[var(--urus-danger)]/5">
                    <CardContent className="p-4 text-sm text-[var(--urus-danger)]">
                        {loadError}
                    </CardContent>
                </Card>
            )}

            {loading ? (
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6 text-sm text-muted-foreground">
                        Cargando pipeline post-venta...
                    </CardContent>
                </Card>
            ) : (
            <div className="flex flex-col gap-8">
                {filteredOps.length === 0 ? (
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6 text-sm text-muted-foreground">
                            No hay operaciones para los filtros actuales.
                        </CardContent>
                    </Card>
                ) : (
                    filteredOps.map((op) => (
                        <OperationCard
                            key={op.id}
                            operation={op}
                            viewMode={viewMode}
                            detailHref={
                                mockMode
                                    ? `/platform/post-venta/operacion/${op.id}?mock=1`
                                    : undefined
                            }
                            panelSummary={panelSummaries[op.id]}
                            comerciales={commercialFilters
                                .filter((c) => c.id !== "system")
                                .map((c) => ({ id: c.id, nombre: c.nombre }))}
                            hidePanelButton={mockMode}
                            onPanelSummaryChange={(operacionId, summary) =>
                                setPanelSummaries((prev) => ({ ...prev, [operacionId]: summary }))
                            }
                        />
                    ))
                )}
            </div>
            )}
        </div>
    );
}

export default function PipelinePage() {
    return (
        <Suspense fallback={null}>
            <PipelineContent />
        </Suspense>
    );
}
