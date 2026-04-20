"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
    ArrowLeftRight,
    Sparkles,
    Filter,
    MapPin,
    MessageCircle,
    Clock,
    Zap,
    Eye,
    ArrowUpRight,
    Loader2,
    AlertTriangle,
    RefreshCw,
    BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchCard, getMatchColor } from "@/components/matching/match-card";
import type { CruceMatch } from "@/components/matching/match-card";
import { WhatsAppPreview } from "@/components/matching/whatsapp-preview";

const POLL_INTERVAL_MS = 10_000;
const ITEMS_PER_PAGE = 10;

interface ApiResponse {
    cruces: CruceMatch[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
    zonas: string[];
}

export default function CrucesPage() {
    const [allMatches, setAllMatches] = useState<CruceMatch[]>([]);
    const [newMatchIds, setNewMatchIds] = useState<Set<string>>(new Set());
    const [selectedMatch, setSelectedMatch] = useState<CruceMatch | null>(null);
    const [filterZona, setFilterZona] = useState<string>("all");
    const [filterMinScore, setFilterMinScore] = useState<number>(0);
    const [isLiveActive, setIsLiveActive] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zonas, setZonas] = useState<string[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    const latestPosition = useRef<string | null>(null);
    const knownIds = useRef<Set<string>>(new Set());

    const handleMatchSent = useCallback((matchId: string) => {
        setAllMatches((prev) =>
            prev.map((m) => m.id === matchId ? { ...m, whatsappEnviado: true } : m),
        );
        setSelectedMatch((prev) =>
            prev?.id === matchId ? { ...prev, whatsappEnviado: true } : prev,
        );
    }, []);

    const fetchCruces = useCallback(async (isPolling = false) => {
        try {
            const params = new URLSearchParams({ limit: "30" });

            if (isPolling && allMatches.length > 0) {
                const newestMatch = allMatches[0];
                if (newestMatch) {
                    params.set("since", newestMatch.fechaMatch);
                }
            }

            const res = await fetch(`/api/matching/cruces?${params}`);
            if (!res.ok) {
                if (res.status === 401) {
                    setError("Sesión expirada. Recarga la página.");
                    return;
                }
                throw new Error(`HTTP ${res.status}`);
            }

            const data: ApiResponse = await res.json();

            if (isPolling) {
                const newOnes = data.cruces.filter((c) => !knownIds.current.has(c.id));
                if (newOnes.length > 0) {
                    setAllMatches((prev) => {
                        const merged = [...newOnes, ...prev];
                        const seen = new Set<string>();
                        return merged.filter((c) => {
                            if (seen.has(c.id)) return false;
                            seen.add(c.id);
                            return true;
                        });
                    });

                    const newIds = new Set(newOnes.map((c) => c.id));
                    setNewMatchIds((prev) => new Set([...prev, ...newIds]));
                    setTimeout(() => {
                        setNewMatchIds((prev) => {
                            const next = new Set(prev);
                            newIds.forEach((id) => next.delete(id));
                            return next;
                        });
                    }, 5000);

                    newOnes.forEach((c) => knownIds.current.add(c.id));
                }
            } else {
                setAllMatches(data.cruces);
                data.cruces.forEach((c) => knownIds.current.add(c.id));
                setHasMore(data.hasMore);
                setNextCursor(data.nextCursor);
            }

            if (data.zonas.length > 0) {
                setZonas((prev) => {
                    const all = new Set([...prev, ...data.zonas]);
                    return [...all].sort();
                });
            }

            if (data.cruces.length > 0 && data.cruces[0]) {
                latestPosition.current = data.cruces[0].position;
            }

            setError(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!isPolling) setError(msg);
            console.error("[cruces] fetch error:", msg);
        } finally {
            if (!isPolling) setLoading(false);
        }
    }, [allMatches]);

    const loadMore = useCallback(async (): Promise<number> => {
        if (!nextCursor || loadingMore) return 0;
        setLoadingMore(true);
        try {
            const params = new URLSearchParams({ limit: "30", cursor: nextCursor });
            const res = await fetch(`/api/matching/cruces?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data: ApiResponse = await res.json();
            const newOnes = data.cruces.filter((c) => !knownIds.current.has(c.id));

            setAllMatches((prev) => [...prev, ...newOnes]);
            newOnes.forEach((c) => knownIds.current.add(c.id));
            setHasMore(data.hasMore);
            setNextCursor(data.nextCursor);

            if (data.zonas.length > 0) {
                setZonas((prev) => {
                    const all = new Set([...prev, ...data.zonas]);
                    return [...all].sort();
                });
            }

            return newOnes.length;
        } catch (err) {
            console.error("[cruces] loadMore error:", err);
            return 0;
        } finally {
            setLoadingMore(false);
        }
    }, [nextCursor, loadingMore]);

    useEffect(() => {
        fetchCruces(false);
    }, []);

    useEffect(() => {
        if (!isLiveActive) return;
        const interval = setInterval(() => fetchCruces(true), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isLiveActive, fetchCruces]);

    const filtered = useMemo(() => {
        return allMatches.filter((m) => {
            if (filterZona !== "all" && m.propiedad.zona !== filterZona) return false;
            if (m.porcentajeMatch < filterMinScore) return false;
            return true;
        });
    }, [allMatches, filterZona, filterMinScore]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginatedMatches = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filtered.slice(start, start + ITEMS_PER_PAGE);
    }, [filtered, currentPage]);

    const goToNextPage = useCallback(async () => {
        if (currentPage < totalPages) {
            setCurrentPage((prev) => prev + 1);
            return;
        }

        if (!hasMore || loadingMore) return;

        const loaded = await loadMore();
        if (loaded > 0) {
            setCurrentPage((prev) => prev + 1);
        }
    }, [currentPage, totalPages, hasMore, loadingMore, loadMore]);

    const goToPrevPage = useCallback(() => {
        setCurrentPage((prev) => Math.max(1, prev - 1));
    }, []);

    const visiblePages = useMemo(() => {
        const pages: number[] = [];
        const windowSize = 5;
        const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
        const end = Math.min(totalPages, start + windowSize - 1);
        const normalizedStart = Math.max(1, end - windowSize + 1);

        for (let p = normalizedStart; p <= end; p++) {
            pages.push(p);
        }

        return pages;
    }, [currentPage, totalPages]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterZona, filterMinScore]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const totalMatches = allMatches.length;
    const avgMatch = totalMatches > 0
        ? Math.round(allMatches.reduce((s, m) => s + m.porcentajeMatch, 0) / totalMatches)
        : 0;
    const highScoreCount = allMatches.filter((m) => m.porcentajeMatch >= 80).length;
    const recentCount = allMatches.filter((m) => {
        const h24 = Date.now() - 24 * 60 * 60 * 1000;
        return new Date(m.fechaMatch).getTime() > h24;
    }).length;

    const scoreDistribution = useMemo(() => {
        const buckets = { "90-100": 0, "75-89": 0, "60-74": 0, "<60": 0 };
        for (const m of allMatches) {
            if (m.porcentajeMatch >= 90) buckets["90-100"]++;
            else if (m.porcentajeMatch >= 75) buckets["75-89"]++;
            else if (m.porcentajeMatch >= 60) buckets["60-74"]++;
            else buckets["<60"]++;
        }
        return buckets;
    }, [allMatches]);

    const zonaCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const m of allMatches) {
            const z = m.propiedad.zona || "Sin zona";
            counts[z] = (counts[z] || 0) + 1;
        }
        return Object.entries(counts).sort(([, a], [, b]) => b - a);
    }, [allMatches]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-secondary" />
                    <p className="text-sm text-muted-foreground">Cargando cruces reales...</p>
                </div>
            </div>
        );
    }

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
                            Resultados automáticos del motor de búsqueda — Propiedad ↔ Demanda
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
                        {isLiveActive ? "En directo" : "Pausado"}
                    </button>
                    <button
                        onClick={() => fetchCruces(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border/30 text-muted-foreground hover:bg-accent/30 transition-all"
                    >
                        <RefreshCw className="h-3 w-3" />
                        Recargar
                    </button>
                    <Link href="/platform/matching/feedback">
                        <Badge
                            variant="outline"
                            className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors"
                        >
                            <Sparkles className="h-3 w-3 text-[var(--urus-gold)]" />
                            Ciclo de Mejora
                            <ArrowUpRight className="h-3 w-3" />
                        </Badge>
                    </Link>
                </div>
            </div>

            {error && (
                <Card className="border-[var(--urus-danger)]/30 bg-[var(--urus-danger)]/5">
                    <CardContent className="p-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
                        <p className="text-sm text-[var(--urus-danger)]">{error}</p>
                    </CardContent>
                </Card>
            )}

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
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Compatibilidad Media</p>
                                <p className="text-xl font-bold font-mono" style={{ color: getMatchColor(avgMatch) }}>{avgMatch}%</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2">
                                <Sparkles className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alta Precisión</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-success)]">{highScoreCount}</p>
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
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Últimas 24h</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-info)]">{recentCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Distribution + Zones + Filters */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Score distribution */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Distribución de Compatibilidad</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                        {([
                            { key: "90-100", label: "Excelente (90–100%)", color: "var(--urus-success)" },
                            { key: "75-89", label: "Bueno (75–89%)", color: "var(--urus-gold)" },
                            { key: "60-74", label: "Moderado (60–74%)", color: "var(--urus-warning)" },
                            { key: "<60", label: "Bajo (<60%)", color: "var(--urus-danger)" },
                        ] as const).map(({ key, label, color }) => {
                            const count = scoreDistribution[key];
                            const pct = totalMatches > 0 ? (count / totalMatches) * 100 : 0;
                            return (
                                <div key={key} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs">{label}</span>
                                        <span className="text-xs font-mono font-medium" style={{ color }}>
                                            {count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-accent/20 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%`, backgroundColor: color }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Zone distribution */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-[var(--urus-gold)]" />
                            <CardTitle className="text-sm font-semibold">Distribución por Zona</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {zonaCounts.length > 0 ? (
                            <div className="space-y-2.5">
                                {zonaCounts.slice(0, 8).map(([zona, count]) => {
                                    const pct = totalMatches > 0 ? (count / totalMatches) * 100 : 0;
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
                        ) : (
                            <p className="text-xs text-muted-foreground py-4 text-center">Sin datos de zona</p>
                        )}
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

                        <div className="space-y-1.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Compatibilidad mínima</span>
                            <div className="flex flex-wrap gap-1.5">
                                {[0, 50, 60, 75, 90].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterMinScore(s)}
                                        className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-all ${filterMinScore === s
                                            ? "bg-card border-secondary/30 text-foreground font-medium shadow-sm"
                                            : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                            }`}
                                    >
                                        {s === 0 ? "Todos" : `≥${s}%`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-border/20">
                            <p className="text-xs text-muted-foreground">
                                Mostrando <span className="font-semibold text-foreground">{filtered.length}</span> de {totalMatches} cargados
                                {hasMore && <span className="text-muted-foreground/60"> · hay más</span>}
                                <span className="text-muted-foreground/60"> · página {currentPage}/{totalPages}</span>
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Feed + Detail */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <Zap className="h-4 w-4 text-[var(--urus-gold)]" />
                            Feed de Cruces
                            {isLiveActive && (
                                <span className="text-[9px] text-[var(--urus-success)] flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--urus-success)] animate-pulse" />
                                    Actualización cada {POLL_INTERVAL_MS / 1000}s
                                </span>
                            )}
                        </h2>
                    </div>

                    {filtered.length === 0 ? (
                        <Card className="border-border/50 bg-card/60 border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <ArrowLeftRight className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">Sin cruces registrados</p>
                                <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                                    Los cruces se generan automáticamente por el sistema. Cuando haya
                                    nuevos resultados, aparecerán aquí.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {paginatedMatches.map((m) => (
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

                            <div className="flex items-center justify-between gap-3 pt-2">
                                <button
                                    onClick={goToPrevPage}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 rounded-lg border border-border/40 text-xs font-medium text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Anterior
                                </button>

                                <div className="flex items-center gap-1.5">
                                    {visiblePages.map((page) => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`min-w-8 h-8 px-2 rounded-lg text-xs border transition-all ${page === currentPage
                                                ? "bg-card border-secondary/30 text-foreground font-semibold"
                                                : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={goToNextPage}
                                    disabled={loadingMore || (!hasMore && currentPage >= totalPages)}
                                    className="px-3 py-2 rounded-lg border border-border/40 text-xs font-medium text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loadingMore ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Cargando…
                                        </span>
                                    ) : (
                                        "Siguiente"
                                    )}
                                </button>
                            </div>

                            {hasMore && currentPage >= totalPages && !loadingMore && (
                                <p className="text-[11px] text-center text-muted-foreground/70">
                                    Hay más cruces en histórico; avanza a la siguiente página para cargarlos.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Detail sidebar */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Eye className="h-4 w-4 text-[#25D366]" />
                        Validar y Enviar WhatsApp
                    </h2>

                    {selectedMatch ? (
                        <div className="space-y-3 sticky top-4">
                            <WhatsAppPreview match={selectedMatch} onSent={handleMatchSent} />
                            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                                <CardContent className="p-3 space-y-2">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Detalles del Cruce</p>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <span className="text-muted-foreground">Compatibilidad:</span>
                                            <span className="ml-1 font-bold" style={{ color: getMatchColor(selectedMatch.porcentajeMatch) }}>
                                                {selectedMatch.porcentajeMatch}%
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Zona:</span>
                                            <span className="ml-1">{selectedMatch.propiedad.zona}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Tipo:</span>
                                            <span className="ml-1">{selectedMatch.propiedad.tipoOfer || "—"}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Demanda:</span>
                                            <span className="ml-1 font-mono">{selectedMatch.comprador.nombre || selectedMatch.comprador.id.slice(0, 8)}</span>
                                        </div>
                                    </div>
                                    {selectedMatch.matchScore && (
                                        <div className="pt-2 border-t border-border/20 space-y-1">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Detalle de Compatibilidad</p>
                                            {(["zone", "price", "type", "size", "rooms"] as const).map((key) => {
                                                const s = selectedMatch.matchScore?.[key];
                                                if (!s) return null;
                                                const pct = Math.round(s.score * 100);
                                                const color = pct >= 70 ? "var(--urus-success)" : pct >= 50 ? "var(--urus-gold)" : "var(--urus-danger)";
                                                return (
                                                    <div key={key} className="flex items-center gap-2">
                                                        <span className="text-[10px] w-16 capitalize">{key === "zone" ? "Zona" : key === "price" ? "Precio" : key === "type" ? "Tipo" : key === "size" ? "Metros" : "Hab."}</span>
                                                        <div className="flex-1 h-1.5 rounded-full bg-accent/20 overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full"
                                                                style={{ width: `${pct}%`, backgroundColor: color }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] font-mono w-8 text-right" style={{ color }}>{pct}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-border/20">
                                        {selectedMatch.validationToken ? (
                                            <Link
                                                href={`/validar-seleccion/${selectedMatch.validationToken}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-secondary hover:text-secondary/80 transition-colors"
                                            >
                                                Validar selección del comprador
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                            </Link>
                                        ) : (
                                            <p className="text-[10px] text-muted-foreground">
                                                No hay una selección pendiente de validación para esta demanda.
                                            </p>
                                        )}
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
                                    Haz clic en un cruce para revisar el mensaje y decidir si enviarlo al comprador
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
