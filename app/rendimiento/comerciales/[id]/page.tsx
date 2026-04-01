"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    DollarSign,
    TrendingUp,
    Target,
    Clock,
    Users,
    Eye,
    AlertTriangle,
    MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SimpleAreaChart } from "@/components/bi/charts";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDashboardComercialDetail } from "@/lib/hooks/use-dashboard-comercial";
import {
    PROFILE_LABELS,
    type ComercialProfile,
} from "@/lib/dashboard/comercial/classify";

const PROFILE_CARD_STYLES: Record<ComercialProfile, { border: string; bg: string; text: string }> = {
    top_performer: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800" },
    productivo_ineficiente: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800" },
    dependiente_lead_caliente: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800" },
    bajo_rendimiento_estructural: { border: "border-red-200", bg: "bg-red-50", text: "text-red-800" },
    sin_datos_suficientes: { border: "border-gray-200", bg: "bg-gray-50", text: "text-gray-600" },
};

const PROFILE_RECOMMENDATIONS: Record<ComercialProfile, string> = {
    top_performer: "Rendimiento excepcional. Considerar asignar leads de mayor valor y documentar su método para replicarlo en el equipo.",
    productivo_ineficiente: "Alta actividad pero baja conversión. Revisar calidad de seguimiento, técnica de cierre y tipo de lead asignado.",
    dependiente_lead_caliente: "Solo rinde con leads de alto score. Trabajar la capacidad de convertir leads fríos y diversificar la cartera.",
    bajo_rendimiento_estructural: "Métricas por debajo del equipo en todos los ejes. Requiere intervención directa: plan de mejora con KPIs claros a 30-60 días.",
    sin_datos_suficientes: "No hay suficientes datos en el periodo seleccionado para clasificar a este comercial.",
};

function formatEur(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K €`;
    return `${value.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

export default function ComercialDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data, loading, error } = useDashboardComercialDetail(id);

    const summary = data?.summary ?? null;
    const weekly = data?.weekly ?? [];

    const chartData = useMemo(
        () =>
            weekly.map((w) => ({
                semana: new Date(w.weekStart).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                }),
                "Facturación": Math.round(w.estimatedRevenueEur),
                "Visitas": w.visits,
                "Cierres": w.closings,
            })),
        [weekly],
    );

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center space-y-2">
                        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
                        <p className="text-sm text-muted-foreground">Error al cargar datos</p>
                        <p className="text-xs text-red-500">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/rendimiento/comerciales">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-7 w-48" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                ) : summary ? (
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{summary.comercialNombre}</h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {summary.ciudad}
                        </p>
                    </div>
                ) : (
                    <p className="text-muted-foreground">Comercial no encontrado</p>
                )}

                {data?.range && (
                    <Badge variant="outline" className="ml-auto text-xs">
                        {new Date(data.range.from).toLocaleDateString("es-ES")} — {new Date(data.range.to).toLocaleDateString("es-ES")}
                    </Badge>
                )}
            </div>

            {/* Classification Card */}
            {!loading && data?.classification && data.classification.profile !== "sin_datos_suficientes" && (
                <Card className={cn(
                    "border",
                    PROFILE_CARD_STYLES[data.classification.profile].border,
                    PROFILE_CARD_STYLES[data.classification.profile].bg,
                )}>
                    <CardContent className="p-4 flex items-start gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-xs font-semibold",
                                        PROFILE_CARD_STYLES[data.classification.profile].border,
                                        PROFILE_CARD_STYLES[data.classification.profile].text,
                                    )}
                                >
                                    {PROFILE_LABELS[data.classification.profile]}
                                </Badge>
                                <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="text-[10px] text-muted-foreground cursor-default">
                                                ({Math.round(data.classification.confidence * 100)}% confianza)
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="text-xs max-w-[240px]">
                                            Nivel de certeza del algoritmo de clasificación respecto
                                            a este perfil frente a los demás.
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <p className={cn(
                                "text-sm",
                                PROFILE_CARD_STYLES[data.classification.profile].text,
                            )}>
                                {PROFILE_RECOMMENDATIONS[data.classification.profile]}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* KPIs */}
            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[120px] rounded-xl" />
                    ))}
                </div>
            ) : summary ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Facturación"
                        value={summary.estimatedRevenueEur}
                        change={0}
                        trend="stable"
                        icon={DollarSign}
                        format="currency"
                    />
                    <KpiCard
                        title="Conv. Lead → Visita"
                        value={Math.round(summary.conversionLeadToVisit * 100 * 10) / 10}
                        change={0}
                        trend="stable"
                        icon={TrendingUp}
                        format="percent"
                    />
                    <KpiCard
                        title="Conv. Visita → Cierre"
                        value={Math.round(summary.conversionVisitToClose * 100 * 10) / 10}
                        change={0}
                        trend="stable"
                        icon={Target}
                        format="percent"
                    />
                    <KpiCard
                        title="Días Medio Cierre"
                        value={summary.avgCloseDays != null ? Math.round(summary.avgCloseDays) : 0}
                        change={0}
                        trend="stable"
                        icon={Clock}
                        format="number"
                    />
                </div>
            ) : null}

            {/* Weekly Chart + Summary Cards */}
            {!loading && summary && (
                <div className="grid gap-6 md:grid-cols-3">
                    {/* Trend Chart */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle>Evolución Semanal</CardTitle>
                            <CardDescription>
                                Facturación, visitas y cierres de las últimas 12 semanas.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {chartData.length > 0 ? (
                                <SimpleAreaChart
                                    data={chartData}
                                    index="semana"
                                    categories={["Facturación", "Visitas", "Cierres"]}
                                    colors={["#f59e0b", "#3b82f6", "#10b981"]}
                                    height={320}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-12">
                                    Sin datos semanales disponibles.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Side panels */}
                    <div className="space-y-6">
                        {/* Pipeline metrics */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Pipeline</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <MetricRow
                                    icon={Users}
                                    label="Leads Asignados"
                                    value={summary.leadsAssigned.toString()}
                                />
                                <MetricRow
                                    icon={Eye}
                                    label="Leads Contactados"
                                    value={summary.leadsContacted.toString()}
                                />
                                <MetricRow
                                    icon={AlertTriangle}
                                    label="Leads Perdidos"
                                    value={summary.leadsLostNoFollowUp.toString()}
                                    variant={summary.leadsLostNoFollowUp > 0 ? "danger" : "default"}
                                />
                                <MetricRow
                                    icon={DollarSign}
                                    label="Volumen Bruto"
                                    value={formatEur(summary.grossVolumeEur)}
                                />
                            </CardContent>
                        </Card>

                        {/* Efficiency metrics */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Eficiencia</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Tasa de Pérdida</span>
                                        <span className={cn(
                                            "font-bold",
                                            summary.lostLeadRate > 0.3 ? "text-red-500" : "text-foreground"
                                        )}>
                                            {(summary.lostLeadRate * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-accent rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all",
                                                summary.lostLeadRate > 0.3 ? "bg-red-500" : "bg-primary"
                                            )}
                                            style={{ width: `${Math.min(summary.lostLeadRate * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Revenue / Lead</span>
                                        <span className="font-bold">
                                            {formatEur(summary.revenuePerLeadAssignedEur)}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Revenue / Operación</span>
                                        <span className="font-bold">
                                            {formatEur(summary.revenuePerOperationEur)}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricRow({
    icon: Icon,
    label,
    value,
    variant = "default",
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    variant?: "default" | "danger";
}) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icon className={cn(
                    "h-4 w-4",
                    variant === "danger" ? "text-red-500" : "text-muted-foreground"
                )} />
                <span className="text-sm text-muted-foreground">{label}</span>
            </div>
            <span className={cn(
                "text-sm font-semibold tabular-nums",
                variant === "danger" && "text-red-500"
            )}>
                {value}
            </span>
        </div>
    );
}
