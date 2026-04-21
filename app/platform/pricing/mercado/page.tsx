"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    BedDouble,
    Bath,
    ChevronDown,
    ChevronUp,
    ClipboardCopy,
    Download,
    FileText,
    Ruler,
    Sparkles,
    TrendingUp,
    TrendingDown,
    Flame,
    Eye,
    ImageOff,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Info,
    RefreshCw,
    ShieldAlert,
    Target,
    X,
    Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
    MercadoResponse,
    ZoneAggregation,
    CompetitorProperty,
    ZoneDetailResponse,
    ZonePropertyDetail,
} from "@/lib/pricing/mercado-types";
import type {
    MarketReportRecord,
    MarketReport,
} from "@/lib/pricing/market-report-types";

const HEAT_COLORS = [
    "#22c55e", "#84cc16", "#a3e635", "#eab308", "#f59e0b",
    "#f97316", "#ea580c", "#ef4444", "#dc2626", "#b91c1c",
];

function zoneColor(index: number, total: number): string {
    const pos = total <= 1 ? HEAT_COLORS.length - 1 : Math.round((index / (total - 1)) * (HEAT_COLORS.length - 1));
    return HEAT_COLORS[pos];
}

function demandaConfig(d: string) {
    switch (d) {
        case "alta": return { color: "var(--urus-success)", label: "Alta demanda" };
        case "media": return { color: "var(--urus-warning)", label: "Demanda media" };
        default: return { color: "var(--urus-danger)", label: "Baja demanda" };
    }
}

function semaforoColor(s: string): string {
    switch (s) {
        case "verde": return "var(--urus-success)";
        case "amarillo": return "var(--urus-warning)";
        case "rojo": return "var(--urus-danger)";
        default: return "var(--muted-foreground)";
    }
}

interface ZoneDetailState {
    loading: boolean;
    error: string | null;
    data: ZoneDetailResponse | null;
}

export default function MercadoPage() {
    const [data, setData] = useState<MercadoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [zoneDetails, setZoneDetails] = useState<Record<string, ZoneDetailState>>({});
    const detailPanelRef = useRef<HTMLDivElement | null>(null);

    const [informe, setInforme] = useState<MarketReportRecord | null>(null);
    const [informeLoading, setInformeLoading] = useState(false);
    const [informeError, setInformeError] = useState<string | null>(null);
    const [informeExpanded, setInformeExpanded] = useState(true);
    const [informeFetched, setInformeFetched] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function fetchMercado() {
            try {
                const res = await fetch("/api/pricing/mercado");
                if (!res.ok) {
                    throw new Error(res.status === 401 ? "Sesión expirada" : `Error ${res.status}`);
                }
                const json: MercadoResponse = await res.json();
                setData(json);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Error cargando datos");
            } finally {
                setLoading(false);
            }
        }
        fetchMercado();
    }, []);

    const fetchZoneDetail = useCallback(async (zona: string) => {
        setZoneDetails((prev) => ({
            ...prev,
            [zona]: { loading: true, error: null, data: prev[zona]?.data ?? null },
        }));
        try {
            const res = await fetch(`/api/pricing/mercado/zona/${encodeURIComponent(zona)}`);
            if (!res.ok) {
                throw new Error(res.status === 401 ? "Sesión expirada" : `Error ${res.status}`);
            }
            const json: ZoneDetailResponse = await res.json();
            setZoneDetails((prev) => ({
                ...prev,
                [zona]: { loading: false, error: null, data: json },
            }));
        } catch (err) {
            setZoneDetails((prev) => ({
                ...prev,
                [zona]: {
                    loading: false,
                    error: err instanceof Error ? err.message : "Error cargando zona",
                    data: prev[zona]?.data ?? null,
                },
            }));
        }
    }, []);

    useEffect(() => {
        if (informeFetched || !data) return;
        setInformeFetched(true);
        const ciudad = data.ciudad || "Todas";
        fetch(`/api/pricing/mercado/informe?ciudad=${encodeURIComponent(ciudad)}`)
            .then((r) => r.json())
            .then((json) => {
                if (json?.id) setInforme(json as MarketReportRecord);
            })
            .catch(() => {});
    }, [data, informeFetched]);

    const handleGenerateInforme = useCallback(async () => {
        setInformeLoading(true);
        setInformeError(null);
        try {
            const ciudad = data?.ciudad || "Todas";
            const res = await fetch("/api/pricing/mercado/informe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ciudad: ciudad === "Todas" ? undefined : ciudad }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({ error: `Error ${res.status}` }));
                throw new Error(body.error || `Error ${res.status}`);
            }
            const record: MarketReportRecord = await res.json();
            setInforme(record);
            setInformeExpanded(true);
        } catch (err) {
            setInformeError(err instanceof Error ? err.message : "Error generando informe");
        } finally {
            setInformeLoading(false);
        }
    }, [data]);

    const handleCopyInforme = useCallback(async () => {
        if (!informe) return;
        const r = informe.report;
        const md = [
            `# Informe de Mercado — ${informe.ciudad}`,
            `*${new Date(informe.generatedAt).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}*\n`,
            `## Resumen Ejecutivo\n${r.resumenEjecutivo}\n`,
            `## Panorama de Mercado\n${r.panoramaMercado.descripcion}\n- Oferta: ${r.panoramaMercado.ofertaTotal} inmuebles\n- Rango: ${r.panoramaMercado.rangoM2}\n- Demanda: ${r.panoramaMercado.demandaGlobal}\n`,
            `## Zonas Destacadas\n${r.zonasDestacadas.map((z) => `### ${z.zona} — ${z.precioMedioM2.toLocaleString("es-ES")} €/m²\n${z.interpretacion}${z.oportunidad ? `\n- **Oportunidad**: ${z.oportunidad}` : ""}`).join("\n\n")}\n`,
            `## Posicionamiento URUS\n${r.posicionamientoUrus.diagnostico}\n- Verde: ${r.posicionamientoUrus.semaforos.verde} · Amarillo: ${r.posicionamientoUrus.semaforos.amarillo} · Rojo: ${r.posicionamientoUrus.semaforos.rojo}\n- Diferencia media: ${r.posicionamientoUrus.gapMedio > 0 ? "+" : ""}${r.posicionamientoUrus.gapMedio.toFixed(1)}%\n`,
            `## Oportunidades\n${r.oportunidades.map((o) => `- ${o}`).join("\n")}\n`,
            `## Riesgos\n${r.riesgos.map((ri) => `- ${ri}`).join("\n")}`,
        ].join("\n");
        await navigator.clipboard.writeText(md);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [informe]);

    const zoneDetailsRef = useRef(zoneDetails);
    useEffect(() => {
        zoneDetailsRef.current = zoneDetails;
    }, [zoneDetails]);

    const handleZoneToggle = useCallback(
        (zona: string) => {
            setSelectedZone((prev) => (prev === zona ? null : zona));
        },
        [],
    );

    useEffect(() => {
        if (!selectedZone) return;
        const current = zoneDetailsRef.current[selectedZone];
        if (!current?.data && !current?.loading) {
            void fetchZoneDetail(selectedZone);
        }
        requestAnimationFrame(() => {
            detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }, [selectedZone, fetchZoneDetail]);

    const zones = data?.zones ?? [];
    const competitors = data?.competitors ?? [];

    const maxPrecioM2 = useMemo(
        () => zones.length > 0 ? Math.max(...zones.map((z) => z.precioMedioM2)) : 1,
        [zones],
    );
    const minPrecioM2 = useMemo(
        () => zones.length > 0 ? Math.min(...zones.map((z) => z.precioMedioM2)) : 0,
        [zones],
    );

    const zonesWithColor = useMemo(
        () => zones.map((z, i) => ({ ...z, color: zoneColor(i, zones.length) })),
        [zones],
    );

    const trendLines = useMemo(() => {
        return zonesWithColor.slice(0, 5).map((z) => {
            const base = z.precioMedioM2;
            const t = z.tendenciaPorcentaje;
            const months = ["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"];
            const data = months.map((month, i) => ({
                month,
                value: Math.round(base * (1 + (t / 100) * (i - 5) * 0.4 / 6)),
            }));
            return { zona: z.zona, data, color: z.color };
        });
    }, [zonesWithColor]);

    const chartW = 500;
    const chartH = 140;
    const allTrendValues = trendLines.flatMap((l) => l.data.map((d) => d.value));
    const trendMin = allTrendValues.length > 0 ? Math.min(...allTrendValues) - 100 : 0;
    const trendMax = allTrendValues.length > 0 ? Math.max(...allTrendValues) + 100 : 100;
    const months = ["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando datos de mercado…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
                <AlertTriangle className="h-6 w-6 text-[var(--urus-danger)]" />
                <p className="text-sm">{error}</p>
                <button
                    onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
                    className="text-xs text-secondary hover:underline"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    if (zones.length === 0 && competitors.length === 0) {
        return (
            <div className="space-y-6">
                <Link href="/platform/pricing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
                </Link>
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No hay datos de mercado disponibles.</p>
                    <p className="text-xs">Ejecuta análisis de pricing sobre tus propiedades para poblar esta vista.</p>
                </div>
            </div>
        );
    }

    const avgUrusM2 = competitors.length > 0
        ? Math.round(competitors.reduce((s, c) => s + c.precioM2, 0) / competitors.length)
        : 0;
    const avgZoneM2 = zones.length > 0
        ? Math.round(zones.reduce((s, z) => s + z.precioMedioM2, 0) / zones.length)
        : 0;
    const avgGap = competitors.length > 0
        ? (competitors.reduce((s, c) => s + c.gapPorcentaje, 0) / competitors.length).toFixed(1)
        : "0";
    const totalProps = zones.reduce((s, z) => s + z.propiedades, 0);

    return (
        <div className="space-y-6">
            <Link href="/platform/pricing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
            </Link>

            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-secondary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Vista de Mercado</h1>
                    <p className="text-sm text-muted-foreground">
                        Análisis comparativo por zona, tendencias y competencia directa
                        {data?.ciudad && data.ciudad !== "Todas" && (
                            <span className="ml-1">— {data.ciudad}</span>
                        )}
                    </p>
                </div>
            </div>

            {/* ── AI Market Report ──────────────────────────────────────── */}
            <MarketReportCard
                informe={informe}
                loading={informeLoading}
                error={informeError}
                expanded={informeExpanded}
                copied={copied}
                onToggle={() => setInformeExpanded((v) => !v)}
                onGenerate={handleGenerateInforme}
                onCopy={handleCopyInforme}
            />

            {/* Heat Map by Zone */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-[var(--urus-danger)]" />
                        <CardTitle className="text-sm font-semibold">Mapa de Calor — Precio Medio por Zona (€/m²)</CardTitle>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                        Cada tarjeta es una zona con el <span className="font-medium text-foreground">€/m² medio</span> agregado
                        de tu cartera y sus comparables. La <span className="font-medium text-foreground">intensidad del fondo</span> indica
                        el ranking relativo de precio (verde = más barata, rojo = más cara dentro de las zonas mostradas).
                        La flecha muestra la <span className="font-medium text-foreground">diferencia media frente al mercado</span>:
                        positivo = tu cartera está por debajo del mercado en esa zona (hay margen al alza);
                        negativo = tu cartera está por encima.
                    </p>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {zonesWithColor.map((zone) => {
                            const range = maxPrecioM2 - minPrecioM2;
                            const intensity = range > 0 ? (zone.precioMedioM2 - minPrecioM2) / range : 0.5;
                            const dem = demandaConfig(zone.demanda);
                            const isActive = selectedZone === zone.zona;
                            const isExpandable = zone.propiedadesUrus > 0;

                            return (
                                <button
                                    key={zone.zona}
                                    type="button"
                                    onClick={() => isExpandable && handleZoneToggle(zone.zona)}
                                    aria-expanded={isActive}
                                    aria-controls={isExpandable ? "mercado-zona-detail" : undefined}
                                    disabled={!isExpandable}
                                    className={`text-left rounded-xl p-4 border transition-all group relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60 ${
                                        isActive
                                            ? "border-secondary/60 ring-1 ring-secondary/30 shadow-[0_0_0_1px_color-mix(in_oklch,var(--secondary)_25%,transparent)]"
                                            : "border-border/20"
                                    } ${
                                        isExpandable
                                            ? "hover:scale-[1.03] hover:border-border/40 cursor-pointer"
                                            : "cursor-default opacity-80"
                                    }`}
                                    style={{
                                        background: `linear-gradient(135deg, color-mix(in oklch, ${zone.color} ${Math.round(intensity * 25 + 5)}%, transparent), transparent)`,
                                    }}
                                    title={isExpandable ? `Ver inmuebles URUS en ${zone.zona}` : `Sin inmuebles URUS en ${zone.zona}`}
                                >
                                    <div className="space-y-2 relative z-10">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-semibold truncate">{zone.zona}</p>
                                            {zone.propiedadesUrus > 0 && (
                                                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-secondary/10 text-secondary border-secondary/20 shrink-0">
                                                    {zone.propiedadesUrus} URUS
                                                </Badge>
                                            )}
                                        </div>

                                        <p className="text-xl font-bold font-mono">
                                            {zone.precioMedioM2.toLocaleString("es-ES")}
                                            <span className="text-[10px] text-muted-foreground font-normal"> €/m²</span>
                                        </p>

                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-muted-foreground">{zone.propiedades} inmuebles</span>
                                            <span
                                                className="text-[10px] font-mono font-bold flex items-center gap-0.5"
                                                style={{ color: zone.tendenciaPorcentaje >= 0 ? "var(--urus-success)" : "var(--urus-danger)" }}
                                            >
                                                {zone.tendenciaPorcentaje >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                                                {zone.tendenciaPorcentaje > 0 ? "+" : ""}{zone.tendenciaPorcentaje}%
                                            </span>
                                        </div>

                                        <Badge
                                            variant="outline"
                                            className="text-[8px] w-full justify-center"
                                            style={{ borderColor: `color-mix(in oklch, ${dem.color} 40%, transparent)`, color: dem.color }}
                                        >
                                            {dem.label}
                                        </Badge>

                                        {isExpandable && (
                                            <div className="flex items-center justify-center pt-0.5">
                                                <ChevronDown
                                                    className={`h-3 w-3 text-muted-foreground transition-transform ${isActive ? "rotate-180 text-secondary" : "opacity-60 group-hover:opacity-100"}`}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {selectedZone && (
                        <ZoneDetailPanel
                            ref={detailPanelRef}
                            zone={zonesWithColor.find((z) => z.zona === selectedZone)}
                            state={zoneDetails[selectedZone]}
                            onClose={() => setSelectedZone(null)}
                            onRetry={() => void fetchZoneDetail(selectedZone)}
                        />
                    )}

                    <div className="mt-5 pt-4 border-t border-border/20 space-y-3">
                        <div className="flex items-center justify-center gap-4">
                            <span className="text-[9px] text-muted-foreground">Menor precio</span>
                            <div className="h-2.5 w-40 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444, #b91c1c)" }} />
                            <span className="text-[9px] text-muted-foreground">Mayor precio</span>
                        </div>

                        <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                            <Info className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
                            <div className="space-y-1.5">
                                <p><span className="font-medium text-foreground">Demanda</span> — clasificación según volumen de inmuebles activos y diferencia de precio media de la zona:</p>
                                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pl-0">
                                    <li className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--urus-success)" }} />
                                        <span><span className="font-medium text-foreground">Alta</span>: ≥ 15 inmuebles y diferencia media ≤ 0%</span>
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--urus-warning)" }} />
                                        <span><span className="font-medium text-foreground">Media</span>: ≥ 8 inmuebles o diferencia media ≤ 3%</span>
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--urus-danger)" }} />
                                        <span><span className="font-medium text-foreground">Baja</span>: poca actividad o diferencia elevada</span>
                                    </li>
                                </ul>
                                <p className="pt-1">
                                    El badge <span className="font-medium text-foreground">N URUS</span> indica cuántos inmuebles de tu cartera están activos en esa zona.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Price Trends */}
            {trendLines.length > 0 && (
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Tendencia de Precios por Zona (€/m²)</CardTitle>
                            </div>
                            <div className="flex gap-3 flex-wrap">
                                {trendLines.map((tl) => (
                                    <span key={tl.zona} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tl.color }} />
                                        {tl.zona}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                            Proyección del <span className="font-medium text-foreground">€/m²</span> de las 5 zonas con mayor peso en tu cartera a lo largo de los últimos 6 meses.
                            Cada línea representa una zona (mismo color que en el mapa de calor); el punto de la derecha (Feb) es el precio medio actual.
                            La pendiente se <span className="font-medium text-foreground">deriva de la diferencia actual de tu cartera frente al mercado</span>:
                            zonas donde tus inmuebles están por debajo del mercado aparecen en ascenso (margen al alza),
                            zonas donde tus inmuebles están por encima aparecen en descenso.
                            <span className="italic"> No es un histórico medido mes a mes, es una estimación basada en la diferencia de precio media.</span>
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="py-4">
                            <svg width="100%" viewBox={`-40 -15 ${chartW + 60} ${chartH + 35}`} className="overflow-visible">
                                {[trendMin, Math.round((trendMin + trendMax) / 2), trendMax].map((v) => {
                                    const y = ((trendMax - v) / (trendMax - trendMin)) * chartH;
                                    return (
                                        <g key={v}>
                                            <line x1="0" y1={y} x2={chartW} y2={y} stroke="currentColor" strokeOpacity="0.06" />
                                            <text x="-8" y={y + 3} textAnchor="end" className="text-[8px]" fill="currentColor" opacity="0.3">{v.toLocaleString("es-ES")}</text>
                                        </g>
                                    );
                                })}

                                {months.map((m, i) => (
                                    <text key={m} x={(i / (months.length - 1)) * chartW} y={chartH + 16} textAnchor="middle" className="text-[8px]" fill="currentColor" opacity="0.4">{m}</text>
                                ))}

                                {trendLines.map((tl) => {
                                    const pts = tl.data.map((d, i) => ({
                                        x: (i / (tl.data.length - 1)) * chartW,
                                        y: ((trendMax - d.value) / (trendMax - trendMin)) * chartH,
                                    }));
                                    const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                                    return (
                                        <g key={tl.zona}>
                                            <path d={pathD} fill="none" stroke={tl.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                                            {pts.map((p, i) => (
                                                <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--color-card)" stroke={tl.color} strokeWidth="1.5" />
                                            ))}
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Portfolio Table */}
            {competitors.length > 0 && (
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-[var(--urus-gold)]" />
                                <CardTitle className="text-sm font-semibold">Cartera URUS — Posicionamiento vs Mercado</CardTitle>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Propiedades con informe de pricing generado</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                            Inmuebles de tu cartera ordenados por magnitud del desvío frente al mercado.
                            El <span className="font-medium text-foreground">semáforo</span> resume el diagnóstico global del informe de pricing;
                            la <span className="font-medium text-foreground">diferencia</span> es el desvío porcentual entre tu €/m² y la mediana de comparables
                            (positivo = por encima del mercado, negativo = por debajo).
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border/30">
                                        <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Propiedad</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Zona</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">€/m²</th>
                                        <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">m²</th>
                                        <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Semáforo</th>
                                        <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Diferencia vs mercado</th>
                                        <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Días publ.</th>
                                        <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Comparables</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/15">
                                    {competitors.map((comp) => (
                                        <tr key={comp.propertyCode} className="hover:bg-accent/10 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <Link
                                                    href={`/platform/pricing/analisis/${comp.propertyCode}`}
                                                    className="text-xs font-medium hover:text-secondary transition-colors"
                                                >
                                                    {comp.titulo}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Badge variant="outline" className="text-[9px]">{comp.zona}</Badge>
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-xs font-mono">{comp.precio.toLocaleString("es-ES")} €</td>
                                            <td className="px-4 py-2.5 text-right text-xs font-mono">{comp.precioM2.toLocaleString("es-ES")} €</td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">{comp.metros}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span
                                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                                    style={{ backgroundColor: semaforoColor(comp.semaforo) }}
                                                    title={comp.semaforo}
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span
                                                    className={`text-xs font-mono font-bold ${comp.gapPorcentaje <= 0 ? "text-[var(--urus-success)]" : comp.gapPorcentaje <= 5 ? "text-[var(--urus-warning)]" : "text-[var(--urus-danger)]"}`}
                                                >
                                                    {comp.gapPorcentaje > 0 ? "+" : ""}{comp.gapPorcentaje.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">
                                                {comp.diasPublicado !== null ? `${comp.diasPublicado}d` : "—"}
                                            </td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">{comp.totalComparables}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 pt-3 border-t border-border/20 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl p-3 bg-accent/10 border border-border/20 text-center">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">€/m² Medio Mercado</p>
                                <p className="text-lg font-bold font-mono">{avgZoneM2.toLocaleString("es-ES")} €</p>
                            </div>
                            <div className="rounded-xl p-3 bg-accent/10 border border-border/20 text-center">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">€/m² URUS</p>
                                <p className="text-lg font-bold font-mono text-secondary">{avgUrusM2.toLocaleString("es-ES")} €</p>
                            </div>
                            <div className="rounded-xl p-3 bg-accent/10 border border-border/20 text-center">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Diferencia media vs mercado</p>
                                <p className="text-lg font-bold font-mono">
                                    {parseFloat(avgGap) > 0 ? "+" : ""}{avgGap}%
                                </p>
                                <p className="text-[10px] text-muted-foreground">{totalProps} inmuebles en {zones.length} zonas</p>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-border/20 flex items-start gap-2 text-[10px] text-muted-foreground">
                            <Info className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
                            <div className="space-y-1.5">
                                <p className="font-medium text-foreground">Cómo leer la tabla</p>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 pl-0">
                                    <li className="flex items-start gap-1.5">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0" style={{ background: "var(--urus-success)" }} />
                                        <span><span className="font-medium text-foreground">Verde</span>: diferencia ≤ 5% — precio alineado con el mercado, mantener estrategia.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0" style={{ background: "var(--urus-warning)" }} />
                                        <span><span className="font-medium text-foreground">Amarillo</span>: entre 5% y 12% — revisar fotos, descripción o posicionamiento.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0" style={{ background: "var(--urus-danger)" }} />
                                        <span><span className="font-medium text-foreground">Rojo</span>: diferencia &gt; 12% — precio significativamente desviado, requiere acción.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0 bg-muted-foreground/40" />
                                        <span><span className="font-medium text-foreground">Días publ.</span>: días transcurridos desde el alta en Inmovilla.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0 bg-muted-foreground/40" />
                                        <span><span className="font-medium text-foreground">Comparables</span>: nº de inmuebles usados como referencia en el análisis de pricing.</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0 bg-muted-foreground/40" />
                                        <span>Haz clic en el título del inmueble para abrir su informe detallado.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone detail panel
// Shown inline below the heat map when a zone tile is clicked. Lazy-loaded,
// cached per zone in parent state. Non-invasive: appears below the grid, does
// not reflow the tiles above it.
// ─────────────────────────────────────────────────────────────────────────────

interface ZoneDetailPanelProps {
    zone: (ZoneAggregation & { color: string }) | undefined;
    state: ZoneDetailState | undefined;
    onClose: () => void;
    onRetry: () => void;
    ref: React.Ref<HTMLDivElement>;
}

function ZoneDetailPanel({ zone, state, onClose, onRetry, ref }: ZoneDetailPanelProps) {
    if (!zone) return null;
    const dem = demandaConfig(zone.demanda);

    return (
        <div
            ref={ref}
            id="mercado-zona-detail"
            className="mt-5 pt-5 border-t border-border/30 animate-in fade-in slide-in-from-top-1 duration-200"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: zone.color }}
                    />
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{zone.zona}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>
                                <span className="font-mono font-semibold text-foreground">
                                    {zone.precioMedioM2.toLocaleString("es-ES")}
                                </span>{" "}
                                €/m² medio
                            </span>
                            <span>·</span>
                            <span>{zone.propiedadesUrus} URUS / {zone.propiedades} total</span>
                            <span>·</span>
                            <span style={{ color: dem.color }}>{dem.label}</span>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-accent/20"
                    aria-label="Cerrar detalle de zona"
                >
                    <X className="h-3 w-3" />
                    Cerrar
                </button>
            </div>

            {state?.loading && !state.data && (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Cargando inmuebles de la zona…</span>
                </div>
            )}

            {state?.error && !state.data && (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <AlertTriangle className="h-5 w-5 text-[var(--urus-danger)]" />
                    <p className="text-xs">{state.error}</p>
                    <button
                        onClick={onRetry}
                        className="text-[11px] text-secondary hover:underline"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            {state?.data && state.data.properties.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Eye className="h-5 w-5 opacity-30" />
                    <p className="text-xs">No hay inmuebles URUS activos en esta zona.</p>
                </div>
            )}

            {state?.data && state.data.properties.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {state.data.properties.map((prop) => (
                        <ZonePropertyTile key={prop.codigo} property={prop} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ZonePropertyTile({ property }: { property: ZonePropertyDetail }) {
    const [errored, setErrored] = useState(false);
    const showImage = Boolean(property.mainPhotoUrl) && !errored;
    const dotColor = property.semaforo ? semaforoColor(property.semaforo) : "var(--muted-foreground)";

    return (
        <Link
            href={`/platform/pricing/informe/${property.codigo}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card/70 hover:border-secondary/50 hover:shadow-lg hover:shadow-background/20 transition-all"
        >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted/60 via-background to-muted/30">
                {showImage ? (
                    <Image
                        src={property.mainPhotoUrl as string}
                        alt={property.titulo}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        onError={() => setErrored(true)}
                        unoptimized
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/60">
                        <ImageOff className="h-5 w-5" />
                        <span className="text-[9px] uppercase tracking-wider">Sin imagen</span>
                        {property.numFotos > 0 && (
                            <span className="text-[8px] text-muted-foreground/50">
                                {property.numFotos} fotos en Inmovilla
                            </span>
                        )}
                    </div>
                )}

                {property.semaforo && (
                    <div
                        className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md border bg-background/85 backdrop-blur px-1.5 py-0.5 text-[9px] font-medium"
                        style={{
                            borderColor: `color-mix(in oklch, ${dotColor} 45%, transparent)`,
                            color: dotColor,
                        }}
                        title={`Semáforo del informe: ${property.semaforo}`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                        {property.semaforo === "sin_datos" ? "Sin datos" : property.semaforo}
                    </div>
                )}

                {property.gapPorcentaje !== null && (
                    <div
                        className="absolute top-2 right-2 rounded-md bg-background/85 backdrop-blur px-1.5 py-0.5 text-[9px] font-mono font-bold"
                        style={{
                            color:
                                property.gapPorcentaje <= 0
                                    ? "var(--urus-success)"
                                    : property.gapPorcentaje <= 5
                                        ? "var(--urus-warning)"
                                        : "var(--urus-danger)",
                        }}
                        title="Diferencia frente a mercado"
                    >
                        {property.gapPorcentaje > 0 ? "+" : ""}
                        {property.gapPorcentaje.toFixed(1)}%
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1.5 p-3">
                <p className="text-xs font-semibold leading-tight line-clamp-2" title={property.titulo}>
                    {property.titulo}
                </p>

                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">
                        {property.precio.toLocaleString("es-ES")} €
                    </span>
                    {property.precioM2 > 0 && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                            {property.precioM2.toLocaleString("es-ES")} €/m²
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                    {property.metrosConstruidos > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <Ruler className="h-3 w-3" />
                            {property.metrosConstruidos} m²
                        </span>
                    )}
                    {property.habitaciones > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {property.habitaciones}
                        </span>
                    )}
                    {property.banyos > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <Bath className="h-3 w-3" />
                            {property.banyos}
                        </span>
                    )}
                    <span className="font-mono text-muted-foreground/70 ml-auto">{property.codigo}</span>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-border/20">
                    <span className="text-[10px] text-muted-foreground">
                        {property.analyzedAt ? "Con informe" : "Sin informe"}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver informe <ArrowRight className="h-3 w-3" />
                    </span>
                </div>
            </div>
        </Link>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Market Report Card (Informe IA)
// ─────────────────────────────────────────────────────────────────────────────

interface MarketReportCardProps {
    informe: MarketReportRecord | null;
    loading: boolean;
    error: string | null;
    expanded: boolean;
    copied: boolean;
    onToggle: () => void;
    onGenerate: () => void;
    onCopy: () => void;
}

function MarketReportCard({
    informe,
    loading,
    error,
    expanded,
    copied,
    onToggle,
    onGenerate,
    onCopy,
}: MarketReportCardProps) {
    const report = informe?.report ?? null;

    return (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[var(--urus-gold)]" />
                        <CardTitle className="text-sm font-semibold">Informe IA de Mercado</CardTitle>
                        {informe && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(informe.generatedAt).toLocaleDateString("es-ES", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {informe && (
                            <>
                                <button
                                    type="button"
                                    onClick={onCopy}
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-accent/20"
                                    title="Copiar como Markdown"
                                >
                                    {copied
                                        ? <><CheckCircle2 className="h-3 w-3 text-[var(--urus-success)]" /> Copiado</>
                                        : <><ClipboardCopy className="h-3 w-3" /> Copiar</>
                                    }
                                </button>
                                <a
                                    href={`/api/pricing/mercado/informe/${informe.id}/pdf`}
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-accent/20"
                                    title="Descargar PDF"
                                    download
                                >
                                    <Download className="h-3 w-3" /> PDF
                                </a>
                                <button
                                    type="button"
                                    onClick={onToggle}
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-accent/20"
                                >
                                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    {expanded ? "Colapsar" : "Expandir"}
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onGenerate}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary/15 text-secondary hover:bg-secondary/25 disabled:opacity-50 transition-colors"
                        >
                            {loading
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                                : informe
                                    ? <><RefreshCw className="h-3.5 w-3.5" /> Regenerar</>
                                    : <><Sparkles className="h-3.5 w-3.5" /> Generar informe IA</>
                            }
                        </button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-3">
                {error && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--urus-danger)]/10 border border-[var(--urus-danger)]/20 mb-3">
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--urus-danger)] shrink-0" />
                        <p className="text-xs text-[var(--urus-danger)]">{error}</p>
                    </div>
                )}

                {!informe && !loading && !error && (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                        <FileText className="h-6 w-6 opacity-30" />
                        <p className="text-xs text-center max-w-md">
                            Genera un informe estratégico con IA que analiza tus datos de mercado
                            y produce un diagnóstico ejecutivo con oportunidades, riesgos y
                            posicionamiento de URUS Capital Group.
                        </p>
                    </div>
                )}

                {loading && !informe && (
                    <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Analizando mercado con IA — puede tardar 15–30 segundos…</span>
                    </div>
                )}

                {report && expanded && (
                    <MarketReportBody report={report} confidence={report.confidence} />
                )}

                {report && !expanded && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {report.resumenEjecutivo}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function MarketReportBody({ report, confidence }: { report: MarketReport; confidence: number }) {
    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {/* Resumen Ejecutivo */}
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <Target className="h-3.5 w-3.5 text-secondary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary">Resumen Ejecutivo</h3>
                    <Badge variant="outline" className="text-[8px] ml-auto">
                        Confianza: {Math.round(confidence * 100)}%
                    </Badge>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{report.resumenEjecutivo}</p>
            </div>

            {/* Panorama */}
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Panorama de Mercado</h3>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Oferta</p>
                        <p className="text-sm font-bold font-mono">{report.panoramaMercado.ofertaTotal}</p>
                    </div>
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Rango €/m²</p>
                        <p className="text-sm font-bold font-mono">{report.panoramaMercado.rangoM2}</p>
                    </div>
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Demanda</p>
                        <p className={`text-sm font-bold ${
                            report.panoramaMercado.demandaGlobal === "alta" ? "text-[var(--urus-success)]"
                                : report.panoramaMercado.demandaGlobal === "media" ? "text-[var(--urus-warning)]"
                                    : "text-[var(--urus-danger)]"
                        }`}>
                            {report.panoramaMercado.demandaGlobal.charAt(0).toUpperCase() + report.panoramaMercado.demandaGlobal.slice(1)}
                        </p>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{report.panoramaMercado.descripcion}</p>
            </div>

            {/* Zonas Destacadas */}
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <Flame className="h-3.5 w-3.5 text-[var(--urus-warning)]" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zonas Destacadas</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {report.zonasDestacadas.map((z) => (
                        <div key={z.zona} className="rounded-xl p-3 border border-border/30 bg-accent/5 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">{z.zona}</span>
                                <span className="text-xs font-mono font-bold">{z.precioMedioM2.toLocaleString("es-ES")} €/m²</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{z.interpretacion}</p>
                            {z.oportunidad && (
                                <p className="text-[11px] text-[var(--urus-success)] leading-relaxed flex items-start gap-1">
                                    <Zap className="h-3 w-3 shrink-0 mt-0.5" />
                                    {z.oportunidad}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Posicionamiento URUS */}
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <Eye className="h-3.5 w-3.5 text-[var(--urus-gold)]" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Posicionamiento URUS</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Propiedades</p>
                        <p className="text-sm font-bold font-mono">{report.posicionamientoUrus.totalPropiedades}</p>
                    </div>
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Verde</p>
                        <p className="text-sm font-bold font-mono text-[var(--urus-success)]">{report.posicionamientoUrus.semaforos.verde}</p>
                    </div>
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Amarillo</p>
                        <p className="text-sm font-bold font-mono text-[var(--urus-warning)]">{report.posicionamientoUrus.semaforos.amarillo}</p>
                    </div>
                    <div className="rounded-lg p-2.5 bg-accent/10 border border-border/20 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Rojo</p>
                        <p className="text-sm font-bold font-mono text-[var(--urus-danger)]">{report.posicionamientoUrus.semaforos.rojo}</p>
                    </div>
                </div>
                <div className="rounded-xl p-3 border border-border/30 bg-accent/5 space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Diferencia media vs mercado:</span>
                        <span className={`text-xs font-mono font-bold ${
                            report.posicionamientoUrus.gapMedio > 5 ? "text-[var(--urus-danger)]"
                                : report.posicionamientoUrus.gapMedio > 0 ? "text-[var(--urus-warning)]"
                                    : "text-[var(--urus-success)]"
                        }`}>
                            {report.posicionamientoUrus.gapMedio > 0 ? "+" : ""}{report.posicionamientoUrus.gapMedio.toFixed(1)}%
                        </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{report.posicionamientoUrus.concentracionGeografica}</p>
                </div>
                <p className="text-xs text-foreground leading-relaxed">{report.posicionamientoUrus.diagnostico}</p>
            </div>

            {/* Oportunidades + Riesgos side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Zap className="h-3.5 w-3.5 text-[var(--urus-success)]" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--urus-success)]">Oportunidades</h3>
                    </div>
                    <ul className="space-y-1.5">
                        {report.oportunidades.map((o, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground leading-relaxed">
                                <span className="inline-block h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 bg-[var(--urus-success)]" />
                                {o}
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <ShieldAlert className="h-3.5 w-3.5 text-[var(--urus-danger)]" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--urus-danger)]">Riesgos</h3>
                    </div>
                    <ul className="space-y-1.5">
                        {report.riesgos.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground leading-relaxed">
                                <span className="inline-block h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 bg-[var(--urus-danger)]" />
                                {r}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
