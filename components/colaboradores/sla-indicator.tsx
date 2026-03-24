"use client";

import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { EstadoColaborador } from "@/lib/mock-data/types";

interface SlaIndicatorProps {
    slaEsperado: number;
    slaReal: number;
    estado: EstadoColaborador;
    compact?: boolean;
    className?: string;
}

const estadoConfig: Record<EstadoColaborador, { color: string; label: string; icon: typeof CheckCircle2 }> = {
    ok: { color: "var(--urus-success)", label: "En tiempo", icon: CheckCircle2 },
    retrasado: { color: "var(--urus-warning)", label: "Retrasado", icon: Clock },
    critico: { color: "var(--urus-danger)", label: "Crítico", icon: AlertTriangle },
};

export function SlaIndicator({ slaEsperado, slaReal, estado, compact = false, className }: SlaIndicatorProps) {
    const config = estadoConfig[estado];
    const Icon = config.icon;
    const percentage = Math.min((slaEsperado / Math.max(slaReal, 1)) * 100, 100);
    const diff = slaReal - slaEsperado;

    if (compact) {
        return (
            <div className={cn("flex items-center gap-1.5", className)}>
                <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                <span className="text-xs font-medium font-mono" style={{ color: config.color }}>
                    {slaReal}d
                </span>
                <span className="text-[10px] text-muted-foreground">/ {slaEsperado}d</span>
            </div>
        );
    }

    return (
        <div className={cn("space-y-1.5", className)}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                    <span className="text-xs font-medium" style={{ color: config.color }}>
                        {config.label}
                    </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                    {slaReal}d / {slaEsperado}d
                    {diff > 0 && (
                        <span className="text-[var(--urus-danger)] ml-1">(+{diff}d)</span>
                    )}
                    {diff < 0 && (
                        <span className="text-[var(--urus-success)] ml-1">({diff}d)</span>
                    )}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-accent/30 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                        width: `${percentage}%`,
                        backgroundColor: config.color,
                    }}
                />
            </div>
        </div>
    );
}

export { estadoConfig };
