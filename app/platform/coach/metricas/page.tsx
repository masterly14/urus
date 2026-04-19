"use client";

import { useState, useEffect } from "react";
import {
    Brain,
    BarChart3,
    Users,
    Clock,
    TrendingUp,
    Activity,
    Award,
    Calendar,
    Filter,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CoachMetricsTable } from "@/components/coach/coach-metrics";
import type {
    CoachDashboardData,
    FlujoDistribucion,
} from "@/lib/dashboard/mental-health/queries";

const FLUJO_DISPLAY: {
    key: keyof FlujoDistribucion;
    label: string;
    color: string;
    emoji: string;
}[] = [
    { key: "bloqueo", label: "Bloqueo", color: "var(--urus-danger)", emoji: "🧱" },
    { key: "preparacion", label: "Preparación", color: "var(--urus-info)", emoji: "🎯" },
    { key: "descarga", label: "Descarga", color: "var(--urus-warning)", emoji: "🧘" },
    { key: "enfoque", label: "Enfoque", color: "var(--urus-success)", emoji: "💪" },
    { key: "crecimiento", label: "Crecimiento", color: "var(--urus-gold)", emoji: "🌟" },
];

export default function CoachMetricasPage() {
    const [data, setData] = useState<CoachDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/coach/dashboard")
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<{ ok: boolean; data: CoachDashboardData }>;
            })
            .then((body) => setData(body.data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando métricas del Coach…</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-sm text-destructive">Error: {error ?? "Sin datos"}</p>
            </div>
        );
    }

    const { overview, comerciales, weeklyUsage } = data;

    const totalSessions = overview.sesionesUltimos30d;
    const activeUsers = overview.comercialesActivos;
    const totalAlerts =
        overview.alertasActivas.energy_drop +
        overview.alertasActivas.recurrent_block +
        overview.alertasActivas.overload;

    const sortedByUsage = [...comerciales].sort((a, b) => b.sesiones30d - a.sesiones30d);
    const topUser = sortedByUsage[0] ?? null;
    const leastUser = sortedByUsage[sortedByUsage.length - 1] ?? null;

    const flujoTotal = Object.values(overview.flujoDistribucion).reduce((s, v) => s + v, 0);

    const weeklyTotal = weeklyUsage.reduce((s, d) => s + d.sessions, 0);
    const maxWeekly = Math.max(...weeklyUsage.map((d) => d.sessions), 1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--urus-info)]/20 to-[var(--urus-info)]/5 flex items-center justify-center">
                        <BarChart3 className="h-5 w-5 text-[var(--urus-info)]" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Métricas del Coach</h1>
                        <p className="text-sm text-muted-foreground">
                            Análisis detallado de uso y efectividad del asistente IA
                        </p>
                    </div>
                </div>
            </div>

            {/* Top KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Sesiones (30d)</p>
                                <p className="text-2xl font-bold font-mono">{totalSessions}</p>
                            </div>
                            <div className="rounded-lg bg-[var(--urus-info)]/15 p-2.5">
                                <Activity className="h-4 w-4 text-[var(--urus-info)]" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Comerciales Activos</p>
                                <p className="text-2xl font-bold font-mono">{activeUsers}</p>
                            </div>
                            <div className="rounded-lg bg-secondary/15 p-2.5">
                                <Users className="h-4 w-4 text-secondary" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Energía Media</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-2xl font-bold font-mono">
                                        {overview.energiaMediaEquipo?.toFixed(1) ?? "—"}
                                    </p>
                                    <span className="text-sm text-muted-foreground">/5</span>
                                </div>
                            </div>
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2.5">
                                <Award className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Alertas Activas</p>
                                <p className="text-2xl font-bold font-mono">{totalAlerts}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {overview.alertasActivas.energy_drop > 0 && (
                                        <span className="text-[10px] text-[var(--urus-danger)]">
                                            {overview.alertasActivas.energy_drop} energía
                                        </span>
                                    )}
                                    {overview.alertasActivas.recurrent_block > 0 && (
                                        <span className="text-[10px] text-[var(--urus-warning)]">
                                            {overview.alertasActivas.recurrent_block} bloqueo
                                        </span>
                                    )}
                                    {overview.alertasActivas.overload > 0 && (
                                        <span className="text-[10px] text-[var(--urus-danger)]">
                                            {overview.alertasActivas.overload} sobrecarga
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="rounded-lg bg-[var(--urus-warning)]/15 p-2.5">
                                <TrendingUp className="h-4 w-4 text-[var(--urus-warning)]" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Weekly Usage */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Uso Semanal (últimos 7 días)</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px]">{weeklyTotal} sesiones</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-end gap-3 h-[200px] pt-4">
                            {weeklyUsage.map((d, i) => {
                                const heightPct = (d.sessions / maxWeekly) * 100;
                                const isLast = i === weeklyUsage.length - 1;
                                return (
                                    <div key={d.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                        <span className="text-xs font-mono font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                            {d.sessions}
                                        </span>
                                        <div
                                            className="w-full rounded-t-xl transition-all duration-500 relative overflow-hidden group-hover:brightness-110"
                                            style={{
                                                height: `${heightPct}%`,
                                                background: isLast
                                                    ? "linear-gradient(to top, var(--urus-gold), color-mix(in oklch, var(--urus-gold) 50%, transparent))"
                                                    : "linear-gradient(to top, var(--urus-info), color-mix(in oklch, var(--urus-info) 30%, transparent))",
                                                minHeight: "12px",
                                            }}
                                        >
                                            <div
                                                className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity"
                                                style={{
                                                    background: "linear-gradient(135deg, white 0%, transparent 50%)",
                                                }}
                                            />
                                        </div>
                                        <span className="text-[11px] text-muted-foreground font-medium">{d.day}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Flujo Distribution */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-[var(--urus-info)]" />
                            <CardTitle className="text-sm font-semibold">Distribución de Flujos</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-4">
                            {FLUJO_DISPLAY.map((f) => {
                                const count = overview.flujoDistribucion[f.key];
                                const pct = flujoTotal > 0 ? Math.round((count / flujoTotal) * 100) : 0;
                                return (
                                    <div key={f.key} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{f.emoji}</span>
                                                <span className="text-sm font-medium">{f.label}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">{count}</span>
                                                <span className="text-xs font-semibold font-mono" style={{ color: f.color }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="h-2 rounded-full bg-accent/30 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: `linear-gradient(90deg, ${f.color}, color-mix(in oklch, ${f.color} 60%, transparent))`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 pt-4 border-t border-border/30 text-center">
                            <p className="text-lg font-bold font-mono">{flujoTotal}</p>
                            <p className="text-[10px] text-muted-foreground">Sesiones con flujo registrado</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Highlights + Table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Highlights */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Award className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Destacados</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {topUser && (
                            <div className="rounded-xl p-3 bg-gradient-to-br from-[var(--urus-success)]/10 to-transparent border border-[var(--urus-success)]/15">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-[var(--urus-success)]/15 flex items-center justify-center text-sm font-bold text-[var(--urus-success)]">
                                        {topUser.avatar}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{topUser.nombre}</p>
                                        <p className="text-[11px] text-muted-foreground">Mayor uso del Coach</p>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                        style={{
                                            borderColor: "var(--urus-success)",
                                            color: "var(--urus-success)",
                                        }}
                                    >
                                        {topUser.sesiones30d} sesiones
                                    </Badge>
                                </div>
                            </div>
                        )}

                        {leastUser && leastUser !== topUser && (
                            <div className="rounded-xl p-3 bg-gradient-to-br from-[var(--urus-danger)]/10 to-transparent border border-[var(--urus-danger)]/15">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-[var(--urus-danger)]/15 flex items-center justify-center text-sm font-bold text-[var(--urus-danger)]">
                                        {leastUser.avatar}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{leastUser.nombre}</p>
                                        <p className="text-[11px] text-muted-foreground">Menor uso del Coach</p>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                        style={{
                                            borderColor: "var(--urus-danger)",
                                            color: "var(--urus-danger)",
                                        }}
                                    >
                                        {leastUser.sesiones30d} sesiones
                                    </Badge>
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl p-3 bg-gradient-to-br from-[var(--urus-info)]/5 to-transparent border border-[var(--urus-info)]/15">
                            <div className="flex gap-2">
                                <Brain className="h-4 w-4 text-[var(--urus-info)] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-medium text-[var(--urus-info)]">Insight</p>
                                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                        {activeUsers} comerciales usaron el coach en los últimos 30 días
                                        con un promedio de {activeUsers > 0 ? Math.round(totalSessions / activeUsers) : 0} sesiones
                                        y energía media de {overview.energiaMediaEquipo?.toFixed(1) ?? "—"}/5.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Full metrics table */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Detalle por Comercial</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px] px-2 gap-1">
                                <Filter className="h-2.5 w-2.5" />
                                {comerciales.length} comerciales
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <CoachMetricsTable comerciales={sortedByUsage} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
