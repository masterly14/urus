"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
    User,
    Users,
    Calendar,
    MapPin,
    ArrowRight,
    CheckCircle2,
    Clock,
    Circle,
    MessageSquare,
    Send,
    PanelRight,
    StickyNote,
    CheckSquare,
    Paperclip,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OperacionPostVenta, EtapaPostVenta } from "@/lib/postventa/pipeline-types";
import { OperationPanelDrawer } from "@/components/post-venta/operation-panel-drawer";

export interface OperationCardPanelSummary {
    notasVisibles: number;
    checklistTotal: number;
    checklistCompletados: number;
    adjuntos: number;
}

interface OperationCardProps {
    operation: OperacionPostVenta;
    className?: string;
    detailHref?: string;
    viewMode?: "mensajes" | "estado";
    panelSummary?: OperationCardPanelSummary;
    comerciales?: Array<{ id: string; nombre: string }>;
    onPanelSummaryChange?: (operacionId: string, summary: OperationCardPanelSummary) => void;
    /** Si true, oculta el botón de panel lateral (p.ej. en el detail view). */
    hidePanelButton?: boolean;
}

const etapaLabels: Record<EtapaPostVenta, string> = {
    1: "Cierre Inmediato",
    2: "Reputación",
    3: "Referidos",
    4: "Recaptación",
};

const etapaProgressLabels: Record<EtapaPostVenta, string> = {
    1: "Cierre inicial",
    2: "Reputación",
    3: "Referidos",
    4: "Recaptación",
};

const etapaColors: Record<EtapaPostVenta, string> = {
    1: "var(--urus-info)",
    2: "var(--urus-gold)",
    3: "var(--urus-warning)",
    4: "var(--urus-danger)",
};

const progressSteps = [1, 2, 3, 4] as const;

const tipoClienteConfig = {
    comprador: { label: "Comprador", color: "var(--urus-info)", emoji: "🏠" },
    inversor: { label: "Inversor", color: "var(--urus-gold)", emoji: "💰" },
    vendedor: { label: "Vendedor", color: "var(--urus-success)", emoji: "📤" },
};

const leadStatusLabel: Record<string, string> = {
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

function formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
    });
}

export function OperationCard({
    operation,
    className,
    detailHref,
    viewMode = "estado",
    panelSummary,
    comerciales,
    onPanelSummaryChange,
    hidePanelButton,
}: OperationCardProps) {
    const [panelOpen, setPanelOpen] = useState(false);
    const tipoConfig = tipoClienteConfig[operation.tipoCliente];
    const messageCount = operation.mensajes.length;
    const href = detailHref ?? `/platform/post-venta/operacion/${operation.id}`;
    const currentColor = etapaColors[operation.etapaActual];
    const progressPercent = ((operation.etapaActual - 1) / (progressSteps.length - 1)) * 100;
    const progressLineWidth = progressPercent === 0 ? "0%" : `calc(${progressPercent}% - 1rem)`;
    const latestMessage = operation.mensajes.length > 0
        ? [...operation.mensajes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0]
        : null;
    const messagePreview = [...operation.mensajes]
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
        .slice(-3);

    const hasChecklist = (panelSummary?.checklistTotal ?? 0) > 0;
    const hasNotas = (panelSummary?.notasVisibles ?? 0) > 0;
    const hasAdjuntos = (panelSummary?.adjuntos ?? 0) > 0;
    const checklistPendientes = panelSummary
        ? panelSummary.checklistTotal - panelSummary.checklistCompletados
        : 0;

    return (
        <div className="relative w-full">
            <Link href={href} className="block w-full">
            <Card
                className={cn(
                    "border-border/50 hover:bg-card hover:shadow-[var(--shadow-elevated)] transition-all duration-300 hover:-translate-y-0.5 cursor-pointer group overflow-hidden min-h-[230px]",
                    className
                )}
                style={{
                    borderLeftColor: currentColor,
                    borderLeftWidth: "3px",
                }}
            >
                <CardContent className="p-5 space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono uppercase">{operation.id}</span>
                                <span>•</span>
                                <span>{etapaLabels[operation.etapaActual]}</span>
                            </div>
                            <div className="flex items-start gap-1.5 mt-1.5">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <p className="text-sm sm:text-base font-semibold leading-tight truncate">{operation.direccion}</p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 flex items-start gap-2">
                            <div>
                                <p className="text-sm sm:text-base font-bold font-mono text-foreground">
                                    {operation.precio.toLocaleString("es-ES")} €
                                </p>
                                <p
                                    className="text-xs font-medium mt-1"
                                    style={{ color: currentColor }}
                                >
                                    {Math.round((operation.etapaActual / progressSteps.length) * 100)}%
                                </p>
                            </div>
                        </div>
                    </div>

                    {viewMode === "estado" ? (
                        <>
                            {/* Pipeline roadmap */}
                            <div className="space-y-3">
                                <div className="relative px-2">
                                    <div className="absolute left-2 right-2 top-2 h-0.5 rounded-full bg-accent/40" />
                                    <div
                                        className="absolute left-2 top-2 h-0.5 rounded-full transition-all duration-500"
                                        style={{
                                            width: progressLineWidth,
                                            backgroundColor: currentColor,
                                        }}
                                    />
                                    <div className="relative flex items-center justify-between">
                                        {progressSteps.map((step) => {
                                            const isCompleted = step < operation.etapaActual;
                                            const isCurrent = step === operation.etapaActual;
                                            const isPending = step > operation.etapaActual;

                                            return (
                                                <div key={step} className="flex flex-col items-center gap-1.5 w-14 sm:w-20">
                                                    <span
                                                        className={cn(
                                                            "h-4 w-4 rounded-full border-2 flex items-center justify-center bg-card transition-all",
                                                            isPending && "border-border/60 text-muted-foreground",
                                                            isCompleted && "border-transparent text-white",
                                                            isCurrent && "border-transparent text-white ring-2 ring-offset-1 ring-offset-card"
                                                        )}
                                                        style={{
                                                            backgroundColor: isCompleted || isCurrent ? etapaColors[step] : "var(--background)",
                                                            color: isCompleted || isCurrent ? "white" : "var(--muted-foreground)",
                                                            boxShadow: isCurrent
                                                                ? `0 0 0 2px color-mix(in oklch, ${etapaColors[step]} 35%, transparent)`
                                                                : undefined,
                                                        }}
                                                    >
                                                        {isCompleted ? (
                                                            <CheckCircle2 className="h-3 w-3" />
                                                        ) : (
                                                            <Circle className={cn("h-2.5 w-2.5", isCurrent && "fill-current")} />
                                                        )}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "text-[10px] text-center leading-tight",
                                                            isCurrent ? "font-semibold" : "text-muted-foreground"
                                                        )}
                                                        style={{ color: isCurrent ? etapaColors[step] : undefined }}
                                                    >
                                                        {etapaProgressLabels[step]}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2.5 flex-wrap text-[10px]">
                                <Badge variant="outline" className="font-medium">
                                    Estado operación: {operation.operacionEstado ?? "N/A"}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className="font-medium"
                                    style={{
                                        borderColor: "color-mix(in oklch, var(--urus-info) 35%, transparent)",
                                        color: "var(--urus-info)",
                                        backgroundColor: "color-mix(in oklch, var(--urus-info) 8%, transparent)",
                                    }}
                                >
                                    Estado demanda: {leadStatusLabel[operation.demandLeadStatus ?? ""] ?? "N/A"}
                                </Badge>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3 rounded-lg border border-border/40 bg-accent/15 p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-medium">
                                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                    Historial de mensajes
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                    {messageCount}
                                </Badge>
                            </div>

                            {latestMessage ? (
                                <p className="text-xs text-muted-foreground">
                                    Último: {new Date(latestMessage.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {latestMessage.tipo === "enviado" ? "Enviado" : "Respuesta"}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">Aún sin mensajes para esta operación.</p>
                            )}

                            {messagePreview.length > 0 && (
                                <div className="space-y-2">
                                    {messagePreview.map((message) => (
                                        <div key={message.id} className="flex items-start gap-2 text-xs">
                                            <span
                                                className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full"
                                                style={{
                                                    backgroundColor: `color-mix(in oklch, ${etapaColors[message.etapa]} 15%, transparent)`,
                                                    color: etapaColors[message.etapa],
                                                }}
                                            >
                                                <Send className="h-2.5 w-2.5" />
                                            </span>
                                            <span className="text-muted-foreground line-clamp-1">{message.contenido}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-3 border-t border-border/30">
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-1 truncate">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate">{operation.comprador}</span>
                            </div>
                            <div className="flex items-center gap-1 truncate">
                                <Users className="h-3 w-3 shrink-0" />
                                <span className="truncate">{operation.vendedor}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(operation.fechaCierre)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                                variant="outline"
                                className="text-[10px] px-2 py-0.5 gap-1"
                                style={{
                                    borderColor: `color-mix(in oklch, ${tipoConfig.color} 40%, transparent)`,
                                    color: tipoConfig.color,
                                    backgroundColor: `color-mix(in oklch, ${tipoConfig.color} 8%, transparent)`,
                                }}
                            >
                                {tipoConfig.emoji} {tipoConfig.label}
                            </Badge>
                            {operation.checklistCompleto ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-[var(--urus-success)]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Completo
                                </span>
                            ) : (
                                <span className="flex items-center gap-0.5 text-[10px] text-[var(--urus-warning)]">
                                    <Clock className="h-3 w-3" />
                                    Pendiente
                                </span>
                            )}
                            {messageCount > 0 && (
                                <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-[20px] justify-center">
                                    {messageCount}
                                </Badge>
                            )}

                            {/* Indicadores del panel lateral (notas, checklist, adjuntos) */}
                            {(hasNotas || hasChecklist || hasAdjuntos) && (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-accent/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {hasNotas && (
                                        <span className="inline-flex items-center gap-0.5" title="Notas internas visibles">
                                            <StickyNote className="h-3 w-3" />
                                            {panelSummary?.notasVisibles}
                                        </span>
                                    )}
                                    {hasChecklist && (
                                        <span
                                            className="inline-flex items-center gap-0.5"
                                            title={`Checklist: ${panelSummary?.checklistCompletados}/${panelSummary?.checklistTotal}`}
                                            style={{
                                                color: checklistPendientes === 0
                                                    ? "var(--urus-success)"
                                                    : "var(--urus-warning)",
                                            }}
                                        >
                                            <CheckSquare className="h-3 w-3" />
                                            {panelSummary?.checklistCompletados}/{panelSummary?.checklistTotal}
                                        </span>
                                    )}
                                    {hasAdjuntos && (
                                        <span className="inline-flex items-center gap-0.5" title="Adjuntos">
                                            <Paperclip className="h-3 w-3" />
                                            {panelSummary?.adjuntos}
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Arrow indicator on hover */}
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity -mt-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
            </Link>

            {/* Botón flotante para abrir el panel lateral sin navegar al detalle */}
            {!hidePanelButton && (
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="absolute top-3 right-3 z-10 bg-card shadow-sm"
                    title="Abrir panel (notas, checklist, adjuntos)"
                    aria-label="Abrir panel lateral de la operación"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPanelOpen(true);
                    }}
                >
                    <PanelRight className="h-3.5 w-3.5" />
                </Button>
            )}

            {!hidePanelButton && (
                <OperationPanelDrawer
                    open={panelOpen}
                    onOpenChange={setPanelOpen}
                    operacionId={operation.id}
                    operacionCodigo={operation.id}
                    operacionTitulo={operation.direccion}
                    comerciales={comerciales}
                    onSummaryChange={(s) => onPanelSummaryChange?.(operation.id, s)}
                />
            )}
        </div>
    );
}

export { etapaLabels, tipoClienteConfig };
