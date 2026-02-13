"use client";

import { useState, useMemo } from "react";
import {
    PackageCheck,
    Filter,
    LayoutGrid,
    List,
    TrendingUp,
    Clock,
    CheckCircle2,
    Users,
    ArrowUpRight,
    Briefcase,
    MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    PipelineKanban,
    KanbanColumn,
} from "@/components/post-venta/pipeline-kanban";
import { OperationCard, etapaLabels, tipoClienteConfig } from "@/components/post-venta/operation-card";
import { StepperProgress, PIPELINE_STEPS } from "@/components/post-venta/stepper-progress";
import { operaciones } from "@/lib/mock-data/operaciones";
import { comerciales } from "@/lib/mock-data/comerciales";
import type { EtapaPostVenta, TipoCliente } from "@/lib/mock-data/types";

// ── Pipeline stages definition ────────────────────────────────

const pipelineStages: { id: EtapaPostVenta; label: string; description: string; emoji: string }[] = [
    { id: 1, label: "Cierre Inmediato", description: "Agradecimiento + Email resumen + Checklist", emoji: "🤝" },
    { id: 2, label: "Soporte Temprano", description: "Validación + Mini guía", emoji: "📋" },
    { id: 3, label: "Reputación", description: "Petición de reseña + Recordatorio", emoji: "⭐" },
    { id: 4, label: "Referidos", description: "Invitación + Enlace directo", emoji: "🔗" },
    { id: 5, label: "Recaptación", description: "Segmentación (Comprador/Inversor/Vendedor)", emoji: "🔄" },
];

export default function PipelinePage() {
    const [filterComercial, setFilterComercial] = useState<string>("all");
    const [filterTipo, setFilterTipo] = useState<string>("all");

    // Filter operations
    const filteredOps = useMemo(() => {
        return operaciones.filter((op) => {
            if (filterComercial !== "all" && op.comercial !== filterComercial) return false;
            if (filterTipo !== "all" && op.tipoCliente !== filterTipo) return false;
            return true;
        });
    }, [filterComercial, filterTipo]);

    // Group by stage
    const opsByStage = useMemo(() => {
        const grouped: Record<number, typeof filteredOps> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        filteredOps.forEach((op) => {
            grouped[op.etapaActual].push(op);
        });
        return grouped;
    }, [filteredOps]);

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
                            Seguimiento automatizado de operaciones cerradas por 5 etapas
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
                                {comerciales.map((c) => (
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
                </CardContent>
            </Card>

            {/* Kanban Board */}
            <PipelineKanban>
                {pipelineStages.map((stage) => (
                    <KanbanColumn
                        key={stage.id}
                        etapa={stage.id}
                        label={stage.label}
                        description={stage.description}
                        emoji={stage.emoji}
                        count={opsByStage[stage.id].length}
                    >
                        {opsByStage[stage.id].length === 0 ? (
                            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground/50 border border-dashed border-border/30 rounded-xl">
                                Sin operaciones
                            </div>
                        ) : (
                            opsByStage[stage.id].map((op) => (
                                <OperationCard key={op.id} operation={op} />
                            ))
                        )}
                    </KanbanColumn>
                ))}
            </PipelineKanban>
        </div>
    );
}
