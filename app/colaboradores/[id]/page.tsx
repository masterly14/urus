"use client";

import { use } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    MapPin,
    Briefcase,
    Clock,
    TrendingUp,
    TrendingDown,
    Star,
    CheckCircle2,
    AlertTriangle,
    Target,
    Wrench,
    BarChart3,
    Award,
    Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SlaIndicator, estadoConfig } from "@/components/colaboradores/sla-indicator";
import { SparklineChart } from "@/components/dashboard/sparkline-chart";
import { colaboradores } from "@/lib/mock-data/colaboradores";
import type { EstadoColaborador } from "@/lib/mock-data/types";

function getScoreColor(score: number): string {
    if (score >= 80) return "var(--urus-success)";
    if (score >= 60) return "var(--urus-warning)";
    return "var(--urus-danger)";
}

function getScoreLabel(score: number): string {
    if (score >= 90) return "Excelente";
    if (score >= 80) return "Muy Bueno";
    if (score >= 70) return "Bueno";
    if (score >= 60) return "Aceptable";
    if (score >= 40) return "Necesita Mejorar";
    return "Crítico";
}

// Simulated associated operations
function generateOperations(id: string, count: number) {
    const states = ["Completada", "En progreso", "Pendiente"];
    const addresses = [
        "Calle Mayor 12, 3ºA",
        "Av. Constitución 45",
        "Pl. Ayuntamiento 7",
        "Calle Colón 23",
        "Blasco Ibáñez 62",
        "Calle Ruzafa 15",
        "Av. Francia 20",
        "Camino de Vera 100",
    ];
    return Array.from({ length: Math.min(count, 8) }, (_, i) => ({
        id: `op-${id}-${i}`,
        address: addresses[i % addresses.length],
        price: 150000 + Math.floor(Math.random() * 500000),
        state: states[i < count * 0.6 ? 0 : i < count * 0.9 ? 1 : 2],
        date: new Date(2026, 1, 12 - i * 3).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
    }));
}

// Response time data (simulated)
const responseTimeMonths = ["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"];

export default function ColaboradorDetallePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const collab = colaboradores.find((c) => c.id === resolvedParams.id);

    if (!collab) {
        return (
            <div className="space-y-6">
                <Link href="/colaboradores" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                    Volver a Colaboradores
                </Link>
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <p className="text-lg font-semibold mb-2">Colaborador no encontrado</p>
                        <p className="text-sm text-muted-foreground">El colaborador solicitado no existe.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const scoreColor = getScoreColor(collab.score);
    const scoreLabel = getScoreLabel(collab.score);
    const operations = generateOperations(collab.id, collab.operaciones);
    const trend = collab.tendenciaMensual;
    const trendDir = trend[trend.length - 1] - trend[0];

    // Find average for the same type
    const sameType = colaboradores.filter((c) => c.tipo === collab.tipo);
    const avgScoreType = Math.round(sameType.reduce((s, c) => s + c.score, 0) / sameType.length);
    const avgSlaType = +(sameType.reduce((s, c) => s + c.slaReal, 0) / sameType.length).toFixed(1);
    const avgOpsType = Math.round(sameType.reduce((s, c) => s + c.operaciones, 0) / sameType.length);

    // Score gauge angle
    const scoreAngle = (collab.score / 100) * 180;

    return (
        <div className="space-y-6">
            {/* Back */}
            <Link
                href="/colaboradores"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                Volver a Colaboradores
            </Link>

            {/* Header Card */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                <div
                    className="h-1.5"
                    style={{ backgroundColor: estadoConfig[collab.estado].color }}
                />
                <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                        <div className="space-y-3 flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="h-12 w-12 rounded-xl bg-accent/40 flex items-center justify-center text-lg font-bold text-secondary">
                                    {collab.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold tracking-tight">{collab.nombre}</h1>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-[10px]">{collab.tipo}</Badge>
                                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                            <MapPin className="h-3 w-3" /> {collab.ciudad}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Wrench className="h-3.5 w-3.5 shrink-0" />
                                {collab.especialidad}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</p>
                                    <p className="text-lg font-bold font-mono" style={{ color: scoreColor }}>{collab.score}/100</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Operaciones</p>
                                    <p className="text-lg font-bold font-mono">{collab.operaciones}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA</p>
                                    <p className="text-lg font-bold font-mono">{collab.slaReal}d<span className="text-sm font-normal text-muted-foreground"> / {collab.slaEsperado}d</span></p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estado</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        {(() => {
                                            const Icon = estadoConfig[collab.estado].icon;
                                            return <Icon className="h-4 w-4" style={{ color: estadoConfig[collab.estado].color }} />;
                                        })()}
                                        <span className="text-sm font-medium" style={{ color: estadoConfig[collab.estado].color }}>
                                            {estadoConfig[collab.estado].label}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Score + SLA + Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Score Gauge */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Score de Rendimiento</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 flex flex-col items-center">
                        {/* Radial gauge */}
                        <svg width="180" height="110" viewBox="0 0 180 110">
                            <defs>
                                <linearGradient id={`score-bg-${collab.id}`} x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="var(--urus-danger)" stopOpacity="0.15" />
                                    <stop offset="50%" stopColor="var(--urus-warning)" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="var(--urus-success)" stopOpacity="0.15" />
                                </linearGradient>
                            </defs>
                            {/* Background arc */}
                            <path
                                d="M 15 100 A 75 75 0 0 1 165 100"
                                fill="none"
                                stroke={`url(#score-bg-${collab.id})`}
                                strokeWidth="14"
                                strokeLinecap="round"
                            />
                            {/* Score arc */}
                            <path
                                d="M 15 100 A 75 75 0 0 1 165 100"
                                fill="none"
                                stroke={scoreColor}
                                strokeWidth="14"
                                strokeLinecap="round"
                                strokeDasharray={`${(scoreAngle / 180) * 236} 236`}
                                style={{ transition: "stroke-dasharray 1s ease" }}
                            />
                            <text
                                x="90"
                                y="85"
                                textAnchor="middle"
                                className="text-2xl font-bold font-mono"
                                fill={scoreColor}
                            >
                                {collab.score}
                            </text>
                            <text
                                x="90"
                                y="105"
                                textAnchor="middle"
                                className="text-[11px]"
                                fill="currentColor"
                                opacity="0.5"
                            >
                                {scoreLabel}
                            </text>
                        </svg>

                        {/* Trend */}
                        <div className="flex items-center gap-2 mt-3">
                            {trendDir > 0 ? (
                                <TrendingUp className="h-3.5 w-3.5 text-[var(--urus-success)]" />
                            ) : (
                                <TrendingDown className="h-3.5 w-3.5 text-[var(--urus-danger)]" />
                            )}
                            <span className="text-xs text-muted-foreground">
                                Tendencia: <span className={trendDir > 0 ? "text-[var(--urus-success)] font-semibold" : "text-[var(--urus-danger)] font-semibold"}>
                                    {trendDir > 0 ? "+" : ""}{trendDir} pts
                                </span> en 6 meses
                            </span>
                        </div>
                        <SparklineChart
                            data={trend}
                            color={scoreColor}
                            width={160}
                            height={35}
                            className="mt-2"
                        />
                    </CardContent>
                </Card>

                {/* SLA Detail */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-[var(--urus-info)]" />
                            <CardTitle className="text-sm font-semibold">Métricas de SLA</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        <SlaIndicator
                            slaEsperado={collab.slaEsperado}
                            slaReal={collab.slaReal}
                            estado={collab.estado}
                        />

                        {/* SLA breakdown */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">SLA Esperado</span>
                                <span className="text-sm font-mono font-medium">{collab.slaEsperado} días</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">SLA Real (media)</span>
                                <span className="text-sm font-mono font-medium" style={{ color: estadoConfig[collab.estado].color }}>
                                    {collab.slaReal} días
                                </span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">Desviación</span>
                                <span className={`text-sm font-mono font-bold ${collab.slaReal <= collab.slaEsperado ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                    {collab.slaReal <= collab.slaEsperado ? "" : "+"}{collab.slaReal - collab.slaEsperado} días
                                </span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-xs text-muted-foreground">Tasa cumplimiento</span>
                                <span className="text-sm font-mono font-bold" style={{ color: collab.slaReal <= collab.slaEsperado ? "var(--urus-success)" : "var(--urus-danger)" }}>
                                    {collab.slaReal <= collab.slaEsperado ? "100" : Math.round((collab.slaEsperado / collab.slaReal) * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* Simulated monthly response time */}
                        <div className="pt-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Tiempo respuesta mensual</p>
                            <div className="flex items-end gap-1.5 h-[60px]">
                                {responseTimeMonths.map((month, i) => {
                                    const val = collab.tendenciaMensual[i] || 50;
                                    const heightPct = val;
                                    return (
                                        <div key={month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                                            <div
                                                className="w-full rounded-t-md transition-all duration-300 group-hover:brightness-125"
                                                style={{
                                                    height: `${heightPct}%`,
                                                    backgroundColor: `color-mix(in oklch, ${scoreColor} ${30 + i * 10}%, transparent)`,
                                                    minHeight: "4px",
                                                }}
                                            />
                                            <span className="text-[8px] text-muted-foreground">{month}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Cross-comparison vs type average */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-[var(--urus-gold)]" />
                            <CardTitle className="text-sm font-semibold">Comparativa vs Media</CardTitle>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Comparado con otros <span className="font-medium">{collab.tipo}</span> ({sameType.length} total)
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-5">
                        {/* Score comparison */}
                        {[
                            { label: "Score", value: collab.score, avg: avgScoreType, max: 100, suffix: "pts" },
                            { label: "SLA Real", value: collab.slaReal, avg: avgSlaType, max: Math.max(collab.slaReal, avgSlaType) * 1.3, suffix: "d", lowerIsBetter: true },
                            { label: "Operaciones", value: collab.operaciones, avg: avgOpsType, max: Math.max(collab.operaciones, avgOpsType) * 1.3, suffix: "" },
                        ].map((metric) => {
                            const isGood = metric.lowerIsBetter
                                ? metric.value <= metric.avg
                                : metric.value >= metric.avg;
                            return (
                                <div key={metric.label} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium">{metric.label}</span>
                                        <span className={`text-xs font-mono font-bold ${isGood ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                            {metric.value}{metric.suffix}
                                        </span>
                                    </div>
                                    {/* Dual bar */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-muted-foreground w-12 shrink-0">Propio</span>
                                            <div className="flex-1 h-3 rounded-full bg-accent/20 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${(metric.value / metric.max) * 100}%`,
                                                        backgroundColor: isGood ? "var(--urus-success)" : "var(--urus-gold)",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-muted-foreground w-12 shrink-0">Media</span>
                                            <div className="flex-1 h-3 rounded-full bg-accent/20 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700 opacity-40"
                                                    style={{
                                                        width: `${(metric.avg / metric.max) * 100}%`,
                                                        backgroundColor: "oklch(0.6 0 0)",
                                                    }}
                                                />
                                            </div>
                                            <span className="text-[9px] text-muted-foreground font-mono w-8 text-right">{metric.avg}{metric.suffix}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Rank within type */}
                        <div className="rounded-xl p-3 bg-accent/20 border border-border/30 mt-2">
                            <div className="flex items-center gap-2">
                                <Award className="h-4 w-4 text-[var(--urus-gold)]" />
                                <div>
                                    <p className="text-xs font-medium">
                                        Posición dentro de {collab.tipo}
                                    </p>
                                    <p className="text-sm font-bold font-mono mt-0.5">
                                        #{sameType.sort((a, b) => b.score - a.score).findIndex((c) => c.id === collab.id) + 1}
                                        <span className="text-muted-foreground font-normal text-xs"> de {sameType.length}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Operations Table */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Operaciones Asociadas</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                            {collab.operaciones} operaciones
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Dirección</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estado</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Fecha</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {operations.map((op) => {
                                    const stateColor = op.state === "Completada"
                                        ? "var(--urus-success)"
                                        : op.state === "En progreso"
                                            ? "var(--urus-warning)"
                                            : "var(--urus-info)";
                                    return (
                                        <tr key={op.id} className="hover:bg-accent/20 transition-colors">
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    <span className="text-sm">{op.address}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <span className="text-sm font-mono font-medium">{op.price.toLocaleString("es-ES")} €</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className="text-[9px]"
                                                    style={{
                                                        borderColor: `color-mix(in oklch, ${stateColor} 40%, transparent)`,
                                                        color: stateColor,
                                                        backgroundColor: `color-mix(in oklch, ${stateColor} 8%, transparent)`,
                                                    }}
                                                >
                                                    {op.state}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{op.date}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
