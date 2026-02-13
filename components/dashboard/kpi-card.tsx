import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SparklineChart } from "./sparkline-chart";
import { cn } from "@/lib/utils";

interface KpiCardProps {
    title: string;
    value: number;
    change: number;
    trend: "up" | "down" | "stable";
    icon: LucideIcon;
    format?: "currency" | "number" | "percent";
    historico?: number[];
}

function formatValue(value: number, format: string = "number"): string {
    if (format === "currency") {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M €`;
        if (value >= 1000) return `${(value / 1000).toFixed(0)}K €`;
        return `${value.toLocaleString("es-ES")} €`;
    }
    if (format === "percent") return `${value}%`;
    return value.toLocaleString("es-ES");
}

const trendIcon = {
    up: TrendingUp,
    down: TrendingDown,
    stable: Minus,
};

export function KpiCard({ title, value, change, trend, icon: Icon, format = "number", historico = [] }: KpiCardProps) {
    const TrendIcon = trendIcon[trend];
    const isPositive = change >= 0;

    return (
        <Card className="relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-background/20">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {title}
                        </p>
                        <p className="text-2xl font-bold tracking-tight">
                            {formatValue(value, format)}
                        </p>
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
                                {change}%
                            </span>
                            <span className="text-xs text-muted-foreground">vs mes anterior</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="rounded-lg bg-accent/50 p-2.5">
                            <Icon className="h-5 w-5 text-secondary" />
                        </div>
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
