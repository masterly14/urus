import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Backward-compatible KPICard for BI/Rendimiento views.
 * New code should use KpiCard from @/components/dashboard/kpi-card instead.
 */

interface KPICardProps {
    title: string;
    value: string | number;
    trend?: number;
    trendLabel?: string;
    icon?: React.ReactNode;
    className?: string;
    Description?: string;
}

export function KPICard({
    title,
    value,
    trend,
    trendLabel = "vs mes anterior",
    icon,
    className,
    Description,
}: KPICardProps) {
    const isPositive = trend !== undefined && trend > 0;
    const isNegative = trend !== undefined && trend < 0;

    return (
        <Card className={cn("relative overflow-hidden transition-all duration-150 hover:shadow-[var(--shadow-elevated)]", className)}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {title}
                        </p>
                        <p className="text-2xl font-bold tracking-tight">
                            {value}
                        </p>
                        {(trend !== undefined || Description) && (
                            <div className="flex items-center gap-1.5 text-xs">
                                {trend !== undefined && (
                                    <span
                                        className={cn(
                                            "font-semibold",
                                            isPositive && "text-urus-success",
                                            isNegative && "text-urus-danger",
                                            !isPositive && !isNegative && "text-muted-foreground"
                                        )}
                                    >
                                        {isPositive ? "+" : ""}
                                        {typeof trend === "number" ? `${trend}%` : trend}
                                    </span>
                                )}
                                <span className="text-muted-foreground">{Description || trendLabel}</span>
                            </div>
                        )}
                    </div>
                    {icon && (
                        <div className="rounded-lg bg-muted p-2.5 text-muted-foreground">
                            {icon}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
