import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    trendLabel = "vs last month",
    icon,
    className,
    Description,
}: KPICardProps) {
    const isPositive = trend && trend > 0;
    const isNeutral = trend === 0;

    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                {icon && <div className="text-muted-foreground opacity-70">{icon}</div>}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {(trend !== undefined || Description) && (
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        {trend !== undefined && (
                            <span
                                className={cn(
                                    "flex items-center font-medium mr-2",
                                    isPositive ? "text-emerald-500" : isNeutral ? "text-yellow-500" : "text-red-500"
                                )}
                            >
                                {isPositive ? (
                                    <ArrowUpRight className="h-3 w-3 mr-1" />
                                ) : isNeutral ? (
                                    <TrendingUp className="h-3 w-3 mr-1" />
                                ) : (
                                    <ArrowDownRight className="h-3 w-3 mr-1" />
                                )}
                                {Math.abs(trend)}%
                            </span>
                        )}
                        <span className="opacity-70">{Description || trendLabel}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
