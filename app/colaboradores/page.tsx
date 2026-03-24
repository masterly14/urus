"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Users,
    Filter,
    Clock,
    AlertTriangle,
    CheckCircle2,
    MapPin,
    Briefcase,
    TrendingUp,
    TrendingDown,
    Trophy,
    Search,
    ArrowUpRight,
    Wrench,
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

export default function ColaboradoresPage() {
    const [filterTipo, setFilterTipo] = useState<string>("all");
    const [filterCiudad, setFilterCiudad] = useState<string>("all");
    const [filterEstado, setFilterEstado] = useState<string>("all");
    const [search, setSearch] = useState("");

    // Unique values for filters
    const tipos = useMemo(() => [...new Set(colaboradores.map((c) => c.tipo))], []);
    const ciudades = useMemo(() => [...new Set(colaboradores.map((c) => c.ciudad))], []);

    // Filter
    const filtered = useMemo(() => {
        return colaboradores.filter((c) => {
            if (filterTipo !== "all" && c.tipo !== filterTipo) return false;
            if (filterCiudad !== "all" && c.ciudad !== filterCiudad) return false;
            if (filterEstado !== "all" && c.estado !== filterEstado) return false;
            if (search && !c.nombre.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [filterTipo, filterCiudad, filterEstado, search]);

    // KPIs
    const totalColabs = colaboradores.length;
    const avgSla = (
        colaboradores.reduce((s, c) => s + c.slaReal, 0) / colaboradores.length
    ).toFixed(1);
    const slaExceeded = colaboradores.filter((c) => c.slaReal > c.slaEsperado).length;
    const avgScore = Math.round(colaboradores.reduce((s, c) => s + c.score, 0) / colaboradores.length);

    // SLA alerts
    const slaAlerts = colaboradores
        .filter((c) => c.estado === "critico" || c.estado === "retrasado")
        .sort((a, b) => b.slaReal - b.slaEsperado - (a.slaReal - a.slaEsperado));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                        <Users className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Colaboradores Externos</h1>
                        <p className="text-sm text-muted-foreground">
                            Gestión de proveedores, SLA y rendimiento
                        </p>
                    </div>
                </div>
                <Link href="/colaboradores/ranking">
                    <Badge
                        variant="outline"
                        className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors"
                    >
                        <Trophy className="h-3 w-3 text-[var(--urus-gold)]" />
                        Ver Rankings
                        <ArrowUpRight className="h-3 w-3" />
                    </Badge>
                </Link>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-secondary/15 p-2">
                                <Users className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                                <p className="text-xl font-bold font-mono">{totalColabs}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-info)]/15 p-2">
                                <Clock className="h-4 w-4 text-[var(--urus-info)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA Promedio</p>
                                <p className="text-xl font-bold font-mono">{avgSla}<span className="text-sm font-normal text-muted-foreground">d</span></p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-danger)]/15 p-2">
                                <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA Excedidos</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-danger)]">{slaExceeded}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2">
                                <TrendingUp className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Score Medio</p>
                                <p className="text-xl font-bold font-mono" style={{ color: getScoreColor(avgScore) }}>{avgScore}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alerts + Filters row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* SLA Alerts */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
                            <CardTitle className="text-sm font-semibold">Alertas de SLA</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {slaAlerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <CheckCircle2 className="h-8 w-8 text-[var(--urus-success)] mb-2" />
                                <p className="text-sm font-medium">Todos dentro de SLA</p>
                                <p className="text-xs text-muted-foreground mt-1">Sin alertas pendientes</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {slaAlerts.map((c) => {
                                    const diff = c.slaReal - c.slaEsperado;
                                    return (
                                        <Link key={c.id} href={`/colaboradores/${c.id}`}>
                                            <div
                                                className="rounded-xl p-3 border transition-all hover:brightness-110 cursor-pointer"
                                                style={{
                                                    borderColor: `color-mix(in oklch, ${estadoConfig[c.estado].color} 25%, transparent)`,
                                                    backgroundColor: `color-mix(in oklch, ${estadoConfig[c.estado].color} 5%, transparent)`,
                                                }}
                                            >
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <p className="text-sm font-medium truncate flex-1">{c.nombre}</p>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[9px] px-1.5 shrink-0 ml-2"
                                                        style={{
                                                            borderColor: estadoConfig[c.estado].color,
                                                            color: estadoConfig[c.estado].color,
                                                        }}
                                                    >
                                                        {c.estado === "critico" ? "Crítico" : "Retrasado"}
                                                    </Badge>
                                                </div>
                                                <SlaIndicator
                                                    slaEsperado={c.slaEsperado}
                                                    slaReal={c.slaReal}
                                                    estado={c.estado}
                                                />
                                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                                    Excede SLA en <span className="font-semibold text-[var(--urus-danger)]">+{diff} días</span>
                                                </p>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Status by type chart */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Wrench className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Estado de Hitos por Tipo</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-4">
                            {tipos.map((tipo) => {
                                const colabsOfType = colaboradores.filter((c) => c.tipo === tipo);
                                const okCount = colabsOfType.filter((c) => c.estado === "ok").length;
                                const retrasadoCount = colabsOfType.filter((c) => c.estado === "retrasado").length;
                                const criticoCount = colabsOfType.filter((c) => c.estado === "critico").length;
                                const total = colabsOfType.length;
                                const avgScoreType = Math.round(colabsOfType.reduce((s, c) => s + c.score, 0) / total);

                                return (
                                    <div key={tipo} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">{tipo}</Badge>
                                                <span className="text-[10px] text-muted-foreground">{total} colaborador{total > 1 ? "es" : ""}</span>
                                            </div>
                                            <span
                                                className="text-xs font-bold font-mono"
                                                style={{ color: getScoreColor(avgScoreType) }}
                                            >
                                                {avgScoreType} pts
                                            </span>
                                        </div>
                                        {/* Stacked bar */}
                                        <div className="flex h-3 rounded-full overflow-hidden">
                                            {okCount > 0 && (
                                                <div
                                                    className="h-full transition-all"
                                                    style={{
                                                        width: `${(okCount / total) * 100}%`,
                                                        backgroundColor: "var(--urus-success)",
                                                    }}
                                                />
                                            )}
                                            {retrasadoCount > 0 && (
                                                <div
                                                    className="h-full transition-all"
                                                    style={{
                                                        width: `${(retrasadoCount / total) * 100}%`,
                                                        backgroundColor: "var(--urus-warning)",
                                                    }}
                                                />
                                            )}
                                            {criticoCount > 0 && (
                                                <div
                                                    className="h-full transition-all"
                                                    style={{
                                                        width: `${(criticoCount / total) * 100}%`,
                                                        backgroundColor: "var(--urus-danger)",
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                            {okCount > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <div className="h-2 w-2 rounded-full bg-[var(--urus-success)]" />
                                                    {okCount} En tiempo
                                                </span>
                                            )}
                                            {retrasadoCount > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <div className="h-2 w-2 rounded-full bg-[var(--urus-warning)]" />
                                                    {retrasadoCount} Retrasado
                                                </span>
                                            )}
                                            {criticoCount > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <div className="h-2 w-2 rounded-full bg-[var(--urus-danger)]" />
                                                    {criticoCount} Crítico
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="mt-4 pt-3 border-t border-border/30 flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-sm bg-[var(--urus-success)]" />
                                <span className="text-[10px] text-muted-foreground">En tiempo</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-sm bg-[var(--urus-warning)]" />
                                <span className="text-[10px] text-muted-foreground">Retrasado</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-sm bg-[var(--urus-danger)]" />
                                <span className="text-[10px] text-muted-foreground">Crítico</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar nombre..."
                                className="bg-accent/30 border border-border/50 rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30 w-40"
                            />
                        </div>

                        {/* Tipo */}
                        <select
                            value={filterTipo}
                            onChange={(e) => setFilterTipo(e.target.value)}
                            className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                            <option value="all">Todos los tipos</option>
                            {tipos.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>

                        {/* Ciudad */}
                        <select
                            value={filterCiudad}
                            onChange={(e) => setFilterCiudad(e.target.value)}
                            className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                            <option value="all">Todas las ciudades</option>
                            {ciudades.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>

                        {/* Estado */}
                        <div className="flex gap-1">
                            {(["all", "ok", "retrasado", "critico"] as const).map((e) => (
                                <button
                                    key={e}
                                    onClick={() => setFilterEstado(e)}
                                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${filterEstado === e
                                            ? "bg-card border-secondary/30 text-foreground font-medium"
                                            : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                        }`}
                                >
                                    {e === "all" ? "Todos" : e === "ok" ? "✅ OK" : e === "retrasado" ? "⏳ Retrasado" : "🔴 Crítico"}
                                </button>
                            ))}
                        </div>

                        <Badge variant="outline" className="text-[10px] ml-auto">
                            {filtered.length} resultados
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Collaborators Table */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Colaborador</th>
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tipo</th>
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Ciudad</th>
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">SLA</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Ops</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Score</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tendencia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {filtered.map((c) => {
                                    const scoreColor = getScoreColor(c.score);
                                    const StatusIcon = estadoConfig[c.estado].icon;
                                    return (
                                        <tr
                                            key={c.id}
                                            className="hover:bg-accent/20 transition-colors group"
                                        >
                                            <td className="px-4 py-3">
                                                <Link href={`/colaboradores/${c.id}`} className="flex items-center gap-2.5 group-hover:text-secondary transition-colors">
                                                    <div className="h-8 w-8 rounded-lg bg-accent/40 flex items-center justify-center text-[10px] font-bold text-secondary shrink-0">
                                                        {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate max-w-[200px]">{c.nombre}</p>
                                                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.especialidad}</p>
                                                    </div>
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant="outline" className="text-[10px]">{c.tipo}</Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3" />
                                                    {c.ciudad}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <StatusIcon className="h-3.5 w-3.5" style={{ color: estadoConfig[c.estado].color }} />
                                                    <span className="text-xs font-mono">
                                                        {c.slaReal}d / {c.slaEsperado}d
                                                    </span>
                                                    {c.slaReal > c.slaEsperado && (
                                                        <span className="text-[9px] text-[var(--urus-danger)]">
                                                            (+{c.slaReal - c.slaEsperado})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs font-mono font-medium">{c.operaciones}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm font-bold font-mono" style={{ color: scoreColor }}>
                                                    {c.score}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-center">
                                                    <SparklineChart
                                                        data={c.tendenciaMensual}
                                                        color={scoreColor}
                                                        width={70}
                                                        height={22}
                                                    />
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
