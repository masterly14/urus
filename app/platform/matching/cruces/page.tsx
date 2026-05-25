"use client";

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import {
    AlertTriangle,
    Loader2,
    RefreshCw,
    Search,
    Filter
} from "lucide-react";
import { MatchCard, getMatchColor } from "@/components/matching/match-card";
import type { CruceMatch } from "@/components/matching/match-card";
import { MATCHING_PAUSED, MATCHING_PAUSED_REASON } from "@/lib/matching/pause";

const POLL_INTERVAL_MS = 10_000;
const ITEMS_PER_PAGE = 10;

function matchesDemandSearch(match: CruceMatch, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const { comprador } = match;
    const haystack = [comprador.nombre, comprador.id, comprador.ref]
        .filter(Boolean)
        .map((value) => value.toLowerCase());

    return haystack.some((value) => value.includes(q));
}

interface ApiResponse {
    cruces: CruceMatch[];
    total: number;
    invalidatedHidden?: number;
    hasMore: boolean;
    nextCursor: string | null;
    zonas: string[];
}

function MatchDetailView({ match }: { match: CruceMatch }) {
    const color = getMatchColor(match.porcentajeMatch);

    return (
        <div className="flex flex-col h-full bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="p-6 border-b border-border/50 flex items-center justify-between bg-transparent">
                <div>
                    <h2 className="text-lg font-semibold">Detalles del Cruce</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Generado el {new Date(match.fechaMatch).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Compatibilidad</p>
                    <p className="text-2xl font-bold font-mono" style={{ color }}>{match.porcentajeMatch}%</p>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Two columns: Propiedad / Demanda */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Propiedad */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Propiedad</h3>

                        {match.propiedad.mainPhotoUrl ? (
                            <div className="relative w-full h-48 rounded-lg overflow-hidden bg-accent/20 border border-border/50">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                    src={match.propiedad.mainPhotoUrl} 
                                    alt={match.propiedad.titulo || match.propiedad.ref}
                                    className="object-cover w-full h-full"
                                />
                            </div>
                        ) : (
                            <div className="w-full h-48 rounded-lg bg-accent/20 border border-border/50 flex flex-col items-center justify-center text-muted-foreground">
                                <span className="text-xs font-medium opacity-50">Sin imagen</span>
                            </div>
                        )}

                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-muted-foreground text-xs mb-0.5">Referencia / Título</p>
                                <p className="font-medium">{match.propiedad.titulo || match.propiedad.ref}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Precio</p>
                                    <p>{match.propiedad.precio.toLocaleString("es-ES")} €</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Zona</p>
                                    <p>{match.propiedad.zona}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Superficie</p>
                                    <p>{match.propiedad.metros} m²</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Habitaciones</p>
                                    <p>{match.propiedad.habitaciones} hab</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Demanda */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demanda</h3>
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-muted-foreground text-xs mb-0.5">Comprador</p>
                                <p className="font-medium">{match.comprador.nombre}</p>
                                {(match.comprador.ref || match.comprador.id) && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {match.comprador.ref || match.comprador.id}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Presupuesto</p>
                                    <p>
                                        {match.comprador.presupuestoMin > 0
                                            ? `${match.comprador.presupuestoMin.toLocaleString("es-ES")} - ${match.comprador.presupuestoMax.toLocaleString("es-ES")} €`
                                            : `Hasta ${match.comprador.presupuestoMax.toLocaleString("es-ES")} €`}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Zonas de interés</p>
                                    <p className="truncate" title={match.comprador.zonasInteres.join(", ")}>
                                        {match.comprador.zonasInteres.join(", ") || "Cualquiera"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Superficie min.</p>
                                    <p>{match.comprador.metrosMin ? `${match.comprador.metrosMin} m²` : "—"}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs mb-0.5">Habitaciones min.</p>
                                    <p>{match.comprador.habitacionesMin || "—"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scoring Breakdown */}
                {match.matchScore && (
                    <div className="space-y-4 pt-6 border-t border-border/50">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Análisis de Compatibilidad</h3>
                        <div className="grid grid-cols-1 gap-4">
                            {(["zone", "price", "type", "size", "rooms"] as const).map((key) => {
                                const s = match.matchScore?.[key];
                                if (!s) return null;
                                const pct = Math.round(s.score * 100);
                                const c = pct >= 70 ? "var(--urus-success)" : pct >= 50 ? "var(--urus-gold)" : "var(--urus-danger)";
                                const labels = { zone: "Zona", price: "Precio", type: "Tipología", size: "Superficie", rooms: "Habitaciones" };

                                return (
                                    <div key={key} className="flex items-start gap-4">
                                        <div className="w-24 shrink-0 pt-0.5">
                                            <p className="text-xs font-medium">{labels[key]}</p>
                                            <p className="text-[10px] font-mono" style={{ color: c }}>{pct}%</p>
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-1 rounded-full bg-accent/50 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c }} />
                                            </div>
                                            <p className="text-xs text-muted-foreground">{s.reason}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-6 border-t border-border/50">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Trazabilidad
                    </h3>
                    <div className="space-y-3">
                        <div className="p-4 rounded-md bg-accent/30 border border-border/30">
                            <p className="text-sm font-medium">
                                Micrositio{" "}
                                {match.trazabilidad?.micrositio.enviado ? "enviado" : "pendiente de envío"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {match.trazabilidad?.micrositio.enviadoAt
                                    ? `Enviado el ${new Date(match.trazabilidad.micrositio.enviadoAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}`
                                    : "Sin evento de envío de micrositio para esta demanda"}
                            </p>
                            {match.trazabilidad?.micrositio.url && (
                                <a
                                    href={match.trazabilidad.micrositio.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                                >
                                    Abrir micrositio enviado
                                </a>
                            )}
                            <div className="mt-3">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                                    Propiedades enviadas
                                </p>
                                {match.trazabilidad?.micrositio.propiedadesEnviadas?.length ? (
                                    <ul className="space-y-1.5">
                                        {match.trazabilidad.micrositio.propiedadesEnviadas.slice(0, 8).map((property) => (
                                            <li key={property.propertyId} className="text-xs text-foreground/90">
                                                {property.title}{" "}
                                                <span className="text-muted-foreground">
                                                    ({property.price ? `${property.price.toLocaleString("es-ES")} €` : "s/p"})
                                                    {property.zone ? ` · ${property.zone}` : ""}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-muted-foreground">No hay propiedades registradas en el envío.</p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 rounded-md bg-accent/30 border border-border/30">
                            <p className="text-sm font-medium">
                                WhatsApp {match.trazabilidad?.whatsapp.contactado ? "contactado" : "sin contacto"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Entrantes: {match.trazabilidad?.whatsapp.inboundCount ?? 0} · Salientes: {match.trazabilidad?.whatsapp.outboundCount ?? 0}
                            </p>
                            {match.trazabilidad?.whatsapp.lastMessageAt && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Último mensaje: {new Date(match.trazabilidad.whatsapp.lastMessageAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                                </p>
                            )}
                            {match.trazabilidad?.whatsapp.conversationUrl && (
                                <a
                                    href={match.trazabilidad.whatsapp.conversationUrl}
                                    className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                                >
                                    Abrir conversación
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CrucesPageContent() {
    const searchParams = useSearchParams();
    const targetMatchId = searchParams.get("matchId");
    const [allMatches, setAllMatches] = useState<CruceMatch[]>([]);
    const [newMatchIds, setNewMatchIds] = useState<Set<string>>(new Set());
    const [selectedMatch, setSelectedMatch] = useState<CruceMatch | null>(null);
    const [filterZona, setFilterZona] = useState<string>("all");
    const [filterMinScore, setFilterMinScore] = useState<number>(0);
    const [searchDemanda, setSearchDemanda] = useState<string>("");
    const [isLiveActive, setIsLiveActive] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zonas, setZonas] = useState<string[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalGeneratedMatches, setTotalGeneratedMatches] = useState<number | null>(null);
    const [invalidatedHidden, setInvalidatedHidden] = useState(0);

    const latestPosition = useRef<string | null>(null);
    const knownIds = useRef<Set<string>>(new Set());
    const focusedMatchIdRef = useRef<string | null>(null);

    const { data: cachedInitial, mutate: mutateCrucesCache } = useSWR<ApiResponse>(
        "/api/matching/cruces?limit=30",
        { revalidateOnMount: false, revalidateOnFocus: false },
    );
    const mutateCacheRef = useRef(mutateCrucesCache);
    mutateCacheRef.current = mutateCrucesCache;
    const didSeedRef = useRef(false);

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
            setTotalGeneratedMatches(data.total);
            setInvalidatedHidden(data.invalidatedHidden ?? 0);

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
                mutateCacheRef.current(data, false);
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
            setTotalGeneratedMatches(data.total);
            setInvalidatedHidden(data.invalidatedHidden ?? 0);
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
        if (cachedInitial && !didSeedRef.current && allMatches.length === 0) {
            didSeedRef.current = true;
            setAllMatches(cachedInitial.cruces);
            cachedInitial.cruces.forEach((c) => knownIds.current.add(c.id));
            setHasMore(cachedInitial.hasMore);
            setNextCursor(cachedInitial.nextCursor);
            setTotalGeneratedMatches(cachedInitial.total);
            setInvalidatedHidden(cachedInitial.invalidatedHidden ?? 0);
            if (cachedInitial.zonas.length > 0) setZonas(cachedInitial.zonas.sort());
            if (cachedInitial.cruces[0]) latestPosition.current = cachedInitial.cruces[0].position;
            setLoading(false);
        }
    }, [cachedInitial, allMatches.length]);

    useEffect(() => {
        if (didSeedRef.current) return;
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
            if (!matchesDemandSearch(m, searchDemanda)) return false;
            return true;
        });
    }, [allMatches, filterZona, filterMinScore, searchDemanda]);

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

    useEffect(() => {
        setCurrentPage(1);
    }, [filterZona, filterMinScore, searchDemanda]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        if (!targetMatchId) return;
        if (focusedMatchIdRef.current === targetMatchId) return;
        const targetIndex = allMatches.findIndex((match) => match.id === targetMatchId);
        if (targetIndex === -1) return;
        const targetMatch = allMatches[targetIndex];
        if (!targetMatch) return;
        setSelectedMatch(targetMatch);
        setCurrentPage(Math.floor(targetIndex / ITEMS_PER_PAGE) + 1);
        focusedMatchIdRef.current = targetMatchId;
    }, [allMatches, targetMatchId]);

    const loadedMatchesCount = allMatches.length;
    const totalMatches = totalGeneratedMatches ?? loadedMatchesCount;
    const avgMatch = loadedMatchesCount > 0
        ? Math.round(allMatches.reduce((s, m) => s + m.porcentajeMatch, 0) / loadedMatchesCount)
        : 0;
    const highScoreCount = allMatches.filter((m) => m.porcentajeMatch >= 80).length;
    const recentCount = allMatches.filter((m) => {
        const h24 = Date.now() - 24 * 60 * 60 * 1000;
        return new Date(m.fechaMatch).getTime() > h24;
    }).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Cargando cruces...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] min-h-[600px] space-y-6">
            {/* Header */}
            <div className="flex-none flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Cruces Automáticos</h1>
                    <p className="text-sm text-muted-foreground">
                        Resultados del motor de búsqueda
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsLiveActive(!isLiveActive)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent transition-all text-muted-foreground border border-transparent hover:border-border/50"
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${isLiveActive ? "bg-green-500" : "bg-muted-foreground"}`} />
                        {isLiveActive ? "En directo" : "Pausado"}
                    </button>
                    <button
                        onClick={() => fetchCruces(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-accent transition-all text-muted-foreground border border-transparent hover:border-border/50"
                    >
                        <RefreshCw className="h-3 w-3" />
                        Recargar
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 rounded-md border border-red-500/20 bg-red-500/10 flex items-center gap-2 flex-none">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <p className="text-sm text-red-500">{error}</p>
                </div>
            )}

            {MATCHING_PAUSED && (
                <div className="p-3 rounded-md border border-yellow-500/20 bg-yellow-500/10 flex items-start gap-2 flex-none">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500" />
                    <div>
                        <p className="text-sm font-medium text-foreground">Cruces pausados temporalmente</p>
                        <p className="text-xs text-muted-foreground">{MATCHING_PAUSED_REASON}</p>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="flex-none grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Cruces</p>
                    <p className="text-2xl font-semibold leading-none text-foreground">{totalMatches}</p>
                    <p className="text-[10px] text-muted-foreground">
                        {loadedMatchesCount.toLocaleString("es-ES")} cargados en la vista
                        {invalidatedHidden > 0
                            ? ` · ${invalidatedHidden.toLocaleString("es-ES")} invalidados ocultos`
                            : ""}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Compatibilidad Media</p>
                    <p className="text-2xl font-semibold leading-none" style={{ color: getMatchColor(avgMatch) }}>{avgMatch}%</p>
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Alta Precisión</p>
                    <p className="text-2xl font-semibold leading-none text-foreground">{highScoreCount}</p>
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Últimas 24h</p>
                    <p className="text-2xl font-semibold leading-none text-foreground">{recentCount}</p>
                </div>
            </div>

            {/* Main Content: Master-Detail */}
            <div className="flex-1 min-h-0 flex gap-4">
                {/* Left Panel: Feed */}
                <div className="w-full md:w-[380px] lg:w-[420px] shrink-0 flex flex-col bg-transparent">
                    {/* Filters Bar */}
                    <div className="flex-none pb-3 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                value={searchDemanda}
                                onChange={(e) => setSearchDemanda(e.target.value)}
                                placeholder="Buscar por demanda (nombre o número)..."
                                aria-label="Buscar por demanda"
                                className="w-full bg-transparent border border-border/50 rounded-md pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                            <select
                                value={filterZona}
                                onChange={(e) => setFilterZona(e.target.value)}
                                className="flex-1 min-w-0 bg-transparent border border-border/50 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                            >
                                <option value="all">Todas las zonas</option>
                                {zonas.map((z) => (
                                    <option key={z} value={z}>{z}</option>
                                ))}
                            </select>
                            <select
                                value={filterMinScore}
                                onChange={(e) => setFilterMinScore(Number(e.target.value))}
                                className="w-24 shrink-0 bg-transparent border border-border/50 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                            >
                                <option value={0}>Todos %</option>
                                <option value={50}>≥50%</option>
                                <option value={60}>≥60%</option>
                                <option value={75}>≥75%</option>
                                <option value={90}>≥90%</option>
                            </select>
                        </div>
                    </div>

                    {/* Feed List */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-2">
                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-4">
                                <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm font-medium text-muted-foreground">Sin resultados</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">Ajusta los filtros, busca por demanda o espera nuevos cruces.</p>
                            </div>
                        ) : (
                            paginatedMatches.map((m) => (
                                <div key={m.id} onClick={() => setSelectedMatch(m)}>
                                    <MatchCard
                                        match={m}
                                        isNew={newMatchIds.has(m.id)}
                                        isSelected={selectedMatch?.id === m.id}
                                    />
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination */}
                    {filtered.length > 0 && (
                        <div className="flex-none pt-3 flex items-center justify-between gap-2">
                            <button
                                onClick={goToPrevPage}
                                disabled={currentPage === 1}
                                className="px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Anterior
                            </button>
                            <span className="text-xs text-muted-foreground font-medium">
                                {currentPage} / {totalPages}
                                {totalMatches > loadedMatchesCount
                                    ? ` · ${loadedMatchesCount.toLocaleString("es-ES")} de ${totalMatches.toLocaleString("es-ES")}`
                                    : ""}
                            </span>
                            <button
                                onClick={goToNextPage}
                                disabled={loadingMore || (!hasMore && currentPage >= totalPages)}
                                className="px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : "Siguiente"}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Panel: Detail */}
                <div className="hidden md:block flex-1 min-w-0">
                    {selectedMatch ? (
                        <MatchDetailView match={selectedMatch} />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center border border-border/50 border-dashed rounded-xl bg-transparent text-center p-6">
                            <p className="text-sm font-medium text-muted-foreground">Selecciona un cruce</p>
                            <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                                Haz clic en un cruce del listado para ver el desglose de compatibilidad y los detalles de la propiedad y demanda.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function CrucesPage() {
    return (
        <Suspense
            fallback={(
                <div className="flex items-center justify-center h-[50vh]">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Cargando cruces...</p>
                    </div>
                </div>
            )}
        >
            <CrucesPageContent />
        </Suspense>
    );
}
