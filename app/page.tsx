"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, TrendingUp, Wallet, Briefcase, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Semaforo } from "@/components/dashboard/semaforo";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { SparklineChart } from "@/components/dashboard/sparkline-chart";
import { useRealTime, randomFluctuation } from "@/lib/hooks/use-real-time";
import { datosFinancieros } from "@/lib/mock-data/financiero";
import { comerciales } from "@/lib/mock-data/comerciales";
import { operaciones } from "@/lib/mock-data/operaciones";
import type { ActivityEvent, DatosFinancieros, SemaforoStatus } from "@/lib/mock-data/types";

// ── Activity event templates ─────────────────────────────────

const eventTemplates = [
    { icon: "match", text: "Nuevo match: Piso Valencia ↔ Cliente García (92%)", type: "success" as const },
    { icon: "contract", text: "Contrato #23 firmado por ambas partes", type: "info" as const },
    { icon: "alert", text: "SLA excedido: Banco Santander en operación #45", type: "warning" as const },
    { icon: "price", text: "Análisis de pricing completado para Calle Colón 23", type: "info" as const },
    { icon: "check", text: "Operación Pl. Ayuntamiento cerrada correctamente", type: "success" as const },
    { icon: "team", text: "Carlos Martínez alcanza récord de conversión", type: "success" as const },
    { icon: "chat", text: "Ana López completó sesión de coaching", type: "info" as const },
    { icon: "alert", text: "Propiedad Gran Vía 8 — 45 días sin llamadas", type: "danger" as const },
    { icon: "award", text: "Notaría López & Asociados: SLA cumplido antes de tiempo", type: "success" as const },
    { icon: "match", text: "3 nuevas demandas cruzan con stock activo", type: "info" as const },
    { icon: "price", text: "Semáforo rojo: Calle Caballeros 30 fuera de mercado", type: "danger" as const },
    { icon: "contract", text: "Nueva versión de contrato generada automáticamente", type: "info" as const },
];

let eventCounter = 0;

function generateEvent(): ActivityEvent {
    const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
    return {
        id: `evt-${++eventCounter}`,
        ...template,
        timestamp: new Date().toISOString(),
    };
}

// ── KPI Mutator ──────────────────────────────────────────────

function mutateKpis(data: DatosFinancieros): DatosFinancieros {
    return {
        facturacion: { ...data.facturacion, valor: randomFluctuation(data.facturacion.valor, 0.5) },
        ebitda: { ...data.ebitda, valor: randomFluctuation(data.ebitda.valor, 0.8) },
        cashFlow: { ...data.cashFlow, valor: randomFluctuation(data.cashFlow.valor, 1) },
        costeOperativo: { ...data.costeOperativo, valor: randomFluctuation(data.costeOperativo.valor, 0.3) },
        operacionesActivas: { ...data.operacionesActivas, valor: data.operacionesActivas.valor },
    };
}

// ── Dashboard Page ───────────────────────────────────────────

export default function DashboardPage() {
    const kpis = useRealTime(datosFinancieros, mutateKpis, 5000);

    // Activity feed
    const [events, setEvents] = useState<ActivityEvent[]>(() =>
        Array.from({ length: 5 }, () => generateEvent())
    );

    useEffect(() => {
        const interval = setInterval(() => {
            setEvents((prev) => [generateEvent(), ...prev].slice(0, 15));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Determine global health
    const healthStatus: SemaforoStatus =
        kpis.cashFlow.variacion >= 0 ? "verde" : kpis.cashFlow.variacion > -5 ? "amarillo" : "rojo";

    // Recent operations (last 5)
    const recentOps = operaciones.slice(0, 5);

    const etapaLabels = ["", "Cierre", "Soporte", "Reputación", "Referidos", "Recaptación"];
    const tipoClienteLabels = { comprador: "Comprador", inversor: "Inversor", vendedor: "Vendedor" };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard Ejecutivo</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Vista en tiempo real del ecosistema URUS Capital
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Semaforo status={healthStatus} size="lg" pulse={healthStatus === "rojo"} label="Salud Global" />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    title="Facturación"
                    value={kpis.facturacion.valor}
                    change={kpis.facturacion.variacion}
                    trend={kpis.facturacion.tendencia}
                    icon={DollarSign}
                    format="currency"
                    historico={kpis.facturacion.historico}
                />
                <KpiCard
                    title="EBITDA"
                    value={kpis.ebitda.valor}
                    change={kpis.ebitda.variacion}
                    trend={kpis.ebitda.tendencia}
                    icon={TrendingUp}
                    format="currency"
                    historico={kpis.ebitda.historico}
                />
                <KpiCard
                    title="Cash Flow"
                    value={kpis.cashFlow.valor}
                    change={kpis.cashFlow.variacion}
                    trend={kpis.cashFlow.tendencia}
                    icon={Wallet}
                    format="currency"
                    historico={kpis.cashFlow.historico}
                />
                <KpiCard
                    title="Operaciones Activas"
                    value={kpis.operacionesActivas.valor}
                    change={kpis.operacionesActivas.variacion}
                    trend={kpis.operacionesActivas.tendencia}
                    icon={Briefcase}
                    format="number"
                    historico={kpis.operacionesActivas.historico}
                />
            </div>

            {/* Second row: Activity + Ops + Team */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Activity Feed */}
                <Card className="lg:col-span-1 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Actividad en Tiempo Real</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <ActivityFeed events={events} maxItems={8} />
                    </CardContent>
                </Card>

                {/* Recent Operations */}
                <Card className="lg:col-span-1 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Operaciones Recientes</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-3">
                            {recentOps.map((op) => (
                                <div
                                    key={op.id}
                                    className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-accent/20 hover:bg-accent/40 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{op.direccion}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {op.precio.toLocaleString("es-ES")} € · {op.comprador}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        <Badge variant="outline" className="text-[10px] px-1.5">
                                            {etapaLabels[op.etapaActual]}
                                        </Badge>
                                        <Badge
                                            variant="secondary"
                                            className="text-[10px] px-1.5"
                                        >
                                            {tipoClienteLabels[op.tipoCliente]}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Team Stress Heatmap */}
                <Card className="lg:col-span-1 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Equipo — Estado Emocional</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-2">
                            {comerciales.map((c) => {
                                const stressColor =
                                    c.nivelEstres === "bajo"
                                        ? "bg-[var(--urus-success)]/15 border-[var(--urus-success)]/30"
                                        : c.nivelEstres === "medio"
                                            ? "bg-[var(--urus-warning)]/15 border-[var(--urus-warning)]/30"
                                            : "bg-[var(--urus-danger)]/15 border-[var(--urus-danger)]/30";
                                const dotColor =
                                    c.nivelEstres === "bajo"
                                        ? "bg-[var(--urus-success)]"
                                        : c.nivelEstres === "medio"
                                            ? "bg-[var(--urus-warning)]"
                                            : "bg-[var(--urus-danger)]";

                                return (
                                    <div
                                        key={c.id}
                                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${stressColor}`}
                                    >
                                        <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium truncate">{c.nombre.split(" ")[0]}</p>
                                            <p className="text-[10px] text-muted-foreground capitalize">{c.nivelEstres}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Third row: Trend Chart */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-secondary" />
                        <CardTitle className="text-sm font-semibold">Facturación — Últimos 12 Meses</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-1">
                        <SparklineChart
                            data={kpis.facturacion.historico}
                            color="var(--urus-gold)"
                            width={800}
                            height={120}
                            className="w-full"
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>Mar 2025</span>
                        <span>Jun 2025</span>
                        <span>Sep 2025</span>
                        <span>Feb 2026</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}