"use client";

import { useSearchParams } from "next/navigation";
import {
    Activity,
    AlertTriangle,
    Banknote,
    Building2,
    DollarSign,
    PiggyBank,
    TrendingUp,
    Users,
    Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Semaforo } from "@/components/dashboard/semaforo";
import { SimpleAreaChart } from "@/components/bi/charts";
import { MockBadge } from "@/components/bi/mock-badge";
import { useCeoOverview } from "@/lib/hooks/use-ceo-overview";
import type { CeoOverviewPayload, KpiValue } from "@/lib/dashboard/ceo/types";
import { datosFinancieros } from "@/lib/mock-data/financiero";
import { financialData } from "@/lib/mock-data/bi";

// ---------------------------------------------------------------------------
// Mock fallback (activated via ?mock=1)
// ---------------------------------------------------------------------------

function buildMockPayload(): CeoOverviewPayload {
    const d = datosFinancieros;
    return {
        kpis: {
            facturacionMensual: { value: d.facturacion.valor, previousValue: d.facturacion.historico[10], changePercent: d.facturacion.variacion },
            facturacionTrimestral: { value: d.facturacion.historico.slice(-3).reduce((a, b) => a + b, 0), previousValue: null, changePercent: null },
            ebitda: { value: d.ebitda.valor, previousValue: d.ebitda.historico[10], changePercent: d.ebitda.variacion },
            costeOperativo: { value: d.costeOperativo.valor, previousValue: d.costeOperativo.historico[10], changePercent: d.costeOperativo.variacion },
            margenPorOperacion: { value: 12400, previousValue: 11800, changePercent: 5.1 },
            cashDisponible: { value: d.cashFlow.valor, previousValue: d.cashFlow.historico[10], changePercent: d.cashFlow.variacion },
            capacidadReinversion: { value: 45000, previousValue: 42000, changePercent: 7.1 },
        },
        semaforos: {
            facturacion: "verde",
            equipo: "amarillo",
            expansion: "amarillo",
            costes: "verde",
        },
        operaciones: { activas: d.operacionesActivas.valor, cerradasMes: 5 },
        equipo: { comercialesActivos: 12, alertasAbiertas: 3, cargaMedia: 14 },
        historico: financialData.map((m) => ({
            period: m.period,
            revenueEur: m.revenue,
            targetRevenueEur: m.targetRevenue,
            ebitdaEur: m.ebitda,
            operatingCostEur: m.operatingCost,
            cashAvailableEur: m.cashFlow,
        })),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trendOf(kpi: KpiValue): "up" | "down" | "stable" {
    if (kpi.changePercent == null || kpi.changePercent === 0) return "stable";
    return kpi.changePercent > 0 ? "up" : "down";
}

const semaforoLabels: Record<string, string> = {
    facturacion: "Facturación",
    equipo: "Equipo",
    expansion: "Expansión",
    costes: "Costes",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VisionEjecutivaPage() {
    const searchParams = useSearchParams();
    const useMock = searchParams.get("mock") === "1";

    const { data: apiData, loading, error } = useCeoOverview();

    const data: CeoOverviewPayload | null = useMock ? buildMockPayload() : apiData;

    if (!useMock && loading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
                <div className="grid gap-4 md:grid-cols-7">
                    <Skeleton className="h-80 md:col-span-4 rounded-xl" />
                    <Skeleton className="h-80 md:col-span-3 rounded-xl" />
                </div>
            </div>
        );
    }

    if (!useMock && error) {
        return (
            <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
                <CardHeader className="flex flex-row items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-red-900 dark:text-red-200">Error al cargar datos</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    const { kpis, semaforos, operaciones, equipo, historico } = data;

    return (
        <div className="space-y-6">
            <MockBadge show={useMock} />

            {/* KPIs principales */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="Facturación Mensual"
                    value={kpis.facturacionMensual.value}
                    change={kpis.facturacionMensual.changePercent}
                    trend={trendOf(kpis.facturacionMensual)}
                    icon={DollarSign}
                    format="currency"
                    historico={historico.map((h) => h.revenueEur)}
                />
                <KpiCard
                    title="EBITDA"
                    value={kpis.ebitda.value}
                    change={kpis.ebitda.changePercent}
                    trend={trendOf(kpis.ebitda)}
                    icon={TrendingUp}
                    format="currency"
                    historico={historico.map((h) => h.ebitdaEur)}
                />
                <KpiCard
                    title="Cash Disponible"
                    value={kpis.cashDisponible.value}
                    change={kpis.cashDisponible.changePercent}
                    trend={trendOf(kpis.cashDisponible)}
                    icon={Wallet}
                    format="currency"
                    historico={historico.map((h) => h.cashAvailableEur)}
                />
                <KpiCard
                    title="Coste Operativo"
                    value={kpis.costeOperativo.value}
                    change={kpis.costeOperativo.changePercent}
                    trend={trendOf(kpis.costeOperativo)}
                    icon={Banknote}
                    format="currency"
                    historico={historico.map((h) => h.operatingCostEur)}
                />
            </div>

            <div className="grid gap-4 md:grid-cols-7">
                {/* Gráfico de tendencia */}
                <Card className="md:col-span-4">
                    <CardHeader>
                        <CardTitle>Evolución Financiera</CardTitle>
                        <CardDescription>
                            Facturación real vs objetivo por periodo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <SimpleAreaChart
                            data={historico.map((h) => ({
                                period: h.period,
                                "Facturación": h.revenueEur,
                                "Objetivo": h.targetRevenueEur,
                            }))}
                            index="period"
                            categories={["Facturación", "Objetivo"]}
                            colors={["hsl(var(--primary))", "hsl(var(--muted-foreground))"]}
                        />
                    </CardContent>
                </Card>

                {/* Semáforos globales */}
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Estado de la Empresa</CardTitle>
                        <CardDescription>
                            Visión instantánea por área crítica.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-5 py-2">
                            {(Object.keys(semaforos) as Array<keyof typeof semaforos>).map((key) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between p-3 rounded-lg border bg-card/50"
                                >
                                    <span className="text-sm font-medium">
                                        {semaforoLabels[key]}
                                    </span>
                                    <Semaforo
                                        status={semaforos[key]}
                                        size="lg"
                                        pulse={semaforos[key] === "rojo"}
                                    />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tarjetas secundarias */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="Margen / Operación"
                    value={kpis.margenPorOperacion.value}
                    change={kpis.margenPorOperacion.changePercent}
                    trend={trendOf(kpis.margenPorOperacion)}
                    icon={PiggyBank}
                    format="currency"
                />
                
                <KpiCard
                    title="Operaciones"
                    value={operaciones.activas}
                    sub={`activas · ${operaciones.cerradasMes} cerradas este mes`}
                    icon={Building2}
                    format="raw"
                />
                
                <KpiCard
                    title="Equipo Comercial"
                    value={equipo.comercialesActivos}
                    sub={`comerciales · carga media ${equipo.cargaMedia.toFixed(0)}%`}
                    icon={Users}
                    format="raw"
                />
                
                <KpiCard
                    title="Alertas Abiertas"
                    value={equipo.alertasAbiertas}
                    sub="sin resolver en el equipo"
                    icon={Activity}
                    format="raw"
                    highlight={equipo.alertasAbiertas > 5 ? "red" : equipo.alertasAbiertas > 0 ? "amber" : "green"}
                />
            </div>

            {/* Facturación trimestral + reinversión */}
            <div className="grid gap-4 md:grid-cols-2">
                <KpiCard
                    title="Facturación Trimestral"
                    value={kpis.facturacionTrimestral.value}
                    sub="últimos 3 meses acumulados"
                    icon={DollarSign}
                    format="currency"
                />
                
                <KpiCard
                    title="Capacidad de Reinversión"
                    value={kpis.capacidadReinversion.value}
                    change={kpis.capacidadReinversion.changePercent}
                    trend={trendOf(kpis.capacidadReinversion)}
                    icon={Banknote}
                    format="currency"
                />
            </div>
        </div>
    );
}
