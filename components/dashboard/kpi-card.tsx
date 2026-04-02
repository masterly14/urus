import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SparklineChart } from "./sparkline-chart";
import { cn } from "@/lib/utils";
import { formatEur, formatEurCompact, formatPercent } from "@/lib/utils/format";

interface KpiCardProps {
    title: string;
    value: string | number; // Cambiado para soportar valores ya formateados
    change?: number | null; // Opcional y nullable
    trend?: "up" | "down" | "stable"; // Opcional
    icon?: LucideIcon; // Opcional
    format?: "currency" | "number" | "percent" | "raw";
    historico?: number[];
    sub?: string; // Subtítulo opcional (ej: "vs mes anterior")
    highlight?: "green" | "amber" | "red"; // Forzar color del valor principal
    className?: string; // Clases custom para la Card
}

function formatValue(value: string | number, format: string = "number"): string {
    if (typeof value === "string" || format === "raw") return String(value);
    
    if (format === "currency") {
        return formatEurCompact(value);
    }
    if (format === "percent") return formatPercent(value / 100, { showDecimals: true });
    return value.toLocaleString("es-ES");
}

export function KpiCard({ 
    title, 
    value, 
    change, 
    trend, 
    icon: Icon, 
    format = "number", 
    historico = [],
    sub = "vs mes anterior",
    highlight,
    className
}: KpiCardProps) {
    const isPositive = (change ?? 0) >= 0;
    
    // Si no pasan trend explícito pero sí hay change, lo deducimos
    const computedTrend = trend || (change === undefined || change === null ? "stable" : change > 0 ? "up" : change < 0 ? "down" : "stable");
    const TrendIcon = computedTrend === "up" ? TrendingUp : computedTrend === "down" ? TrendingDown : Minus;
    
    // Color del valor principal
    const valueColor = highlight === "green" 
        ? "text-[var(--urus-success)]" 
        : highlight === "amber" 
            ? "text-amber-500 dark:text-amber-400" 
            : highlight === "red" 
                ? "text-[var(--urus-danger)]" 
                : "text-foreground";

    return (
        <Card className={cn(
            "relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-background/20",
            className
        )}>
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {title}
                        </p>
                        <p className={cn("text-2xl font-bold tracking-tight font-mono", valueColor)}>
                            {formatValue(value, format)}
                        </p>
                        
                        {(change !== undefined && change !== null) ? (
                            <div className="flex items-center gap-1.5">
                                <TrendIcon
                                    className={cn(
                                        "h-3.5 w-3.5",
                                        isPositive ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"
                                    )}
                                />
                                <span
                                    className={cn(
                                        "text-xs font-semibold",
                                        isPositive ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"
                                    )}
                                >
                                    {isPositive ? "+" : ""}
                                    {formatPercent((change) / 100, { showDecimals: true })}
                                </span>
                                <span className="text-xs text-muted-foreground">{sub}</span>
                            </div>
                        ) : sub ? (
                            <div className="text-xs text-muted-foreground">{sub}</div>
                        ) : null}
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                        {Icon && (
                            <div className="rounded-lg bg-accent/50 p-2.5">
                                <Icon className="h-5 w-5 text-secondary" />
                            </div>
                        )}
                        {historico.length > 0 && (
                            <SparklineChart
                                data={historico}
                                color={isPositive ? "var(--urus-success)" : "var(--urus-danger)"}
                                width={100}
                                height={28}
                            />
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
