"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    ArrowUpRight,
    Calendar,
    DollarSign,
    Filter,
    MoreHorizontal,
    TrendingUp,
    User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SimpleAreaChart } from "@/components/bi/charts";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/utils/format";
import {
    useDashboardComerciales,
    type DashboardComercialesFilters,
    type DashboardRowWithClassification,
} from "@/lib/hooks/use-dashboard-comercial";
import {
    PROFILE_LABELS,
    CLASIFICABLE_PROFILES,
    type ComercialProfile,
    type ClasificableProfile,
} from "@/lib/dashboard/comercial/classify";

// ---------------------------------------------------------------------------
// Profile visual config
// ---------------------------------------------------------------------------

const PROFILE_META: Record<
    ClasificableProfile,
    {
        color: string;
        borderCard: string;
        description: string;
        action: string;
    }
> = {
    top_performer: {
        color: "#10b981",
        borderCard: "border-t-urus-success",
        description: "Alta conversión + alta actividad",
        action: "Retener y replicar método",
    },
    productivo_ineficiente: {
        color: "#3b82f6",
        borderCard: "border-t-blue-500",
        description: "Mucha actividad, baja conversión",
        action: "Capacitación en cierre",
    },
    dependiente_lead_caliente: {
        color: "#f59e0b",
        borderCard: "border-t-yellow-500",
        description: "Cierra fácil, poca prospección",
        action: "Aumentar cuota de actividad",
    },
    bajo_rendimiento_estructural: {
        color: "#ef4444",
        borderCard: "border-t-urus-danger",
        description: "Baja conversión y actividad",
        action: "Plan de mejora 30-60 días",
    },
};

const PROFILE_BADGE_STYLES: Record<ComercialProfile, string> = {
    top_performer: "bg-urus-success/10 text-urus-success border-urus-success/30",
    productivo_ineficiente: "bg-blue-50 text-blue-700 border-blue-300",
    dependiente_lead_caliente: "bg-yellow-50 text-yellow-700 border-yellow-300",
    bajo_rendimiento_estructural: "bg-urus-danger/10 text-urus-danger border-urus-danger/30",
    sin_datos_suficientes: "bg-gray-50 text-gray-600 border-gray-200",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamPerformancePage() {
    const router = useRouter();
    const [filters, setFilters] = useState<DashboardComercialesFilters>({});
    const { data, loading, error } = useDashboardComerciales(filters);

    const rows: DashboardRowWithClassification[] = data?.rows ?? [];

    const kpis = useMemo(() => {
        const totalRevenue = rows.reduce((s, r) => s + r.estimatedRevenueEur, 0);
        const totalLeads = rows.reduce((s, r) => s + r.leadsAssigned, 0);
        const totalVisits = rows.reduce((s, r) => s + r.visits, 0);
        const totalClosings = rows.reduce((s, r) => s + r.closings, 0);

        // Agregados ponderados por volumen (no media de medias).
        // Más robusto ante comerciales con pocos leads/alta varianza.
        const convLeadToVisit = totalLeads > 0 ? totalVisits / totalLeads : 0;
        const convLeadToClose = totalLeads > 0 ? totalClosings / totalLeads : 0;

        const topPerformers = rows.filter(
            (r) => r.classification.profile === "top_performer",
        ).length;
        const atRisk = rows.filter(
            (r) => r.classification.profile === "bajo_rendimiento_estructural",
        ).length;

        return {
            totalRevenue,
            totalLeads,
            totalVisits,
            totalClosings,
            convLeadToVisit,
            convLeadToClose,
            topPerformers,
            atRisk,
        };
    }, [rows]);

    const profileCounts = useMemo(() => {
        const counts: Record<ClasificableProfile, number> = {
            top_performer: 0,
            productivo_ineficiente: 0,
            dependiente_lead_caliente: 0,
            bajo_rendimiento_estructural: 0,
        };
        for (const r of rows) {
            if (r.classification.profile === "sin_datos_suficientes") continue;
            counts[r.classification.profile as ClasificableProfile]++;
        }
        return counts;
    }, [rows]);

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center space-y-2">
                        <AlertTriangle className="h-8 w-8 text-urus-danger mx-auto" />
                        <p className="text-sm text-muted-foreground">Error al cargar datos del equipo</p>
                        <p className="text-xs text-urus-danger">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <FiltersBar
                filters={filters}
                setFilters={setFilters}
                rangeInfo={data?.range}
                commissionRate={data?.commissionRate}
            />

            {/* Global KPIs */}
            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[120px] rounded-lg" />
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
                        description={`${kpis.totalClosings} cierres · ${kpis.totalLeads} leads`}
                    />
                    <KpiCard
                        title="Conversión Global L→V"
                        value={Math.round(kpis.convLeadToVisit * 1000) / 10}
                        change={0}
                        trend="stable"
                        icon={ArrowUpRight}
                        format="percent"
                        description={`L→C ${(kpis.convLeadToClose * 100).toFixed(1)}%`}
                    />
                    <KpiCard
                        title="Top Performers"
                        value={kpis.topPerformers}
                        change={0}
                        trend="stable"
                        icon={User}
                        format="number"
                        description={`Sobre ${rows.length} comerciales`}
                    />
                    <KpiCard
                        title="Bajo Rendimiento"
                        value={kpis.atRisk}
                        change={0}
                        trend={kpis.atRisk > 0 ? "down" : "stable"}
                        icon={AlertTriangle}
                        format="number"
                        description="Requieren plan de mejora"
                        className={kpis.atRisk > 0 ? "border-l-4 border-l-urus-danger" : undefined}
                    />
                </div>
            )}

            {/* Archetype cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {CLASIFICABLE_PROFILES.map((profile) => {
                    const meta = PROFILE_META[profile];
                    return (
                        <Card key={profile} className={cn("border-t-4", meta.borderCard)}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {PROFILE_LABELS[profile]}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    {meta.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-between items-end">
                                    {loading ? (
                                        <Skeleton className="h-8 w-10" />
                                    ) : (
                                        <span className="text-2xl font-bold tabular-nums">
                                            {profileCounts[profile]}
                                        </span>
                                    )}
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] opacity-70"
                                    >
                                        {meta.action}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Team table */}
            <Card>
                <CardHeader>
                    <CardTitle>Rendimiento del Equipo</CardTitle>
                    <CardDescription>
                        Métricas reales desde el Event Store. Tendencia: facturación estimada de las últimas 6 semanas.
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
                                        <TableHead>Agente</TableHead>
                                        <TableHead>Perfil</TableHead>
                                        <TableHead className="text-right">Leads</TableHead>
                                        <TableHead className="text-right">Visitas</TableHead>
                                        <TableHead className="text-right">Cierres</TableHead>
                                        <TableHead className="text-right">Conv. L→V</TableHead>
                                        <TableHead className="text-right">Facturación</TableHead>
                                        <TableHead className="w-[150px]">Tendencia (6 sem)</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TeamRow
                                            key={row.comercialId}
                                            row={row}
                                            onNavigate={() =>
                                                router.push(
                                                    `/platform/rendimiento/comerciales/${row.comercialId}`,
                                                )
                                            }
                                        />
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FiltersBar({
    filters,
    setFilters,
    rangeInfo,
    commissionRate,
}: {
    filters: DashboardComercialesFilters;
    setFilters: React.Dispatch<React.SetStateAction<DashboardComercialesFilters>>;
    rangeInfo?: { from: string; to: string };
    commissionRate?: number;
}) {
    return (
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
                                    from: e.target.value
                                        ? new Date(e.target.value).toISOString()
                                        : undefined,
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
                                    to: e.target.value
                                        ? new Date(e.target.value).toISOString()
                                        : undefined,
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
                {rangeInfo && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Rango: {new Date(rangeInfo.from).toLocaleDateString("es-ES")} —{" "}
                        {new Date(rangeInfo.to).toLocaleDateString("es-ES")}
                        {commissionRate != null &&
                            ` · Tasa comisión: ${(commissionRate * 100).toFixed(1)}%`}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function TeamRow({
    row,
    onNavigate,
}: {
    row: DashboardRowWithClassification;
    onNavigate: () => void;
}) {
    const profile = row.classification.profile;
    const sparklineData = useMemo(
        () =>
            (row.weeklyRevenue ?? new Array(6).fill(0)).map((v, i) => ({
                w: i,
                v: Math.round(v),
            })),
        [row.weeklyRevenue],
    );
    const sparklineColor =
        profile === "sin_datos_suficientes"
            ? "#94a3b8"
            : PROFILE_META[profile as ClasificableProfile].color;

    const confidencePct = Math.round(row.classification.confidence * 100);

    return (
        <TableRow className="cursor-pointer hover:bg-accent/60 transition-colors" onClick={onNavigate}>
            <TableCell>
                <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={`/avatars/${row.comercialId}.png`} />
                        <AvatarFallback>
                            {row.comercialNombre.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="font-medium">{row.comercialNombre}</div>
                        <div className="text-xs text-muted-foreground">{row.ciudad || "—"}</div>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <TooltipProvider delayDuration={200}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[10px] font-normal border-opacity-50 cursor-default",
                                    PROFILE_BADGE_STYLES[profile],
                                )}
                            >
                                {PROFILE_LABELS[profile]}
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            {profile === "sin_datos_suficientes" ? (
                                <p>Sin suficientes leads para clasificar.</p>
                            ) : (
                                <>
                                    <p className="font-medium">
                                        {PROFILE_LABELS[profile]}
                                    </p>
                                    <p className="text-muted-foreground">
                                        Confianza: {confidencePct}%
                                    </p>
                                </>
                            )}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.leadsAssigned}</TableCell>
            <TableCell className="text-right tabular-nums">{row.visits}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">
                {row.closings}
            </TableCell>
            <TableCell className="text-right">
                <span
                    className={cn(
                        "text-sm font-medium",
                        row.conversionLeadToVisit >= 0.15
                            ? "text-urus-success"
                            : row.conversionLeadToVisit >= 0.08
                                ? "text-urus-warning"
                                : "text-urus-danger",
                    )}
                >
                    {(row.conversionLeadToVisit * 100).toFixed(1)}%
                </span>
            </TableCell>
            <TableCell className="text-right font-mono font-medium">
                {formatEur(row.estimatedRevenueEur)}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="h-[30px] w-full">
                    <SimpleAreaChart
                        data={sparklineData}
                        categories={["v"]}
                        index="w"
                        colors={[sparklineColor]}
                        height={30}
                        showLegend={false}
                        className="opacity-70"
                    />
                </div>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                            <Link href={`/platform/rendimiento/comerciales/${row.comercialId}`}>
                                Ver Perfil Completo
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link
                                href={`/platform/rendimiento/alertas?comercialId=${row.comercialId}`}
                            >
                                Ver Alertas
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
}
