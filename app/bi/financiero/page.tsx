"use client";

import { useState } from "react";
import {
    ArrowDownRight,
    ArrowUpRight,
    TrendingDown,
    TrendingUp,
    AlertTriangle,
    Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KPICard } from "@/components/bi/kpi-card";
import { SimpleAreaChart } from "@/components/bi/charts";
import { financialData } from "@/lib/mock-data/bi";
import { cn } from "@/lib/utils";

export default function FinancialDashboard() {
    const [thresholds, setThresholds] = useState({
        revenue: 100000,
        ebitda: 30000,
    });

    const currentMonth = financialData[financialData.length - 1];
    const lastMonth = financialData[financialData.length - 2];

    const revenueChange = ((currentMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100;
    const ebitdaChange = ((currentMonth.ebitda - lastMonth.ebitda) / lastMonth.ebitda) * 100;
    const cashFlowChange = ((currentMonth.cashFlow - lastMonth.cashFlow) / lastMonth.cashFlow) * 100;
    const costChange = ((currentMonth.operatingCost - lastMonth.operatingCost) / lastMonth.operatingCost) * 100;

    // Determine Financial Health (Traffic Light)
    const healthScore =
        (currentMonth.revenue > thresholds.revenue ? 1 : 0) +
        (currentMonth.ebitda > thresholds.ebitda ? 1 : 0) +
        (currentMonth.cashFlow > 0 ? 1 : 0);

    const healthStatus = healthScore === 3 ? "healthy" : healthScore === 2 ? "warning" : "critical";

    return (
        <div className="space-y-6">
            {/* Financial Health Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Facturación Mensual"
                    value={`€${currentMonth.revenue.toLocaleString()}`}
                    trend={parseFloat(revenueChange.toFixed(1))}
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <KPICard
                    title="EBITDA"
                    value={`€${currentMonth.ebitda.toLocaleString()}`}
                    trend={parseFloat(ebitdaChange.toFixed(1))}
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <KPICard
                    title="Cash Flow Neto"
                    value={`€${currentMonth.cashFlow.toLocaleString()}`}
                    trend={parseFloat(cashFlowChange.toFixed(1))}
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <KPICard
                    title="Coste Operativo"
                    value={`€${currentMonth.operatingCost.toLocaleString()}`}
                    trend={parseFloat(costChange.toFixed(1))}
                    icon={<TrendingDown className="h-4 w-4" />}
                    Description="vs mes anterior"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-7">
                <Card className="md:col-span-4">
                    <CardHeader>
                        <CardTitle>Evolución Financiera</CardTitle>
                        <CardDescription>
                            Comparativa de ingresos vs objetivos semestrales.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <SimpleAreaChart
                            data={financialData}
                            index="period"
                            categories={["revenue", "targetRevenue"]}
                            colors={["#10b981", "#3b82f6"]}
                        />
                    </CardContent>
                </Card>

                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Salud Financiera Global</CardTitle>
                        <CardDescription>Estado actual basado en KPIs críticos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center space-y-4 py-6">
                            <div
                                className={cn(
                                    "w-32 h-32 rounded-full flex items-center justify-center text-4xl shadow-lg transition-colors border-8",
                                    healthStatus === "healthy"
                                        ? "bg-emerald-100 text-emerald-600 border-emerald-500"
                                        : healthStatus === "warning"
                                            ? "bg-yellow-100 text-yellow-600 border-yellow-500"
                                            : "bg-red-100 text-red-600 border-red-500"
                                )}
                            >
                                {healthStatus === "healthy" ? "🟢" : healthStatus === "warning" ? "🟡" : "🔴"}
                            </div>
                            <div className="text-center space-y-1">
                                <h3 className="font-semibold text-lg">
                                    {healthStatus === "healthy"
                                        ? "Salud Optima"
                                        : healthStatus === "warning"
                                            ? "Precaución"
                                            : "Crítico"}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {healthStatus === "healthy"
                                        ? "Todos los indicadores están en verde."
                                        : healthStatus === "warning"
                                            ? "Revisar costes o facturación estancada."
                                            : "Acción inmediata requerida en flujo de caja."}
                                </p>
                            </div>
                        </div>

                        {/* Threshold Alerts */}
                        {healthStatus !== "healthy" && (
                            <div className="mt-4 p-3 bg-accent/50 rounded-lg text-sm flex gap-3 items-start border border-accent">
                                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-medium">Alertas Activas:</p>
                                    <ul className="list-disc list-inside text-muted-foreground">
                                        {currentMonth.revenue < thresholds.revenue && (
                                            <li>Facturación bajo umbral (€{thresholds.revenue.toLocaleString()})</li>
                                        )}
                                        {currentMonth.ebitda < thresholds.ebitda && (
                                            <li>EBITDA bajo umbral (€{thresholds.ebitda.toLocaleString()})</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
