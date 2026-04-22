"use client";

import { useState, useEffect } from "react";
import {
    Brain,
    Heart,
    MessageCircle,
    Users,
    AlertTriangle,
    TrendingUp,
    Clock,
    ShieldCheck,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StressGauge } from "@/components/coach/stress-gauge";
import { CoachMetricsTable } from "@/components/coach/coach-metrics";
import type {
    CoachDashboardData,
    ComercialCoachStats,
} from "@/lib/dashboard/mental-health/queries";

function energiaToStressPercent(energia: number | null): number {
    if (energia === null) return 50;
    return Math.round(((5 - energia) / 5) * 100);
}

function countByEstres(
    comerciales: ComercialCoachStats[],
    nivel: "bajo" | "medio" | "alto",
): number {
    return comerciales.filter((c) => c.nivelEstres === nivel).length;
}

export default function CoachPage() {
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

    const teamStress = energiaToStressPercent(overview.energiaMediaEquipo);
    const totalSessions = overview.sesionesUltimos30d;
    const activeUsers = overview.comercialesActivos;
    const avgSessions = activeUsers > 0 ? Math.round(totalSessions / activeUsers) : 0;
    const totalAlerts =
        overview.alertasActivas.energy_drop +
        overview.alertasActivas.recurrent_block +
        overview.alertasActivas.overload;

    const needsSupportList = comerciales.filter((c) => c.nivelEstres === "alto");
    const sortedByUsage = [...comerciales].sort((a, b) => b.sesiones30d - a.sesiones30d);

    const maxWeeklySessions = Math.max(...weeklyUsage.map((d) => d.sessions), 1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[var(--urus-info)]/20 to-[var(--urus-info)]/5 flex items-center justify-center">
                            <Brain className="h-5 w-5 text-[var(--urus-info)]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Coach Emocional</h1>
                            <p className="text-sm text-muted-foreground">
                                Estado emocional agregado del equipo y métricas del asistente IA
                            </p>
                        </div>
                    </div>
                </div>
                <Badge variant="outline" className="gap-1.5 text-xs px-3 py-1.5">
                    <ShieldCheck className="h-3 w-3" />
                    Datos anonimizados
                </Badge>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-border/50 transition-all duration-300">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-info)]/15 p-2.5">
                                <MessageCircle className="h-4 w-4 text-[var(--urus-info)]" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Sesiones (30d)</p>
                                <p className="text-2xl font-bold font-mono">{totalSessions}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 transition-all duration-300">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-secondary/15 p-2.5">
                                <TrendingUp className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Promedio/persona</p>
                                <p className="text-2xl font-bold font-mono">{avgSessions}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 transition-all duration-300">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-danger)]/15 p-2.5">
                                <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Alertas Activas</p>
                                <p className="text-2xl font-bold font-mono">{totalAlerts}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 transition-all duration-300">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2.5">
                                <Users className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Usuarios Activos</p>
                                <p className="text-2xl font-bold font-mono">{activeUsers}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content: Gauge + Needs Support + Bar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Stress Gauge */}
                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <Heart className="h-4 w-4 text-[var(--urus-danger)]" />
                            <CardTitle className="text-sm font-semibold">Nivel de Estrés del Equipo</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center pt-2 pb-6">
                        <StressGauge level={teamStress} size={200} />
                        <p className="text-xs text-muted-foreground mt-2">
                            Energía media: {overview.energiaMediaEquipo?.toFixed(1) ?? "—"}/5
                        </p>
                        <div className="grid grid-cols-3 gap-4 mt-4 w-full">
                            {(["bajo", "medio", "alto"] as const).map((nivel) => {
                                const count = countByEstres(comerciales, nivel);
                                const colors = {
                                    bajo: "var(--urus-success)",
                                    medio: "var(--urus-warning)",
                                    alto: "var(--urus-danger)",
                                };
                                return (
                                    <div key={nivel} className="text-center">
                                        <p className="text-lg font-bold font-mono" style={{ color: colors[nivel] }}>
                                            {count}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider capitalize">{nivel}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Needs Support */}
                <Card className="border-border/50">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-[var(--urus-warning)]" />
                                <CardTitle className="text-sm font-semibold">Necesitan Apoyo</CardTitle>
                            </div>
                            {needsSupportList.length > 0 && (
                                <Badge variant="destructive" className="text-[10px] px-2 animate-pulse-soft">
                                    {needsSupportList.length} alerta{needsSupportList.length > 1 ? "s" : ""}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {needsSupportList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <div className="h-12 w-12 rounded-full bg-[var(--urus-success)]/15 flex items-center justify-center mb-3">
                                    <ShieldCheck className="h-6 w-6 text-[var(--urus-success)]" />
                                </div>
                                <p className="text-sm font-medium text-[var(--urus-success)]">Todo en orden</p>
                                <p className="text-xs text-muted-foreground mt-1">No hay comerciales con estrés alto</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {needsSupportList.map((c) => (
                                    <div
                                        key={c.comercialId}
                                        className="flex items-center gap-3 rounded-lg p-3 bg-[var(--urus-danger)]/5 border border-[var(--urus-danger)]/15 hover:bg-[var(--urus-danger)]/10 transition-colors"
                                    >
                                        <div className="h-10 w-10 rounded-full bg-[var(--urus-danger)]/15 flex items-center justify-center text-sm font-bold text-[var(--urus-danger)]">
                                            {c.avatar}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{c.nombre}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-muted-foreground">{c.ciudad}</span>
                                                <span className="text-[10px] text-muted-foreground">·</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {c.sesiones30d} sesiones
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] px-1.5"
                                                style={{
                                                    borderColor: "var(--urus-danger)",
                                                    color: "var(--urus-danger)",
                                                    backgroundColor: `color-mix(in oklch, var(--urus-danger) 10%, transparent)`,
                                                }}
                                            >
                                                Estrés Alto
                                            </Badge>
                                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <Clock className="h-2.5 w-2.5" />
                                                Requiere atención
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Weekly Usage Bar Chart */}
                <Card className="border-border/50">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Uso Semanal del Coach</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-end gap-2 h-[180px] pt-4">
                            {weeklyUsage.map((d) => {
                                const heightPct = (d.sessions / maxWeeklySessions) * 100;
                                const isHighest = d.sessions === maxWeeklySessions;
                                return (
                                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                                        <span className="text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                            {d.sessions}
                                        </span>
                                        <div
                                            className="w-full rounded-t-lg transition-all duration-500 group-hover:opacity-90"
                                            style={{
                                                height: `${heightPct}%`,
                                                background: isHighest
                                                    ? "linear-gradient(to top, var(--urus-gold), color-mix(in oklch, var(--urus-gold) 60%, transparent))"
                                                    : "linear-gradient(to top, var(--urus-info), color-mix(in oklch, var(--urus-info) 40%, transparent))",
                                                minHeight: "8px",
                                            }}
                                        />
                                        <span className="text-[10px] text-muted-foreground font-medium">{d.day}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/30">
                            <span className="text-xs text-muted-foreground">Total semanal</span>
                            <span className="text-sm font-bold font-mono text-secondary">
                                {weeklyUsage.reduce((s, d) => s + d.sessions, 0)} sesiones
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Metrics Table */}
            <Card className="border-border/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Métricas de Uso por Comercial</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-2">
                            {comerciales.length} comerciales
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <CoachMetricsTable comerciales={sortedByUsage} />
                </CardContent>
            </Card>
        </div>
    );
}
