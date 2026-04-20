"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart3,
    TrendingUp,
    TrendingDown,
    Flame,
    Eye,
    Loader2,
    AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
    MercadoResponse,
    ZoneAggregation,
    CompetitorProperty,
} from "@/lib/pricing/mercado-types";

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

export default function MercadoPage() {
    const [data, setData] = useState<MercadoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

            {/* Heat Map by Zone */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-[var(--urus-danger)]" />
                        <CardTitle className="text-sm font-semibold">Mapa de Calor — Precio Medio por Zona (€/m²)</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {zonesWithColor.map((zone) => {
                            const range = maxPrecioM2 - minPrecioM2;
                            const intensity = range > 0 ? (zone.precioMedioM2 - minPrecioM2) / range : 0.5;
                            const dem = demandaConfig(zone.demanda);

                            return (
                                <div
                                    key={zone.zona}
                                    className="rounded-xl p-4 border border-border/20 hover:scale-[1.03] transition-all cursor-default group relative overflow-hidden"
                                    style={{
                                        background: `linear-gradient(135deg, color-mix(in oklch, ${zone.color} ${Math.round(intensity * 25 + 5)}%, transparent), transparent)`,
                                    }}
                                >
                                    <div className="space-y-2 relative z-10">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-semibold truncate">{zone.zona}</p>
                                            {zone.propiedadesUrus > 0 && (
                                                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-secondary/10 text-secondary border-secondary/20">
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
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-4">
                        <span className="text-[9px] text-muted-foreground">Menor precio</span>
                        <div className="h-2.5 w-40 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444, #b91c1c)" }} />
                        <span className="text-[9px] text-muted-foreground">Mayor precio</span>
                    </div>
                </CardContent>
            </Card>

            {/* Price Trends */}
            {trendLines.length > 0 && (
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
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
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-[var(--urus-gold)]" />
                                <CardTitle className="text-sm font-semibold">Cartera URUS — Posicionamiento vs Mercado</CardTitle>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Propiedades con informe de pricing generado</p>
                        </div>
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
                                        <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Gap vs mercado</th>
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
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Gap medio vs mercado</p>
                                <p className="text-lg font-bold font-mono">
                                    {parseFloat(avgGap) > 0 ? "+" : ""}{avgGap}%
                                </p>
                                <p className="text-[10px] text-muted-foreground">{totalProps} inmuebles en {zones.length} zonas</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
