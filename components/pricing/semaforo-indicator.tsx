"use client";

import { cn } from "@/lib/utils";
import type { SemaforoStatus } from "@/lib/mock-data/types";

interface SemaforoIndicatorProps {
    status: SemaforoStatus;
    size?: "sm" | "md" | "lg" | "xl";
    showLabel?: boolean;
    className?: string;
}

const semaforoConfig: Record<SemaforoStatus, { color: string; label: string; bgLight: string }> = {
    verde: { color: "var(--urus-success)", label: "Bien posicionado", bgLight: "color-mix(in oklch, var(--urus-success) 12%, transparent)" },
    amarillo: { color: "var(--urus-warning)", label: "Riesgo", bgLight: "color-mix(in oklch, var(--urus-warning) 12%, transparent)" },
    rojo: { color: "var(--urus-danger)", label: "Fuera de mercado", bgLight: "color-mix(in oklch, var(--urus-danger) 12%, transparent)" },
};

const sizeMap = {
    sm: { dot: "h-3 w-3", glow: "h-5 w-5", text: "text-[9px]" },
    md: { dot: "h-4 w-4", glow: "h-6 w-6", text: "text-[10px]" },
    lg: { dot: "h-6 w-6", glow: "h-9 w-9", text: "text-xs" },
    xl: { dot: "h-10 w-10", glow: "h-16 w-16", text: "text-sm" },
};

export function SemaforoIndicator({ status, size = "md", showLabel = false, className }: SemaforoIndicatorProps) {
    const config = semaforoConfig[status];
    const s = sizeMap[size];

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="relative flex items-center justify-center">
                {/* Glow */}
                <div
                    className={cn("absolute rounded-full animate-pulse", s.glow)}
                    style={{ backgroundColor: `color-mix(in oklch, ${config.color} 20%, transparent)` }}
                />
                {/* Dot */}
                <div
                    className={cn("rounded-full relative z-10 shadow-md", s.dot)}
                    style={{
                        backgroundColor: config.color,
                        boxShadow: `0 0 12px color-mix(in oklch, ${config.color} 40%, transparent)`,
                    }}
                />
            </div>
            {showLabel && (
                <span className={cn("font-medium", s.text)} style={{ color: config.color }}>
                    {config.label}
                </span>
            )}
        </div>
    );
}

export { semaforoConfig };
