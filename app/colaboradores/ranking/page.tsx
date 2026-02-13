"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    Trophy,
    Medal,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    ArrowLeft,
    Download,
    Users,
    BarChart3,
    Filter,
    MapPin,
    Star,
    Clock,
    Briefcase,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SparklineChart } from "@/components/dashboard/sparkline-chart";
import { colaboradores } from "@/lib/mock-data/colaboradores";

function getScoreColor(score: number): string {
    if (score >= 80) return "var(--urus-success)";
    if (score >= 60) return "var(--urus-warning)";
    return "var(--urus-danger)";
}

const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
const medalEmojis = ["🥇", "🥈", "🥉"];

type SortField = "score" | "sla" | "operaciones";

export default function RankingPage() {
    const [sortField, setSortField] = useState<SortField>("score");

    const sorted = useMemo(() => {
        return [...colaboradores].sort((a, b) => {
            switch (sortField) {
                case "score":
                    return b.score - a.score;
                case "sla": {
                    const aDiff = a.slaReal - a.slaEsperado;
                    const bDiff = b.slaReal - b.slaEsperado;
                    return aDiff - bDiff; // lower is better
                }
                case "operaciones":
                    return b.operaciones - a.operaciones;
                default:
                    return 0;
            }
        });
    }, [sortField]);

    const top3 = sorted.slice(0, 3);
    const bottom3 = [...sorted].reverse().slice(0, 3);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--urus-gold)]/20 to-[var(--urus-gold)]/5 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-[var(--urus-gold)]" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Rankings de Colaboradores</h1>
                        <p className="text-sm text-muted-foreground">
                            Clasificación por rendimiento, SLA y volumen de operaciones
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/colaboradores">
                        <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                            <ArrowLeft className="h-3 w-3" />
                            Volver
                        </Button>
                    </Link>
                    <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                        <Download className="h-3 w-3" />
                        Exportar
                    </Button>
                </div>
            </div>

            {/* Top 3 + Bottom 3 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* TOP 3 */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Medal className="h-4 w-4 text-[var(--urus-gold)]" />
                            <CardTitle className="text-sm font-semibold">Top 3 Destacados</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                        {top3.map((c, i) => {
                            const trend = c.tendenciaMensual;
                            const trendDir = trend[trend.length - 1] - trend[0];
                            return (
                                <Link key={c.id} href={`/colaboradores/${c.id}`}>
                                    <div
                                        className="rounded-xl p-4 border transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                                        style={{
                                            borderColor: `color-mix(in oklch, ${medalColors[i]} 30%, transparent)`,
                                            backgroundColor: `color-mix(in oklch, ${medalColors[i]} 4%, transparent)`,
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="text-2xl">{medalEmojis[i]}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold truncate">{c.nombre}</p>
                                                    <Badge variant="outline" className="text-[9px] shrink-0">{c.tipo}</Badge>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">{c.especialidad}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xl font-bold font-mono" style={{ color: getScoreColor(c.score) }}>
                                                    {c.score}
                                                </p>
                                                <div className="flex items-center gap-1 justify-end">
                                                    {trendDir > 0 ? (
                                                        <TrendingUp className="h-2.5 w-2.5 text-[var(--urus-success)]" />
                                                    ) : (
                                                        <TrendingDown className="h-2.5 w-2.5 text-[var(--urus-danger)]" />
                                                    )}
                                                    <span className={`text-[9px] font-mono ${trendDir > 0 ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                                        {trendDir > 0 ? "+" : ""}{trendDir}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-2.5 border-t" style={{ borderColor: `color-mix(in oklch, ${medalColors[i]} 15%, transparent)` }}>
                                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                                <span className="flex items-center gap-0.5">
                                                    <Clock className="h-2.5 w-2.5" />
                                                    SLA: {c.slaReal}d/{c.slaEsperado}d
                                                </span>
                                                <span className="flex items-center gap-0.5">
                                                    <Briefcase className="h-2.5 w-2.5" />
                                                    {c.operaciones} ops
                                                </span>
                                                <span className="flex items-center gap-0.5">
                                                    <MapPin className="h-2.5 w-2.5" />
                                                    {c.ciudad}
                                                </span>
                                            </div>
                                            <SparklineChart
                                                data={c.tendenciaMensual}
                                                color={getScoreColor(c.score)}
                                                width={60}
                                                height={18}
                                            />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* BOTTOM 3 */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
                            <CardTitle className="text-sm font-semibold">Bottom 3 — Necesitan Atención</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                        {bottom3.map((c, i) => {
                            const trend = c.tendenciaMensual;
                            const trendDir = trend[trend.length - 1] - trend[0];
                            const diff = c.slaReal - c.slaEsperado;
                            return (
                                <Link key={c.id} href={`/colaboradores/${c.id}`}>
                                    <div className="rounded-xl p-4 border border-[var(--urus-danger)]/15 bg-[var(--urus-danger)]/3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-[var(--urus-danger)]/10 flex items-center justify-center text-sm font-bold text-[var(--urus-danger)]">
                                                #{sorted.length - i}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold truncate">{c.nombre}</p>
                                                    <Badge variant="outline" className="text-[9px] shrink-0">{c.tipo}</Badge>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">{c.especialidad}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xl font-bold font-mono" style={{ color: getScoreColor(c.score) }}>
                                                    {c.score}
                                                </p>
                                                <div className="flex items-center gap-1 justify-end">
                                                    <TrendingDown className="h-2.5 w-2.5 text-[var(--urus-danger)]" />
                                                    <span className="text-[9px] font-mono text-[var(--urus-danger)]">
                                                        {trendDir > 0 ? "+" : ""}{trendDir}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--urus-danger)]/10">
                                            <div className="flex items-center gap-3 text-[10px]">
                                                {diff > 0 && (
                                                    <span className="text-[var(--urus-danger)] font-medium">
                                                        SLA excedido +{diff}d
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-0.5 text-muted-foreground">
                                                    <Briefcase className="h-2.5 w-2.5" />
                                                    {c.operaciones} ops
                                                </span>
                                            </div>
                                            <SparklineChart
                                                data={c.tendenciaMensual}
                                                color="var(--urus-danger)"
                                                width={60}
                                                height={18}
                                            />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>

            {/* Comparativas chart */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Comparativas de Score</CardTitle>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="space-y-3">
                        {sorted.map((c, i) => {
                            const scoreColor = getScoreColor(c.score);
                            return (
                                <div key={c.id} className="flex items-center gap-3 group">
                                    <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
                                        {i + 1}
                                    </span>
                                    <div className="w-[180px] shrink-0 truncate">
                                        <Link href={`/colaboradores/${c.id}`} className="text-sm font-medium hover:text-secondary transition-colors truncate">
                                            {c.nombre}
                                        </Link>
                                    </div>
                                    <div className="flex-1 h-6 rounded-full bg-accent/20 overflow-hidden relative">
                                        <div
                                            className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2 group-hover:brightness-125"
                                            style={{
                                                width: `${c.score}%`,
                                                background: `linear-gradient(90deg, color-mix(in oklch, ${scoreColor} 30%, transparent), ${scoreColor})`,
                                            }}
                                        >
                                            <span className="text-[10px] font-bold font-mono text-white drop-shadow-sm">
                                                {c.score}
                                            </span>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-[9px] w-16 justify-center shrink-0">{c.tipo}</Badge>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Full Ranking Table */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Tabla Ranking Completa</CardTitle>
                        </div>
                        <div className="flex items-center gap-1 bg-accent/30 rounded-xl p-1 border border-border/30">
                            {([
                                { key: "score" as SortField, label: "Score" },
                                { key: "sla" as SortField, label: "SLA" },
                                { key: "operaciones" as SortField, label: "Operaciones" },
                            ]).map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => setSortField(s.key)}
                                    className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all ${sortField === s.key
                                            ? "bg-card text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium w-12">#</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Colaborador</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tipo</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Score</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">SLA</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Ops</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tendencia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {sorted.map((c, i) => {
                                    const scoreColor = getScoreColor(c.score);
                                    const trend = c.tendenciaMensual;
                                    const trendDir = trend[trend.length - 1] - trend[0];
                                    const diff = c.slaReal - c.slaEsperado;
                                    return (
                                        <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                                            <td className="px-3 py-3 text-center">
                                                {i < 3 ? (
                                                    <span className="text-base">{medalEmojis[i]}</span>
                                                ) : (
                                                    <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                <Link href={`/colaboradores/${c.id}`} className="flex items-center gap-2 hover:text-secondary transition-colors">
                                                    <div className="h-7 w-7 rounded-lg bg-accent/40 flex items-center justify-center text-[9px] font-bold text-secondary shrink-0">
                                                        {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate">{c.nombre}</p>
                                                        <p className="text-[10px] text-muted-foreground">{c.ciudad}</p>
                                                    </div>
                                                </Link>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <Badge variant="outline" className="text-[9px]">{c.tipo}</Badge>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{c.score}</span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <span className="text-xs font-mono">{c.slaReal}d/{c.slaEsperado}d</span>
                                                    {diff > 0 && (
                                                        <span className="text-[9px] text-[var(--urus-danger)]">+{diff}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="text-xs font-mono">{c.operaciones}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <SparklineChart
                                                        data={c.tendenciaMensual}
                                                        color={scoreColor}
                                                        width={55}
                                                        height={18}
                                                    />
                                                    {trendDir > 0 ? (
                                                        <TrendingUp className="h-3 w-3 text-[var(--urus-success)]" />
                                                    ) : (
                                                        <TrendingDown className="h-3 w-3 text-[var(--urus-danger)]" />
                                                    )}
                                                </div>
                                            </td>
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
