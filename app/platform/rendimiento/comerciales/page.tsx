"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    DollarSign,
    TrendingUp,
    Target,
    AlertTriangle,
    Calendar,
    Filter,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SimpleBarChart } from "@/components/bi/charts";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatEur, formatPercent } from "@/lib/utils/format";
import {
    useDashboardComerciales,
    type DashboardComercialesFilters,
} from "@/lib/hooks/use-dashboard-comercial";
import {
    PROFILE_LABELS,
    PROFILE_SHORT_LABELS,
    type ComercialProfile,
} from "@/lib/dashboard/comercial/classify";

const PROFILE_STYLES: Record<ComercialProfile, string> = {
    top_performer: "bg-emerald-100 text-emerald-800 border-emerald-200",
    productivo_ineficiente: "bg-amber-100 text-amber-800 border-amber-200",
    dependiente_lead_caliente: "bg-blue-100 text-blue-800 border-blue-200",
    bajo_rendimiento_estructural: "bg-red-100 text-red-800 border-red-200",
    sin_datos_suficientes: "bg-gray-100 text-gray-600 border-gray-200",
};

function ProfileBadge({ profile, confidence }: { profile: ComercialProfile; confidence: number }) {
    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-[10px] font-medium whitespace-nowrap cursor-default",
                            PROFILE_STYLES[profile],
                        )}
                    >
                        {PROFILE_SHORT_LABELS[profile]}
                    </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                    <p className="font-medium">{PROFILE_LABELS[profile]}</p>
                    {profile !== "sin_datos_suficientes" && (
                        <p className="text-muted-foreground">
                            Confianza: {Math.round(confidence * 100)}%
                        </p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export default function ComercialesDashboardPage() {
    const router = useRouter();
    const { isComercial, comercialId } = useSession();
    const [filters, setFilters] = useState<DashboardComercialesFilters>({});
    const { data, loading, error } = useDashboardComerciales(filters);

    useEffect(() => {
        if (isComercial && comercialId) {
            router.replace(`/platform/rendimiento/comerciales/${comercialId}`);
        }
    }, [isComercial, comercialId, router]);

    if (isComercial && comercialId) return null;

    const rows = data?.rows ?? [];

    const kpis = useMemo(() => {
        if (!rows.length) {
            return {
                totalRevenue: 0,
                avgConversionLV: 0,
                totalClosings: 0,
                avgLostRate: 0,
            };
        }
        const totalRevenue = rows.reduce((s, r) => s + r.estimatedRevenueEur, 0);
        const totalClosings = rows.reduce((s, r) => s + r.closings, 0);

        const withLeads = rows.filter((r) => r.leadsAssigned > 0);
        const avgConversionLV =
            withLeads.length > 0
                ? withLeads.reduce((s, r) => s + r.conversionLeadToVisit, 0) / withLeads.length
                : 0;
        const avgLostRate =
            withLeads.length > 0
                ? withLeads.reduce((s, r) => s + r.lostLeadRate, 0) / withLeads.length
                : 0;

        return { totalRevenue, avgConversionLV, totalClosings, avgLostRate };
    }, [rows]);

    const conversionChartData = useMemo(
        () =>
            rows
                .filter((r) => r.leadsAssigned > 0)
                .map((r) => ({
                    nombre: r.comercialNombre.split(" ")[0],
                    "C→V %": Math.round(r.conversionLeadToVisit * 100),
                    "V→C %": Math.round(r.conversionVisitToClose * 100),
                })),
        [rows],
    );

    const revenueChartData = useMemo(
        () =>
            rows
                .filter((r) => r.estimatedRevenueEur > 0)
                .map((r) => ({
                    nombre: r.comercialNombre.split(" ")[0],
                    "Facturación": Math.round(r.estimatedRevenueEur),
                })),
        [rows],
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
            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <label className="text-sm font-medium text-muted-foreground">Desde</label>
                            <input
                                type="date"
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                value={filters.from?.split("T")[0] ?? ""}
                                onChange={(e) =>
                                    setFilters((f) => ({
                                        ...f,
                                        from: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                                    }))
                                }
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-muted-foreground">Hasta</label>
                            <input
                                type="date"
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                value={filters.to?.split("T")[0] ?? ""}
                                onChange={(e) =>
                                    setFilters((f) => ({
                                        ...f,
                                        to: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                                    }))
                                }
                            />
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <label className="text-sm text-muted-foreground">Incluir inactivos</label>
                            <Switch
                                checked={filters.includeInactive ?? false}
                                onCheckedChange={(checked) =>
                                    setFilters((f) => ({ ...f, includeInactive: checked }))
                                }
                            />
                        </div>
                    </div>
                    {data?.range && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Rango: {new Date(data.range.from).toLocaleDateString("es-ES")} — {new Date(data.range.to).toLocaleDateString("es-ES")}
                            {" · "}Tasa comisión: {((data.commissionRate ?? 0) * 100).toFixed(1)}%
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* KPIs */}
            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[120px] rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Facturación Total"
                        value={kpis.totalRevenue}
                        change={0}
                        trend="stable"
                        icon={DollarSign}
                        format="currency"
                    />
                    <KpiCard
                        title="Conversión Cliente → Visita"
                        value={Math.round(kpis.avgConversionLV * 100 * 10) / 10}
                        change={0}
                        trend="stable"
                        icon={TrendingUp}
                        format="percent"
                    />
                    <KpiCard
                        title="Total Cierres"
                        value={kpis.totalClosings}
                        change={0}
                        trend="stable"
                        icon={Target}
                        format="number"
                    />
                    <KpiCard
                        title="Tasa Media de Pérdida"
                        value={Math.round(kpis.avgLostRate * 100 * 10) / 10}
                        change={0}
                        trend={kpis.avgLostRate > 0.3 ? "down" : "stable"}
                        icon={AlertTriangle}
                        format="percent"
                    />
                </div>
            )}

            {/* Charts */}
            {!loading && rows.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Conversión por Comercial</CardTitle>
                            <CardDescription>Cliente → Visita y Visita → Cierre (%)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SimpleBarChart
                                data={conversionChartData}
                                categories={["C→V %", "V→C %"]}
                                index="nombre"
                                colors={["#10b981", "#3b82f6"]}
                                height={Math.max(200, conversionChartData.length * 40)}
                                layout="vertical"
                            />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Facturación por Comercial</CardTitle>
                            <CardDescription>Ingresos estimados (€)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SimpleBarChart
                                data={revenueChartData}
                                categories={["Facturación"]}
                                index="nombre"
                                colors={["#f59e0b"]}
                                height={Math.max(200, revenueChartData.length * 40)}
                                layout="vertical"
                            />
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Ranking Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Clasificación de Comerciales</CardTitle>
                    <CardDescription>
                        Ordenado por facturación estimada. Click en una fila para ver el detalle.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full rounded-md" />
                            ))}
                        </div>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No hay datos de comerciales para el rango seleccionado.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px] text-center">#</TableHead>
                                    <TableHead>Comercial</TableHead>
                                    <TableHead>Perfil</TableHead>
                                    <TableHead>Ciudad</TableHead>
                                    <TableHead className="text-right">Clientes</TableHead>
                                    <TableHead className="text-right">Visitas</TableHead>
                                    <TableHead className="text-right">Cierres</TableHead>
                                    <TableHead className="text-right">Facturación</TableHead>
                                    <TableHead className="text-right">C→V %</TableHead>
                                    <TableHead className="text-right">V→C %</TableHead>
                                    <TableHead className="text-right">Días Cierre</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row, idx) => (
                                    <TableRow
                                        key={row.comercialId}
                                        className="cursor-pointer hover:bg-accent/60 transition-colors"
                                        onClick={() => router.push(`/platform/rendimiento/comerciales/${row.comercialId}`)}
                                    >
                                        <TableCell className="text-center">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full",
                                                    idx === 0 && "bg-yellow-100 text-yellow-800 border-yellow-300",
                                                    idx === 1 && "bg-gray-100 text-gray-700 border-gray-300",
                                                    idx === 2 && "bg-orange-100 text-orange-700 border-orange-300",
                                                )}
                                            >
                                                {idx + 1}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{row.comercialNombre}</div>
                                        </TableCell>
                                        <TableCell>
                                            {row.classification && (
                                                <ProfileBadge
                                                    profile={row.classification.profile}
                                                    confidence={row.classification.confidence}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">{row.ciudad}</span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.leadsAssigned}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.visits}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-medium">
                                            {row.closings}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium">
                                            {formatEur(row.estimatedRevenueEur)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className={cn(
                                                "text-sm font-medium",
                                                row.conversionLeadToVisit >= 0.15 ? "text-emerald-600" :
                                                    row.conversionLeadToVisit >= 0.08 ? "text-yellow-600" :
                                                        "text-red-500"
                                            )}>
                                                {formatPercent(row.conversionLeadToVisit)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className={cn(
                                                "text-sm font-medium",
                                                row.conversionVisitToClose >= 0.3 ? "text-emerald-600" :
                                                    row.conversionVisitToClose >= 0.15 ? "text-yellow-600" :
                                                        "text-red-500"
                                            )}>
                                                {formatPercent(row.conversionVisitToClose)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                            {row.avgCloseDays != null ? `${Math.round(row.avgCloseDays)}d` : "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
