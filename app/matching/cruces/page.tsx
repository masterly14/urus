"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    ArrowLeftRight,
    Sparkles,
    Filter,
    MapPin,
    TrendingUp,
    MessageCircle,
    CheckCircle2,
    XCircle,
    Clock,
    RefreshCw,
    Zap,
    Eye,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchCard, getMatchColor, estadoMensajeConfig } from "@/components/matching/match-card";
import { WhatsAppPreview } from "@/components/matching/whatsapp-preview";
import { matches as initialMatches } from "@/lib/mock-data/matches";
import type { Match, EstadoMensaje } from "@/lib/mock-data/types";

// Pool of simulated new matches for real-time feed
const matchPool: Omit<Match, "id" | "fechaMatch">[] = [
    {
        propiedad: { id: "prop-new-1", direccion: "Calle Salamanca 8, 2ºC", precio: 310000, metros: 100, habitaciones: 3, zona: "Pla del Real" },
        comprador: { nombre: "Jorge Navarro Gil", presupuestoMax: 330000, zonasInteres: ["Pla del Real", "Mestalla"] },
        porcentajeMatch: 89,
        variablesCoincidentes: ["precio", "zona", "habitaciones"],
        estadoMensaje: "enviado",
    },
    {
        propiedad: { id: "prop-new-2", direccion: "Gran Vía Marqués del Turia 45", precio: 465000, metros: 140, habitaciones: 4, zona: "Gran Vía" },
        comprador: { nombre: "Elena Ramos Serrano", presupuestoMax: 500000, zonasInteres: ["Gran Vía", "Colón"] },
        porcentajeMatch: 93,
        variablesCoincidentes: ["precio", "zona", "habitaciones", "metros"],
        estadoMensaje: "enviado",
    },
    {
        propiedad: { id: "prop-new-3", direccion: "Calle de la Paz 19", precio: 225000, metros: 70, habitaciones: 2, zona: "Centro" },
        comprador: { nombre: "Miguel Torres Pardo", presupuestoMax: 250000, zonasInteres: ["Centro", "Mercat"] },
        porcentajeMatch: 87,
        variablesCoincidentes: ["precio", "zona", "metros"],
        estadoMensaje: "enviado",
    },
];

export default function CrucesPage() {
    const [allMatches, setAllMatches] = useState<Match[]>(initialMatches);
    const [newMatchIds, setNewMatchIds] = useState<Set<string>>(new Set());
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [filterZona, setFilterZona] = useState<string>("all");
    const [filterEstado, setFilterEstado] = useState<string>("all");
    const [poolIndex, setPoolIndex] = useState(0);
    const [isLiveActive, setIsLiveActive] = useState(true);

    // Simulate new match every 15 seconds
    useEffect(() => {
        if (!isLiveActive) return;

        const interval = setInterval(() => {
            setPoolIndex((prev) => {
                const idx = prev % matchPool.length;
                const template = matchPool[idx];
                const newMatch: Match = {
                    ...template,
                    id: `match-new-${Date.now()}`,
                    fechaMatch: new Date().toISOString(),
                };

                setAllMatches((prevMatches) => [newMatch, ...prevMatches]);
                setNewMatchIds((prevIds) => {
                    const next = new Set(prevIds);
                    next.add(newMatch.id);
                    return next;
                });

                // Remove "new" highlight after 5 seconds
                setTimeout(() => {
                    setNewMatchIds((prevIds) => {
                        const next = new Set(prevIds);
                        next.delete(newMatch.id);
                        return next;
                    });
                }, 5000);

                return prev + 1;
            });
        }, 15000);

        return () => clearInterval(interval);
    }, [isLiveActive]);

    // Zones for filter
    const zonas = useMemo(() => [...new Set(allMatches.map((m) => m.propiedad.zona))], [allMatches]);

    // Filtered matches
    const filtered = useMemo(() => {
        return allMatches.filter((m) => {
            if (filterZona !== "all" && m.propiedad.zona !== filterZona) return false;
            if (filterEstado !== "all" && m.estadoMensaje !== filterEstado) return false;
            return true;
        });
    }, [allMatches, filterZona, filterEstado]);

    // KPIs
    const totalMatches = allMatches.length;
    const avgMatch = Math.round(allMatches.reduce((s, m) => s + m.porcentajeMatch, 0) / allMatches.length);
    const meEncajaCount = allMatches.filter((m) => m.estadoMensaje === "me_encaja").length;
    const pendingCount = allMatches.filter((m) => m.estadoMensaje === "enviado").length;

    // Status distribution for mini chart
    const statusCounts: Record<string, number> = {
        me_encaja: allMatches.filter((m) => m.estadoMensaje === "me_encaja").length,
        enviado: allMatches.filter((m) => m.estadoMensaje === "enviado").length,
        no_encaja: allMatches.filter((m) => m.estadoMensaje === "no_encaja").length,
        busco_diferente: allMatches.filter((m) => m.estadoMensaje === "busco_diferente").length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                        <ArrowLeftRight className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Cruces Automáticos</h1>
                        <p className="text-sm text-muted-foreground">
                            Feed en tiempo real de matches Propiedad ↔ Comprador
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsLiveActive(!isLiveActive)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${isLiveActive
                                ? "bg-[var(--urus-success)]/10 border-[var(--urus-success)]/30 text-[var(--urus-success)]"
                                : "bg-accent/30 border-border/30 text-muted-foreground"
                            }`}
                    >
                        <span className={`h-2 w-2 rounded-full ${isLiveActive ? "bg-[var(--urus-success)] animate-pulse" : "bg-muted-foreground"}`} />
                        {isLiveActive ? "LIVE" : "Pausado"}
                    </button>
                    <Link href="/matching/feedback">
                        <Badge
                            variant="outline"
                            className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors"
                        >
                            <Sparkles className="h-3 w-3 text-[var(--urus-gold)]" />
                            Feedback Loop
                            <ArrowUpRight className="h-3 w-3" />
                        </Badge>
                    </Link>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-secondary/15 p-2">
                                <ArrowLeftRight className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Cruces</p>
                                <p className="text-xl font-bold font-mono">{totalMatches}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-gold)]/15 p-2">
                                <Zap className="h-4 w-4 text-[var(--urus-gold)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Match Medio</p>
                                <p className="text-xl font-bold font-mono" style={{ color: getMatchColor(avgMatch) }}>{avgMatch}%</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2">
                                <CheckCircle2 className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Me Encaja</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-success)]">{meEncajaCount}</p>
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
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pendientes</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-info)]">{pendingCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Status distribution + Zone map placeholder + Filters */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Status distribution mini chart */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Estado de Mensajes</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                        {(Object.entries(estadoMensajeConfig) as [EstadoMensaje, { label: string; color: string; icon: string }][]).map(([key, config]) => {
                            const count = statusCounts[key] || 0;
                            const pct = totalMatches > 0 ? (count / totalMatches) * 100 : 0;
                            return (
                                <div key={key} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs flex items-center gap-1.5">
                                            <span>{config.icon}</span>
                                            {config.label}
                                        </span>
                                        <span className="text-xs font-mono font-medium" style={{ color: config.color }}>
                                            {count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-accent/20 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%`, backgroundColor: config.color }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Zone distribution placeholder */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-[var(--urus-gold)]" />
                            <CardTitle className="text-sm font-semibold">Distribución por Zona</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-2.5">
                            {zonas.slice(0, 8).map((zona) => {
                                const count = allMatches.filter((m) => m.propiedad.zona === zona).length;
                                const pct = (count / totalMatches) * 100;
                                return (
                                    <div key={zona} className="flex items-center gap-2">
                                        <span className="text-xs w-[120px] truncate">{zona}</span>
                                        <div className="flex-1 h-3 rounded-full bg-accent/20 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: "linear-gradient(90deg, var(--color-secondary), color-mix(in oklch, var(--color-secondary) 50%, transparent))",
                                                    minWidth: "8px",
                                                }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-mono font-medium w-5 text-right">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Filters */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <CardTitle className="text-sm font-semibold">Filtros</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Zona */}
                        <div className="space-y-1.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Zona</span>
                            <select
                                value={filterZona}
                                onChange={(e) => setFilterZona(e.target.value)}
                                className="w-full bg-accent/30 border border-border/50 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                            >
                                <option value="all">Todas las zonas</option>
                                {zonas.map((z) => (
                                    <option key={z} value={z}>{z}</option>
                                ))}
                            </select>
                        </div>

                        {/* Estado */}
                        <div className="space-y-1.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estado del mensaje</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(["all", "enviado", "me_encaja", "no_encaja", "busco_diferente"] as const).map((e) => {
                                    const config = e !== "all" ? estadoMensajeConfig[e] : null;
                                    return (
                                        <button
                                            key={e}
                                            onClick={() => setFilterEstado(e)}
                                            className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-all ${filterEstado === e
                                                    ? "bg-card border-secondary/30 text-foreground font-medium shadow-sm"
                                                    : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                                }`}
                                        >
                                            {e === "all" ? "Todos" : `${config?.icon} ${config?.label}`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-border/20">
                            <p className="text-xs text-muted-foreground">
                                Mostrando <span className="font-semibold text-foreground">{filtered.length}</span> de {totalMatches} cruces
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Feed + WhatsApp Preview */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Match feed */}
                <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <Zap className="h-4 w-4 text-[var(--urus-gold)]" />
                            Feed de Cruces
                            {isLiveActive && (
                                <span className="text-[9px] text-[var(--urus-success)] flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--urus-success)] animate-pulse" />
                                    Actualizando cada 15s
                                </span>
                            )}
                        </h2>
                    </div>

                    <div className="space-y-3">
                        {filtered.map((m) => (
                            <div
                                key={m.id}
                                onClick={() => setSelectedMatch(m)}
                                className="cursor-pointer"
                            >
                                <MatchCard
                                    match={m}
                                    isNew={newMatchIds.has(m.id)}
                                    className={selectedMatch?.id === m.id ? "ring-2 ring-secondary/40" : ""}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* WhatsApp Preview sidebar */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Eye className="h-4 w-4 text-[#25D366]" />
                        Preview WhatsApp
                    </h2>

                    {selectedMatch ? (
                        <div className="space-y-3 sticky top-4">
                            <WhatsAppPreview match={selectedMatch} />
                            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                                <CardContent className="p-3 space-y-2">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Detalles del Cruce</p>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <span className="text-muted-foreground">Match:</span>
                                            <span className="ml-1 font-bold" style={{ color: getMatchColor(selectedMatch.porcentajeMatch) }}>
                                                {selectedMatch.porcentajeMatch}%
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Estado:</span>
                                            <span className="ml-1 font-medium">{estadoMensajeConfig[selectedMatch.estadoMensaje].icon} {estadoMensajeConfig[selectedMatch.estadoMensaje].label}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Variables:</span>
                                            <span className="ml-1 font-mono">{selectedMatch.variablesCoincidentes.length}/4</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Zona:</span>
                                            <span className="ml-1">{selectedMatch.propiedad.zona}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">Selecciona un cruce</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">
                                    Haz click en un match para ver la preview del mensaje WhatsApp
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
