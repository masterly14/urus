"use client";

import { useState } from "react";
import {
    Brain,
    BarChart3,
    Users,
    Clock,
    TrendingUp,
    TrendingDown,
    Activity,
    Target,
    Award,
    Calendar,
    Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CoachMetricsTable } from "@/components/coach/coach-metrics";
import { SparklineChart } from "@/components/dashboard/sparkline-chart";
import { comerciales } from "@/lib/mock-data/comerciales";

// ── Monthly usage data (simulated) ───────────────────────────

const monthlyUsageData = [
    { month: "Sep", sessions: 45 },
    { month: "Oct", sessions: 62 },
    { month: "Nov", sessions: 78 },
    { month: "Dic", sessions: 55 },
    { month: "Ene", sessions: 88 },
    { month: "Feb", sessions: 95 },
];

const maxMonthly = Math.max(...monthlyUsageData.map((d) => d.sessions));

// ── Daily trend (last 14 days) ───────────────────────────────

const dailyTrend = [8, 12, 15, 10, 18, 22, 5, 14, 16, 20, 13, 17, 19, 21];

// ── Topic distribution ───────────────────────────────────────

const topicDistribution = [
    { topic: "Motivación", percentage: 35, color: "var(--urus-success)", emoji: "💪" },
    { topic: "Gestión del Estrés", percentage: 28, color: "var(--urus-warning)", emoji: "🧘" },
    { topic: "Técnicas de Cierre", percentage: 22, color: "var(--urus-info)", emoji: "🎯" },
    { topic: "Desarrollo Personal", percentage: 15, color: "var(--urus-gold)", emoji: "🌟" },
];

// ── Satisfaction metrics ─────────────────────────────────────

const satisfactionData = {
    overall: 4.6,
    responses: 892,
    helpful: 87,
    returnRate: 78,
};

// ── Engagement hourly distribution ───────────────────────────

const hourlyDistribution = [
    { hour: "7-8", value: 5 },
    { hour: "8-9", value: 15 },
    { hour: "9-10", value: 28 },
    { hour: "10-11", value: 22 },
    { hour: "11-12", value: 18 },
    { hour: "12-13", value: 8 },
    { hour: "13-14", value: 4 },
    { hour: "14-15", value: 12 },
    { hour: "15-16", value: 20 },
    { hour: "16-17", value: 25 },
    { hour: "17-18", value: 15 },
    { hour: "18-19", value: 8 },
];

const maxHourly = Math.max(...hourlyDistribution.map((d) => d.value));

export default function CoachMetricasPage() {
    const [period, setPeriod] = useState<"semana" | "mes" | "trimestre">("mes");

    const totalSessions = comerciales.reduce((s, c) => s + c.sesionesCoach, 0);
    const avgSessionDuration = 12; // minutes (simulated)
    const totalMinutes = totalSessions * avgSessionDuration;
    const hoursSpent = Math.round(totalMinutes / 60);

    const sortedByUsage = [...comerciales].sort((a, b) => b.sesionesCoach - a.sesionesCoach);
    const topUser = sortedByUsage[0];
    const leastUser = sortedByUsage[sortedByUsage.length - 1];

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
                {/* Period selector */}
                <div className="flex items-center gap-1 bg-accent/30 rounded-xl p-1 border border-border/30">
                    {(["semana", "mes", "trimestre"] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${period === p
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Top KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Sesiones</p>
                                <p className="text-2xl font-bold font-mono">{totalSessions}</p>
                                <div className="flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3 text-[var(--urus-success)]" />
                                    <span className="text-xs text-[var(--urus-success)]">+23% vs anterior</span>
                                </div>
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
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tiempo Total</p>
                                <p className="text-2xl font-bold font-mono">{hoursSpent}h</p>
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{avgSessionDuration} min/sesión</span>
                                </div>
                            </div>
                            <div className="rounded-lg bg-secondary/15 p-2.5">
                                <Clock className="h-4 w-4 text-secondary" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Satisfacción</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-2xl font-bold font-mono">{satisfactionData.overall}</p>
                                    <span className="text-sm text-muted-foreground">/5</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    {Array.from({ length: 5 }, (_, i) => (
                                        <span
                                            key={i}
                                            className="text-xs"
                                            style={{
                                                opacity: i < Math.round(satisfactionData.overall) ? 1 : 0.2,
                                            }}
                                        >
                                            ★
                                        </span>
                                    ))}
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
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tasa Retorno</p>
                                <p className="text-2xl font-bold font-mono">{satisfactionData.returnRate}%</p>
                                <div className="flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3 text-[var(--urus-success)]" />
                                    <span className="text-xs text-[var(--urus-success)]">+5% vs anterior</span>
                                </div>
                            </div>
                            <div className="rounded-lg bg-[var(--urus-warning)]/15 p-2.5">
                                <Target className="h-4 w-4 text-[var(--urus-warning)]" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Monthly Trend */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Evolución Mensual de Uso</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px]">Últimos 6 meses</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-end gap-3 h-[200px] pt-4">
                            {monthlyUsageData.map((d, i) => {
                                const heightPct = (d.sessions / maxMonthly) * 100;
                                const isLast = i === monthlyUsageData.length - 1;
                                return (
                                    <div key={d.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
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
                                            {/* Shine effect */}
                                            <div
                                                className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity"
                                                style={{
                                                    background: "linear-gradient(135deg, white 0%, transparent 50%)",
                                                }}
                                            />
                                        </div>
                                        <span className="text-[11px] text-muted-foreground font-medium">{d.month}</span>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Trend line overlay */}
                        <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "var(--urus-info)" }} />
                                    <span className="text-[11px] text-muted-foreground">Sesiones regulares</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "var(--urus-gold)" }} />
                                    <span className="text-[11px] text-muted-foreground">Mes actual</span>
                                </div>
                            </div>
                            <span className="text-xs font-semibold text-[var(--urus-success)]">
                                +111% en 6 meses
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Topic Distribution */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-[var(--urus-info)]" />
                            <CardTitle className="text-sm font-semibold">Temas más Consultados</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-4">
                            {topicDistribution.map((t) => (
                                <div key={t.topic} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">{t.emoji}</span>
                                            <span className="text-sm font-medium">{t.topic}</span>
                                        </div>
                                        <span className="text-xs font-semibold font-mono" style={{ color: t.color }}>
                                            {t.percentage}%
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-accent/30 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000"
                                            style={{
                                                width: `${t.percentage}%`,
                                                background: `linear-gradient(90deg, ${t.color}, color-mix(in oklch, ${t.color} 60%, transparent))`,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Engagement metrics */}
                        <div className="mt-6 pt-4 border-t border-border/30 grid grid-cols-2 gap-3">
                            <div className="text-center p-2 rounded-lg bg-accent/20">
                                <p className="text-lg font-bold font-mono">{satisfactionData.helpful}%</p>
                                <p className="text-[10px] text-muted-foreground">Respuestas útiles</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-accent/20">
                                <p className="text-lg font-bold font-mono">{satisfactionData.responses}</p>
                                <p className="text-[10px] text-muted-foreground">Interacciones</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Hourly Distribution + Highlights */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Hourly Distribution */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Distribución por Horario</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-end gap-1.5 h-[140px] pt-2">
                            {hourlyDistribution.map((d) => {
                                const heightPct = (d.value / maxHourly) * 100;
                                const isHigh = d.value >= maxHourly * 0.8;
                                return (
                                    <div key={d.hour} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                                        <span className="text-[9px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                            {d.value}%
                                        </span>
                                        <div
                                            className="w-full rounded-t-md transition-all duration-300 group-hover:brightness-125"
                                            style={{
                                                height: `${heightPct}%`,
                                                background: isHigh
                                                    ? "linear-gradient(to top, var(--urus-gold), color-mix(in oklch, var(--urus-gold) 50%, transparent))"
                                                    : "linear-gradient(to top, oklch(0.4 0 0 / 40%), oklch(0.4 0 0 / 15%))",
                                                minHeight: "4px",
                                            }}
                                        />
                                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">{d.hour}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                                Pico de uso: <span className="font-semibold text-foreground">9:00 - 10:00</span> y <span className="font-semibold text-foreground">16:00 - 17:00</span>
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Highlights */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Award className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Destacados</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Top User */}
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
                                    {topUser.sesionesCoach} sesiones
                                </Badge>
                            </div>
                        </div>

                        {/* Least User */}
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
                                    {leastUser.sesionesCoach} sesiones
                                </Badge>
                            </div>
                        </div>

                        {/* Daily Trend */}
                        <div className="rounded-xl p-3 bg-accent/20 border border-border/30">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground">Tendencia 14 días</span>
                                <TrendingUp className="h-3 w-3 text-[var(--urus-success)]" />
                            </div>
                            <SparklineChart
                                data={dailyTrend}
                                color="var(--urus-gold)"
                                width={250}
                                height={40}
                                className="w-full"
                            />
                        </div>

                        {/* Insight */}
                        <div className="rounded-xl p-3 bg-gradient-to-br from-[var(--urus-info)]/5 to-transparent border border-[var(--urus-info)]/15">
                            <div className="flex gap-2">
                                <Brain className="h-4 w-4 text-[var(--urus-info)] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-medium text-[var(--urus-info)]">Insight IA</p>
                                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                        Los comerciales que usan el coach ≥15 sesiones/mes tienen un 23% más de cierre.
                                        Recomendación: incentivar uso en comerciales con &lt;8 sesiones.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Full metrics table */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
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
    );
}
