"use client";

import { cn } from "@/lib/utils";
import {
    Send,
    MessageSquare,
    ArrowDownLeft,
    CheckCircle2,
    Star,
    Link2,
    RefreshCcw,
    Package,
} from "lucide-react";
import type { MensajePostVenta, EtapaPostVenta } from "@/lib/mock-data/types";

interface PipelineKanbanProps {
    children: React.ReactNode;
    className?: string;
}

interface KanbanColumnProps {
    etapa: EtapaPostVenta;
    label: string;
    description: string;
    emoji: string;
    count: number;
    children: React.ReactNode;
}

const etapaColors: Record<EtapaPostVenta, string> = {
    1: "var(--urus-info)",
    2: "var(--urus-success)",
    3: "var(--urus-gold)",
    4: "var(--urus-warning)",
    5: "var(--urus-danger)",
};

const etapaIcons: Record<EtapaPostVenta, React.ReactNode> = {
    1: <Package className="h-3.5 w-3.5" />,
    2: <CheckCircle2 className="h-3.5 w-3.5" />,
    3: <Star className="h-3.5 w-3.5" />,
    4: <Link2 className="h-3.5 w-3.5" />,
    5: <RefreshCcw className="h-3.5 w-3.5" />,
};

export function PipelineKanban({ children, className }: PipelineKanbanProps) {
    return (
        <div className={cn("flex gap-3 overflow-x-auto pb-4 min-h-[500px]", className)}>
            {children}
        </div>
    );
}

export function KanbanColumn({ etapa, label, description, emoji, count, children }: KanbanColumnProps) {
    const color = etapaColors[etapa];

    return (
        <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
            {/* Column header */}
            <div
                className="rounded-xl px-3 py-2.5 mb-3 border"
                style={{
                    borderColor: `color-mix(in oklch, ${color} 25%, transparent)`,
                    backgroundColor: `color-mix(in oklch, ${color} 6%, transparent)`,
                }}
            >
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <span
                            className="flex items-center justify-center h-6 w-6 rounded-lg"
                            style={{
                                backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
                                color: color,
                            }}
                        >
                            {etapaIcons[etapa]}
                        </span>
                        <span className="text-sm font-semibold">{label}</span>
                    </div>
                    <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono"
                        style={{
                            backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
                            color: color,
                        }}
                    >
                        {count}
                    </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{description}</p>
            </div>

            {/* Cards */}
            <div className="space-y-2.5 flex-1">
                {children}
            </div>
        </div>
    );
}

// ── Timeline Event Component ─────────────────────────────────

interface TimelineEventProps {
    message: MensajePostVenta;
    isLast?: boolean;
}

const etapaShortLabels: Record<EtapaPostVenta, string> = {
    1: "Cierre",
    2: "Soporte",
    3: "Reputación",
    4: "Referidos",
    5: "Recaptación",
};

export function TimelineEvent({ message, isLast = false }: TimelineEventProps) {
    const isSent = message.tipo === "enviado";
    const color = etapaColors[message.etapa];

    return (
        <div className="flex gap-3 relative">
            {/* Line */}
            {!isLast && (
                <div
                    className="absolute left-[15px] top-[32px] bottom-0 w-px"
                    style={{ backgroundColor: `color-mix(in oklch, ${color} 20%, transparent)` }}
                />
            )}

            {/* Icon */}
            <div
                className="h-[30px] w-[30px] rounded-full flex items-center justify-center shrink-0 relative z-10"
                style={{
                    backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
                    color: color,
                }}
            >
                {isSent ? <Send className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">
                        {isSent ? "Mensaje Enviado" : "Respuesta Recibida"}
                    </span>
                    <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                            backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`,
                            color: color,
                        }}
                    >
                        {etapaShortLabels[message.etapa]}
                    </span>
                </div>
                <div
                    className={cn(
                        "rounded-xl px-3 py-2 text-sm leading-relaxed",
                        isSent
                            ? "bg-accent/30 border border-border/30"
                            : "bg-[var(--urus-success)]/5 border border-[var(--urus-success)]/15"
                    )}
                >
                    {message.contenido}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(message.fecha).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </p>
            </div>
        </div>
    );
}
