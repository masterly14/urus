"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SparklineChart } from "@/components/dashboard/sparkline-chart";
import type { Comercial } from "@/lib/mock-data/types";

interface CoachMetricsTableProps {
    comerciales: Comercial[];
    className?: string;
}

function getStressColor(nivel: string) {
    switch (nivel) {
        case "bajo": return "var(--urus-success)";
        case "medio": return "var(--urus-warning)";
        case "alto": return "var(--urus-danger)";
        default: return "var(--urus-info)";
    }
}

function getUsageLevel(sessions: number): { label: string; color: string } {
    if (sessions >= 15) return { label: "Activo", color: "var(--urus-success)" };
    if (sessions >= 8) return { label: "Regular", color: "var(--urus-warning)" };
    return { label: "Bajo", color: "var(--urus-danger)" };
}

function formatRelativeTime(isoDate: string): string {
    const now = new Date();
    const date = new Date(isoDate);
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffD = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffH < 1) return "Hace unos minutos";
    if (diffH < 24) return `Hace ${diffH}h`;
    if (diffD === 1) return "Ayer";
    return `Hace ${diffD} días`;
}

export function CoachMetricsTable({ comerciales, className }: CoachMetricsTableProps) {
    return (
        <div className={cn("overflow-x-auto", className)}>
            <table className="w-full">
                <thead>
                    <tr className="border-b border-border/50">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comercial</th>
                        <th className="text-center py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sesiones</th>
                        <th className="text-center py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Última Sesión</th>
                        <th className="text-center py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nivel Uso</th>
                        <th className="text-center py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estrés</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tendencia</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                    {comerciales.map((c) => {
                        const usage = getUsageLevel(c.sesionesCoach);
                        const stressColor = getStressColor(c.nivelEstres);

                        return (
                            <tr
                                key={c.id}
                                className="hover:bg-accent/20 transition-colors"
                            >
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-accent/50 flex items-center justify-center text-xs font-semibold text-secondary">
                                            {c.avatar}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{c.nombre}</p>
                                            <p className="text-[11px] text-muted-foreground">{c.ciudad}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="text-center py-3 px-3">
                                    <span className="text-sm font-semibold font-mono">{c.sesionesCoach}</span>
                                </td>
                                <td className="text-center py-3 px-3">
                                    <span className="text-xs text-muted-foreground">
                                        {formatRelativeTime(c.ultimaSesionCoach)}
                                    </span>
                                </td>
                                <td className="text-center py-3 px-3">
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] px-2"
                                        style={{
                                            borderColor: `color-mix(in oklch, ${usage.color} 40%, transparent)`,
                                            color: usage.color,
                                            backgroundColor: `color-mix(in oklch, ${usage.color} 10%, transparent)`,
                                        }}
                                    >
                                        {usage.label}
                                    </Badge>
                                </td>
                                <td className="text-center py-3 px-3">
                                    <div className="flex items-center justify-center gap-1.5">
                                        <span
                                            className="h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: stressColor }}
                                        />
                                        <span
                                            className="text-xs font-medium capitalize"
                                            style={{ color: stressColor }}
                                        >
                                            {c.nivelEstres}
                                        </span>
                                    </div>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex justify-end">
                                        <SparklineChart
                                            data={c.tendencia}
                                            color={stressColor}
                                            width={80}
                                            height={24}
                                        />
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
