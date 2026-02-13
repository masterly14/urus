"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart3,
    MapPin,
    TrendingUp,
    TrendingDown,
    Home,
    Flame,
    Eye,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { propiedades } from "@/lib/mock-data/propiedades";

// Simulated zone market data
interface ZoneData {
    zona: string;
    precioMedio: number;
    precioM2: number;
    propiedades: number;
    tendencia: number; // % change month
    demanda: "alta" | "media" | "baja";
    color: string;
}

const zoneMarketData: ZoneData[] = [
    { zona: "Centro", precioMedio: 297500, precioM2: 3100, propiedades: 45, tendencia: 2.3, demanda: "alta", color: "#ef4444" },
    { zona: "Ensanche", precioMedio: 380000, precioM2: 3200, propiedades: 38, tendencia: 1.8, demanda: "alta", color: "#f97316" },
    { zona: "Colón", precioMedio: 550000, precioM2: 3600, propiedades: 12, tendencia: 3.1, demanda: "alta", color: "#dc2626" },
    { zona: "Ruzafa", precioMedio: 210000, precioM2: 3400, propiedades: 28, tendencia: 4.5, demanda: "alta", color: "#ea580c" },
    { zona: "Benimaclet", precioMedio: 230000, precioM2: 2800, propiedades: 22, tendencia: 1.2, demanda: "media", color: "#f59e0b" },
    { zona: "Marítimo", precioMedio: 340000, precioM2: 2900, propiedades: 18, tendencia: -0.5, demanda: "media", color: "#eab308" },
    { zona: "Carmen", precioMedio: 420000, precioM2: 3000, propiedades: 15, tendencia: -1.2, demanda: "baja", color: "#84cc16" },
    { zona: "Gran Vía", precioMedio: 200000, precioM2: 2600, propiedades: 20, tendencia: -0.8, demanda: "baja", color: "#22c55e" },
    { zona: "Ciudad de las Artes", precioMedio: 580000, precioM2: 3300, propiedades: 8, tendencia: 5.2, demanda: "alta", color: "#b91c1c" },
    { zona: "Politécnico", precioMedio: 420000, precioM2: 2500, propiedades: 10, tendencia: 0.4, demanda: "media", color: "#a3e635" },
];

// Simulated monthly price trends by zone
interface TrendPoint { month: string; value: number }
const months = ["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"];

function generateTrendData(baseM2: number, tendencia: number): TrendPoint[] {
    return months.map((month, i) => ({
        month,
        value: Math.round(baseM2 * (1 + (tendencia / 100) * (i - 5) * 0.4 / 6 + (Math.random() * 40 - 20))),
    }));
}

// Simulated competitor properties
interface CompetitorProp {
    id: string;
    agencia: string;
    direccion: string;
    precio: number;
    metros: number;
    zona: string;
    posicionPortal: number;
    diasPublicado: number;
    precioM2: number;
}

const competitors: CompetitorProp[] = [
    { id: "comp-1", agencia: "Inmovilla", direccion: "Calle Cuart 44, 3ºA", precio: 275000, metros: 90, zona: "Centro", posicionPortal: 1, diasPublicado: 5, precioM2: 3056 },
    { id: "comp-2", agencia: "Tecnocasa", direccion: "Av. del Puerto 15, 2ºB", precio: 365000, metros: 115, zona: "Marítimo", posicionPortal: 2, diasPublicado: 8, precioM2: 3174 },
    { id: "comp-3", agencia: "Engel & Völkers", direccion: "Calle Colón 50, 6ºA", precio: 520000, metros: 150, zona: "Colón", posicionPortal: 2, diasPublicado: 3, precioM2: 3467 },
    { id: "comp-4", agencia: "RE/MAX", direccion: "Blasco Ibáñez 30", precio: 235000, metros: 78, zona: "Benimaclet", posicionPortal: 1, diasPublicado: 12, precioM2: 3013 },
    { id: "comp-5", agencia: "Idealista Agents", direccion: "Calle Ruzafa 28, 1ºC", precio: 195000, metros: 60, zona: "Ruzafa", posicionPortal: 3, diasPublicado: 15, precioM2: 3250 },
    { id: "comp-6", agencia: "Century 21", direccion: "Gran Vía 12, 4ºD", precio: 188000, metros: 68, zona: "Gran Vía", posicionPortal: 4, diasPublicado: 25, precioM2: 2765 },
    { id: "comp-7", agencia: "Keller Williams", direccion: "Calle Sorní 22, 5ºA", precio: 355000, metros: 108, zona: "Ensanche", posicionPortal: 1, diasPublicado: 6, precioM2: 3287 },
    { id: "comp-8", agencia: "Inmovilla", direccion: "Av. Francia 45, 8ºB", precio: 590000, metros: 170, zona: "Ciudad de las Artes", posicionPortal: 3, diasPublicado: 10, precioM2: 3471 },
];

// Get demanda badge config
function demandaConfig(d: string) {
    switch (d) {
        case "alta": return { color: "var(--urus-success)", label: "Alta demanda" };
        case "media": return { color: "var(--urus-warning)", label: "Demanda media" };
        default: return { color: "var(--urus-danger)", label: "Baja demanda" };
    }
}

export default function MercadoPage() {
    const maxPrecioM2 = Math.max(...zoneMarketData.map((z) => z.precioM2));
    const trendLines = useMemo(() => {
        return zoneMarketData.slice(0, 5).map((z) => ({
            zona: z.zona,
            data: generateTrendData(z.precioM2, z.tendencia),
            color: z.color,
        }));
    }, []);

    // Find our properties in each zone
    const urusZones = useMemo(() => {
        const map: Record<string, number> = {};
        propiedades.forEach((p) => {
            map[p.zona] = (map[p.zona] || 0) + 1;
        });
        return map;
    }, []);

    // Trend chart dimensions
    const chartW = 500;
    const chartH = 140;
    const allTrendValues = trendLines.flatMap((l) => l.data.map((d) => d.value));
    const trendMin = Math.min(...allTrendValues) - 100;
    const trendMax = Math.max(...allTrendValues) + 100;

    return (
        <div className="space-y-6">
            {/* Back + Header */}
            <Link href="/pricing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
            </Link>

            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-secondary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Vista de Mercado</h1>
                    <p className="text-sm text-muted-foreground">Análisis comparativo por zona, tendencias y competencia directa</p>
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
                        {zoneMarketData.map((zone) => {
                            const intensity = (zone.precioM2 - 2400) / (maxPrecioM2 - 2400);
                            const dem = demandaConfig(zone.demanda);
                            const urusCount = urusZones[zone.zona] || 0;

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
                                            {urusCount > 0 && (
                                                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-secondary/10 text-secondary border-secondary/20">
                                                    {urusCount} URUS
                                                </Badge>
                                            )}
                                        </div>

                                        <p className="text-xl font-bold font-mono">{zone.precioM2.toLocaleString("es-ES")}<span className="text-[10px] text-muted-foreground font-normal"> €/m²</span></p>

                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-muted-foreground">{zone.propiedades} inmuebles</span>
                                            <span
                                                className="text-[10px] font-mono font-bold flex items-center gap-0.5"
                                                style={{ color: zone.tendencia >= 0 ? "var(--urus-success)" : "var(--urus-danger)" }}
                                            >
                                                {zone.tendencia >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                                                {zone.tendencia > 0 ? "+" : ""}{zone.tendencia}%
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

                    {/* Heat scale */}
                    <div className="mt-4 flex items-center justify-center gap-4">
                        <span className="text-[9px] text-muted-foreground">Menor precio</span>
                        <div className="h-2.5 w-40 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444, #b91c1c)" }} />
                        <span className="text-[9px] text-muted-foreground">Mayor precio</span>
                    </div>
                </CardContent>
            </Card>

            {/* Price Trends */}
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
                            {/* Grid */}
                            {[trendMin, Math.round((trendMin + trendMax) / 2), trendMax].map((v) => {
                                const y = ((trendMax - v) / (trendMax - trendMin)) * chartH;
                                return (
                                    <g key={v}>
                                        <line x1="0" y1={y} x2={chartW} y2={y} stroke="currentColor" strokeOpacity="0.06" />
                                        <text x="-8" y={y + 3} textAnchor="end" className="text-[8px]" fill="currentColor" opacity="0.3">{v.toLocaleString("es-ES")}</text>
                                    </g>
                                );
                            })}

                            {/* Month labels */}
                            {months.map((m, i) => (
                                <text key={m} x={(i / (months.length - 1)) * chartW} y={chartH + 16} textAnchor="middle" className="text-[8px]" fill="currentColor" opacity="0.4">{m}</text>
                            ))}

                            {/* Lines */}
                            {trendLines.map((tl) => {
                                const pts = tl.data.map((d, i) => ({
                                    x: (i / (tl.data.length - 1)) * chartW,
                                    y: ((trendMax - d.value) / (trendMax - trendMin)) * chartH,
                                }));
                                const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                                return (
                                    <g key={tl.zona}>
                                        <path d={d} fill="none" stroke={tl.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
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

            {/* Direct Competition Table */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-[var(--urus-gold)]" />
                            <CardTitle className="text-sm font-semibold">Competencia Directa</CardTitle>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Propiedades de competencia con mejor posicionamiento</p>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Agencia</th>
                                    <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Dirección</th>
                                    <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Zona</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">€/m²</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">m²</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pos. Portal</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Días publ.</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">vs URUS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/15">
                                {competitors.map((comp) => {
                                    // Find URUS property in same zone for comparison
                                    const urusProp = propiedades.find((p) => p.zona === comp.zona);
                                    const uruspM2 = urusProp ? Math.round(urusProp.precio / urusProp.metros) : null;
                                    const diff = uruspM2 ? ((comp.precioM2 - uruspM2) / uruspM2 * 100).toFixed(1) : null;

                                    return (
                                        <tr key={comp.id} className="hover:bg-accent/10 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <span className="text-xs font-medium">{comp.agencia}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs">{comp.direccion}</td>
                                            <td className="px-4 py-2.5">
                                                <Badge variant="outline" className="text-[9px]">{comp.zona}</Badge>
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-xs font-mono">{comp.precio.toLocaleString("es-ES")} €</td>
                                            <td className="px-4 py-2.5 text-right text-xs font-mono">{comp.precioM2.toLocaleString("es-ES")} €</td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">{comp.metros}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className="text-xs font-mono font-bold">#{comp.posicionPortal}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">{comp.diasPublicado}d</td>
                                            <td className="px-4 py-2.5 text-center">
                                                {diff !== null ? (
                                                    <span className={`text-xs font-mono font-bold ${parseFloat(diff) < 0 ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                                        {parseFloat(diff) > 0 ? "+" : ""}{diff}%
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary */}
                    <div className="mt-4 pt-3 border-t border-border/20 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(() => {
                            const avgCompM2 = Math.round(competitors.reduce((s, c) => s + c.precioM2, 0) / competitors.length);
                            const avgUrusM2 = Math.round(propiedades.reduce((s, p) => s + p.precio / p.metros, 0) / propiedades.length);
                            const avgCompPos = (competitors.reduce((s, c) => s + c.posicionPortal, 0) / competitors.length).toFixed(1);
                            const avgUrusPos = (propiedades.reduce((s, p) => s + p.posicionPortal, 0) / propiedades.length).toFixed(1);
                            return (
                                <>
                                    <div className="rounded-xl p-3 bg-accent/10 border border-border/20 text-center">
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">€/m² Competencia</p>
                                        <p className="text-lg font-bold font-mono">{avgCompM2.toLocaleString("es-ES")} €</p>
                                    </div>
                                    <div className="rounded-xl p-3 bg-accent/10 border border-border/20 text-center">
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">€/m² URUS</p>
                                        <p className="text-lg font-bold font-mono text-secondary">{avgUrusM2.toLocaleString("es-ES")} €</p>
                                    </div>
                                    <div className="rounded-xl p-3 bg-accent/10 border border-border/20 text-center">
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pos. media comp.</p>
                                        <p className="text-lg font-bold font-mono">#{avgCompPos}</p>
                                        <p className="text-[10px] text-muted-foreground">vs URUS #{avgUrusPos}</p>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
