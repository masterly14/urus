"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Tag,
    Filter,
    MapPin,
    AlertTriangle,
    TrendingDown,
    LayoutGrid,
    List,
    ArrowUpRight,
    BarChart3,
    Phone,
    Home,
    Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SemaforoIndicator, semaforoConfig } from "@/components/pricing/semaforo-indicator";
import { PropertyCard } from "@/components/pricing/property-card";
import { propiedades } from "@/lib/mock-data/propiedades";
import type { SemaforoStatus } from "@/lib/mock-data/types";

export default function PricingPage() {
    const [filterZona, setFilterZona] = useState<string>("all");
    const [filterSemaforo, setFilterSemaforo] = useState<string>("all");
    const [filterEstado, setFilterEstado] = useState<string>("all");
    const [filterDias, setFilterDias] = useState<string>("all");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

    const zonas = useMemo(() => [...new Set(propiedades.map((p) => p.zona))], []);
    const estados = useMemo(() => [...new Set(propiedades.map((p) => p.estado))], []);

    const filtered = useMemo(() => {
        return propiedades.filter((p) => {
            if (filterZona !== "all" && p.zona !== filterZona) return false;
            if (filterSemaforo !== "all" && p.semaforo !== filterSemaforo) return false;
            if (filterEstado !== "all" && p.estado !== filterEstado) return false;
            if (filterDias === "7+" && p.diasSinLlamadas < 7) return false;
            if (filterDias === "15+" && p.diasSinLlamadas < 15) return false;
            if (filterDias === "30+" && p.diasSinLlamadas < 30) return false;
            return true;
        });
    }, [filterZona, filterSemaforo, filterEstado, filterDias]);

    // Semáforo counts
    const verdeCount = propiedades.filter((p) => p.semaforo === "verde").length;
    const amarilloCount = propiedades.filter((p) => p.semaforo === "amarillo").length;
    const rojoCount = propiedades.filter((p) => p.semaforo === "rojo").length;

    // Burned properties (rojo + high gap)
    const burnedProps = propiedades.filter((p) => p.semaforo === "rojo" || (p.gapPrecio > 10 && p.diasSinLlamadas > 20));

    // Averages
    const avgGap = (propiedades.reduce((s, p) => s + p.gapPrecio, 0) / propiedades.length).toFixed(1);
    const avgPos = (propiedades.reduce((s, p) => s + p.posicionPortal, 0) / propiedades.length).toFixed(1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                        <Tag className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Smart Pricing</h1>
                        <p className="text-sm text-muted-foreground">
                            Semáforo de posicionamiento y análisis de precios
                        </p>
                    </div>
                </div>
                <Link href="/pricing/mercado">
                    <Badge variant="outline" className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors">
                        <BarChart3 className="h-3 w-3 text-secondary" />
                        Vista de Mercado
                        <ArrowUpRight className="h-3 w-3" />
                    </Badge>
                </Link>
            </div>

            {/* Semáforo Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                    { status: "verde" as SemaforoStatus, count: verdeCount, emoji: "🟢", desc: "Bien posicionadas" },
                    { status: "amarillo" as SemaforoStatus, count: amarilloCount, emoji: "🟡", desc: "En riesgo" },
                    { status: "rojo" as SemaforoStatus, count: rojoCount, emoji: "🔴", desc: "Fuera de mercado" },
                ]).map(({ status, count, emoji, desc }) => {
                    const config = semaforoConfig[status];
                    return (
                        <Card
                            key={status}
                            className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                            onClick={() => setFilterSemaforo(filterSemaforo === status ? "all" : status)}
                        >
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
                                            style={{ backgroundColor: `color-mix(in oklch, ${config.color} 12%, transparent)` }}
                                        >
                                            {emoji}
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{desc}</p>
                                            <p className="text-2xl font-bold font-mono" style={{ color: config.color }}>{count}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">{((count / propiedades.length) * 100).toFixed(0)}%</p>
                                        <div className="h-1.5 w-16 rounded-full bg-accent/20 mt-1 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${(count / propiedades.length) * 100}%`,
                                                    backgroundColor: config.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Alerts + Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Burned Properties Alert */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
                            <CardTitle className="text-sm font-semibold">Propiedades Quemadas — Acción Urgente</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {burnedProps.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-sm text-muted-foreground">Sin propiedades quemadas 🎉</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {burnedProps.map((p) => (
                                    <Link key={p.id} href={`/pricing/analisis/${p.id}`}>
                                        <div className="rounded-xl p-3 bg-[var(--urus-danger)]/3 border border-[var(--urus-danger)]/12 hover:bg-[var(--urus-danger)]/6 transition-all cursor-pointer">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    <SemaforoIndicator status={p.semaforo} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate">{p.direccion}</p>
                                                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                                                            <span className="font-mono font-semibold text-foreground">{p.precio.toLocaleString("es-ES")} €</span>
                                                            <span className="text-[var(--urus-danger)]">Gap: +{p.gapPrecio}%</span>
                                                            <span className="flex items-center gap-0.5">
                                                                <Phone className="h-2.5 w-2.5" />
                                                                {p.diasSinLlamadas}d sin llamadas
                                                            </span>
                                                            <span>Pos. #{p.posicionPortal}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[9px] text-[var(--urus-danger)] border-[var(--urus-danger)]/30 shrink-0">
                                                    Acción urgente
                                                </Badge>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick stats */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Resumen Portafolio</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">Total propiedades</span>
                                <span className="text-sm font-bold font-mono">{propiedades.length}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">Gap precio medio</span>
                                <span className={`text-sm font-bold font-mono ${parseFloat(avgGap) > 0 ? "text-[var(--urus-danger)]" : "text-[var(--urus-success)]"}`}>
                                    {parseFloat(avgGap) > 0 ? "+" : ""}{avgGap}%
                                </span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">Posición media portal</span>
                                <span className="text-sm font-bold font-mono">#{avgPos}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/20">
                                <span className="text-xs text-muted-foreground">Precio medio</span>
                                <span className="text-sm font-bold font-mono">
                                    {Math.round(propiedades.reduce((s, p) => s + p.precio, 0) / propiedades.length).toLocaleString("es-ES")} €
                                </span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-xs text-muted-foreground">€/m² medio</span>
                                <span className="text-sm font-bold font-mono">
                                    {Math.round(propiedades.reduce((s, p) => s + p.precio / p.metros, 0) / propiedades.length).toLocaleString("es-ES")} €
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters + View Toggle */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
                        </div>

                        {/* Zona */}
                        <select
                            value={filterZona}
                            onChange={(e) => setFilterZona(e.target.value)}
                            className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                            <option value="all">Todas las zonas</option>
                            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>

                        {/* Semáforo */}
                        <div className="flex gap-1">
                            {(["all", "verde", "amarillo", "rojo"] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setFilterSemaforo(s)}
                                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${filterSemaforo === s
                                            ? "bg-card border-secondary/30 text-foreground font-medium shadow-sm"
                                            : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                        }`}
                                >
                                    {s === "all" ? "Todos" : s === "verde" ? "🟢 Verde" : s === "amarillo" ? "🟡 Amarillo" : "🔴 Rojo"}
                                </button>
                            ))}
                        </div>

                        {/* Estado */}
                        <select
                            value={filterEstado}
                            onChange={(e) => setFilterEstado(e.target.value)}
                            className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                            <option value="all">Todos los estados</option>
                            {estados.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>

                        {/* Días sin llamadas */}
                        <select
                            value={filterDias}
                            onChange={(e) => setFilterDias(e.target.value)}
                            className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                            <option value="all">Todos los días</option>
                            <option value="7+">+7 días sin llamadas</option>
                            <option value="15+">+15 días sin llamadas</option>
                            <option value="30+">+30 días sin llamadas</option>
                        </select>

                        {/* View toggle + count */}
                        <div className="flex items-center gap-2 ml-auto">
                            <Badge variant="outline" className="text-[10px]">{filtered.length} resultados</Badge>
                            <div className="flex bg-accent/30 rounded-lg p-0.5 border border-border/30">
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-card shadow-sm" : ""}`}
                                >
                                    <LayoutGrid className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-card shadow-sm" : ""}`}
                                >
                                    <List className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Properties Grid/List */}
            {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map((p) => (
                        <PropertyCard key={p.id} property={p} />
                    ))}
                </div>
            ) : (
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border/30">
                                        <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estado</th>
                                        <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Dirección</th>
                                        <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Zona</th>
                                        <th className="text-right px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                                        <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">m²</th>
                                        <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Gap</th>
                                        <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pos.</th>
                                        <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Sin llamadas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {filtered.map((p) => (
                                        <tr key={p.id} className="hover:bg-accent/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <SemaforoIndicator status={p.semaforo} size="sm" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <Link href={`/pricing/analisis/${p.id}`} className="text-sm font-medium hover:text-secondary transition-colors">
                                                    {p.direccion}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant="outline" className="text-[9px]">{p.zona}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-sm font-mono font-medium">{p.precio.toLocaleString("es-ES")} €</span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-xs font-mono">{p.metros}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-xs font-mono font-bold ${p.gapPrecio < 0 ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                                    {p.gapPrecio > 0 ? "+" : ""}{p.gapPrecio}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-xs font-mono">#{p.posicionPortal}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className="text-xs font-mono font-medium"
                                                    style={{ color: p.diasSinLlamadas > 15 ? "var(--urus-danger)" : p.diasSinLlamadas > 7 ? "var(--urus-warning)" : "var(--urus-success)" }}
                                                >
                                                    {p.diasSinLlamadas}d
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
