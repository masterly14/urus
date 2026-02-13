"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Tag,
    MapPin,
    BedDouble,
    Ruler,
    Home,
    TrendingDown,
    TrendingUp,
    Check,
    X,
    BrainCircuit,
    BarChart3,
    ArrowDown,
    Camera,
    RotateCcw,
    Sparkles,
    AlertTriangle,
    Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SemaforoIndicator, semaforoConfig } from "@/components/pricing/semaforo-indicator";
import { propiedades } from "@/lib/mock-data/propiedades";
import type { Propiedad, SemaforoStatus } from "@/lib/mock-data/types";

// Generate simulated cluster (similar properties)
function generateCluster(prop: Propiedad): Array<{ id: string; direccion: string; precio: number; metros: number; habitaciones: number; zona: string; extras: Record<string, boolean>; portalPos: number; diasPublicado: number }> {
    const base = prop.precio;
    const clusterData = [
        { suffix: "4ºA", delta: -0.08, metrosDelta: -5, pos: 1, dias: 15 },
        { suffix: "2ºB", delta: -0.04, metrosDelta: 0, pos: 2, dias: 22 },
        { suffix: "6ºC", delta: 0.02, metrosDelta: 10, pos: 4, dias: 8 },
        { suffix: "1ºD", delta: 0.06, metrosDelta: -10, pos: 5, dias: 35 },
        { suffix: "3ºE", delta: 0.12, metrosDelta: 15, pos: 8, dias: 45 },
        { suffix: "Bajo", delta: -0.12, metrosDelta: -15, pos: 3, dias: 12 },
    ];

    return clusterData.map((c, i) => ({
        id: `cluster-${i}`,
        direccion: `${prop.zona}, ${c.suffix}`,
        precio: Math.round(base * (1 + c.delta)),
        metros: prop.metros + c.metrosDelta,
        habitaciones: prop.habitaciones,
        zona: prop.zona,
        extras: {
            terraza: i % 2 === 0,
            garaje: i < 3,
            ascensor: i !== 4,
            reformado: i < 2,
        },
        portalPos: c.pos,
        diasPublicado: c.dias,
    }));
}

// Generate simulated position history
function generatePositionHistory(currentPos: number): Array<{ month: string; position: number }> {
    const months = ["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"];
    const startPos = Math.min(20, currentPos + Math.floor(Math.random() * 8) + 3);
    return months.map((month, i) => {
        const progress = i / (months.length - 1);
        const position = Math.round(startPos + (currentPos - startPos) * progress + (Math.random() * 2 - 1));
        return { month, position: Math.max(1, i === months.length - 1 ? currentPos : position) };
    });
}

// AI recommendations based on property status
function getRecommendation(prop: Propiedad): { action: string; color: string; icon: typeof ArrowDown; text: string } {
    if (prop.semaforo === "rojo") {
        if (prop.gapPrecio > 10) {
            return {
                action: "Bajar precio",
                color: "var(--urus-danger)",
                icon: ArrowDown,
                text: `Para competir con los 5 primeros resultados en ${prop.zona}, el precio debería reducirse un ${Math.abs(prop.gapPrecio).toFixed(1)}% (≈ ${(prop.precio * Math.abs(prop.gapPrecio) / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €). Las propiedades comparables en esta zona se venden a una media de ${Math.round(prop.precio / prop.metros * (1 - prop.gapPrecio / 100))} €/m². Llevas ${prop.diasSinLlamadas} días sin recibir llamadas, lo que confirma un desajuste con el mercado. Recomendamos ajustar el precio a ${(prop.precio * (1 - prop.gapPrecio / 100)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} € para reactivar el interés.`,
            };
        }
        return {
            action: "Reposicionar",
            color: "var(--urus-danger)",
            icon: RotateCcw,
            text: `Esta propiedad lleva ${prop.diasSinLlamadas} días sin actividad y ocupa la posición #${prop.posicionPortal} en portales. Sugerimos retirar temporalmente del mercado, mejorar la presentación visual y volver a publicar con un precio ajustado. Esto genera efecto "novedad" en los portales y mejora el posicionamiento orgánico.`,
        };
    }

    if (prop.semaforo === "amarillo") {
        return {
            action: "Mejorar fotos",
            color: "var(--urus-warning)",
            icon: Camera,
            text: `La propiedad tiene un gap de precio moderado (+${prop.gapPrecio}%) pero su posición en portal (#${prop.posicionPortal}) sugiere baja visibilidad. Antes de ajustar precio, recomendamos invertir en fotografía profesional, home staging virtual y mejorar la descripción. Propiedades con fotos profesionales en ${prop.zona} reciben 3x más solicitudes de visita.`,
        };
    }

    return {
        action: "Mantener estrategia",
        color: "var(--urus-success)",
        icon: Check,
        text: `La propiedad está bien posicionada (#${prop.posicionPortal}) con un gap competitivo (${prop.gapPrecio}%). Recomendamos mantener la estrategia actual y monitorear semanalmente. Si la posición cae por debajo del #5, considere reajustar.`,
    };
}

export default function AnalisisPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const prop = propiedades.find((p) => p.id === resolvedParams.id);

    if (!prop) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Home className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h2 className="text-lg font-semibold">Propiedad no encontrada</h2>
                <p className="text-sm text-muted-foreground mt-1">El inmueble solicitado no existe en el sistema.</p>
                <Link href="/pricing" className="mt-4 text-sm text-secondary hover:underline">← Volver a Smart Pricing</Link>
            </div>
        );
    }

    const semConfig = semaforoConfig[prop.semaforo];
    const cluster = generateCluster(prop);
    const positionHistory = generatePositionHistory(prop.posicionPortal);
    const recommendation = getRecommendation(prop);
    const RecommIcon = recommendation.icon;
    const pricePerM2 = Math.round(prop.precio / prop.metros);
    const clusterAvgPrice = Math.round(cluster.reduce((s, c) => s + c.precio, 0) / cluster.length);
    const clusterAvgM2 = Math.round(cluster.reduce((s, c) => s + c.precio / c.metros, 0) / cluster.length);

    // Position chart dimensions
    const chartW = 400;
    const chartH = 100;
    const maxPos = Math.max(...positionHistory.map((h) => h.position), 20);
    const points = positionHistory.map((h, i) => ({
        x: (i / (positionHistory.length - 1)) * chartW,
        y: ((h.position - 1) / (maxPos - 1)) * chartH,
    }));
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    return (
        <div className="space-y-6">
            {/* Back */}
            <Link href="/pricing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
            </Link>

            {/* Header */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: semConfig.color }} />
                <CardContent className="p-6">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <SemaforoIndicator status={prop.semaforo} size="xl" />
                                <div>
                                    <h1 className="text-xl font-bold">{prop.direccion}</h1>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-xs"><MapPin className="h-3 w-3 mr-0.5" /> {prop.zona}</Badge>
                                        <Badge variant="outline" className="text-xs">{prop.tipologia}</Badge>
                                        <Badge
                                            variant="outline"
                                            className="text-xs"
                                            style={{
                                                borderColor: prop.estado === "Reservado" ? "var(--urus-success)" : undefined,
                                                color: prop.estado === "Reservado" ? "var(--urus-success)" : undefined,
                                            }}
                                        >
                                            {prop.estado}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Key metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="text-center px-4 py-2 rounded-xl bg-accent/10 border border-border/20">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Precio</p>
                                <p className="text-lg font-bold font-mono">{prop.precio.toLocaleString("es-ES")} €</p>
                                <p className="text-[10px] text-muted-foreground">{pricePerM2.toLocaleString("es-ES")} €/m²</p>
                            </div>
                            <div className="text-center px-4 py-2 rounded-xl bg-accent/10 border border-border/20">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Superficie</p>
                                <p className="text-lg font-bold font-mono">{prop.metros} m²</p>
                                <p className="text-[10px] text-muted-foreground">{prop.habitaciones} habitaciones</p>
                            </div>
                            <div className="text-center px-4 py-2 rounded-xl bg-accent/10 border border-border/20">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Gap Precio</p>
                                <p className="text-lg font-bold font-mono" style={{ color: prop.gapPrecio > 0 ? "var(--urus-danger)" : "var(--urus-success)" }}>
                                    {prop.gapPrecio > 0 ? "+" : ""}{prop.gapPrecio}%
                                </p>
                                <p className="text-[10px] text-muted-foreground">vs media zona</p>
                            </div>
                            <div className="text-center px-4 py-2 rounded-xl bg-accent/10 border border-border/20">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Posición Portal</p>
                                <p className="text-lg font-bold font-mono">#{prop.posicionPortal}</p>
                                <p className="text-[10px] text-muted-foreground">{prop.diasSinLlamadas}d sin llamadas</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* AI Recommendation + Gap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* AI Recommendation */}
                <Card
                    className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden"
                    style={{ borderColor: `color-mix(in oklch, ${recommendation.color} 25%, var(--color-border))` }}
                >
                    <div className="h-1" style={{ backgroundColor: recommendation.color }} />
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <BrainCircuit className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Recomendación IA</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Action badge */}
                        <div className="flex items-center gap-3">
                            <Badge
                                className="text-sm px-4 py-2 gap-2"
                                style={{
                                    backgroundColor: `color-mix(in oklch, ${recommendation.color} 12%, transparent)`,
                                    color: recommendation.color,
                                    borderColor: `color-mix(in oklch, ${recommendation.color} 30%, transparent)`,
                                }}
                            >
                                <RecommIcon className="h-4 w-4" />
                                {recommendation.action}
                            </Badge>
                        </div>

                        {/* Text */}
                        <div className="rounded-xl p-4 bg-accent/10 border border-border/20">
                            <div className="flex items-start gap-2">
                                <Sparkles className="h-4 w-4 text-[var(--urus-gold)] shrink-0 mt-0.5" />
                                <p className="text-xs text-muted-foreground leading-relaxed">{recommendation.text}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Price Gap */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Gap de Precio vs Cluster</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Visual bar */}
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Tu precio</span>
                                    <span className="font-mono font-bold">{prop.precio.toLocaleString("es-ES")} €</span>
                                </div>
                                <div className="h-4 rounded-full bg-accent/20 overflow-hidden relative">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${Math.min((prop.precio / (clusterAvgPrice * 1.3)) * 100, 100)}%`,
                                            backgroundColor: prop.gapPrecio > 0 ? "var(--urus-danger)" : "var(--urus-success)",
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Media cluster</span>
                                    <span className="font-mono font-bold">{clusterAvgPrice.toLocaleString("es-ES")} €</span>
                                </div>
                                <div className="h-4 rounded-full bg-accent/20 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-secondary/60"
                                        style={{ width: `${Math.min((clusterAvgPrice / (clusterAvgPrice * 1.3)) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* €/m² comparison */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
                            <div className="text-center rounded-xl p-3 bg-accent/10 border border-border/20">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Tu €/m²</p>
                                <p className="text-lg font-bold font-mono">{pricePerM2.toLocaleString("es-ES")} €</p>
                            </div>
                            <div className="text-center rounded-xl p-3 bg-accent/10 border border-border/20">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Media €/m²</p>
                                <p className="text-lg font-bold font-mono">{clusterAvgM2.toLocaleString("es-ES")} €</p>
                            </div>
                        </div>

                        <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                                Diferencia: <span className={`font-bold font-mono ${prop.gapPrecio > 0 ? "text-[var(--urus-danger)]" : "text-[var(--urus-success)]"}`}>
                                    {prop.gapPrecio > 0 ? "+" : ""}{prop.gapPrecio}%
                                </span> respecto al cluster
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Cluster Comparativo */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Home className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Cluster Comparativo</CardTitle>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Propiedades similares en {prop.zona} — misma tipología y metros
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Dirección</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">€/m²</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">m²</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pos. Portal</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Días pub.</th>
                                    <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">vs URUS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/15">
                                {/* Current property row highlighted */}
                                <tr className="bg-secondary/5 border-l-2 border-secondary">
                                    <td className="px-4 py-2.5">
                                        <span className="text-xs font-semibold text-secondary">▸ {prop.direccion}</span>
                                        <Badge className="ml-2 text-[8px] px-1.5 bg-secondary/15 text-secondary border-secondary/30">URUS</Badge>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-xs font-mono font-bold">{prop.precio.toLocaleString("es-ES")} €</td>
                                    <td className="px-4 py-2.5 text-right text-xs font-mono">{pricePerM2.toLocaleString("es-ES")} €</td>
                                    <td className="px-4 py-2.5 text-center text-xs font-mono">{prop.metros}</td>
                                    <td className="px-4 py-2.5 text-center text-xs font-mono">#{prop.posicionPortal}</td>
                                    <td className="px-4 py-2.5 text-center text-xs font-mono">{prop.diasSinLlamadas}d</td>
                                    <td className="px-4 py-2.5 text-center text-xs font-mono">—</td>
                                </tr>
                                {cluster.map((c) => {
                                    const diff = ((c.precio - prop.precio) / prop.precio * 100).toFixed(1);
                                    const isLower = parseFloat(diff) < 0;
                                    return (
                                        <tr key={c.id} className="hover:bg-accent/10 transition-colors">
                                            <td className="px-4 py-2.5 text-xs">{c.direccion}</td>
                                            <td className="px-4 py-2.5 text-right text-xs font-mono">{c.precio.toLocaleString("es-ES")} €</td>
                                            <td className="px-4 py-2.5 text-right text-xs font-mono">{Math.round(c.precio / c.metros).toLocaleString("es-ES")} €</td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">{c.metros}</td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">#{c.portalPos}</td>
                                            <td className="px-4 py-2.5 text-center text-xs font-mono">{c.diasPublicado}d</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`text-xs font-mono font-bold ${isLower ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                                    {isLower ? "" : "+"}{diff}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Extras Comparison + Position History */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Extras Comparison */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-[var(--urus-success)]" />
                            <CardTitle className="text-sm font-semibold">Comparación de Extras</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-left px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Extra</th>
                                    <th className="text-center px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">URUS</th>
                                    {cluster.slice(0, 4).map((c, i) => (
                                        <th key={c.id} className="text-center px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">#{i + 1}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/15">
                                {(["terraza", "garaje", "ascensor", "reformado"] as const).map((extra) => (
                                    <tr key={extra} className="hover:bg-accent/10 transition-colors">
                                        <td className="px-3 py-2 text-xs capitalize font-medium">{extra}</td>
                                        <td className="px-3 py-2 text-center">
                                            {prop.extras[extra] ? (
                                                <Check className="h-4 w-4 text-[var(--urus-success)] mx-auto" />
                                            ) : (
                                                <X className="h-4 w-4 text-[var(--urus-danger)]/50 mx-auto" />
                                            )}
                                        </td>
                                        {cluster.slice(0, 4).map((c) => (
                                            <td key={c.id} className="px-3 py-2 text-center">
                                                {c.extras[extra] ? (
                                                    <Check className="h-3.5 w-3.5 text-[var(--urus-success)]/60 mx-auto" />
                                                ) : (
                                                    <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Extras advantage count */}
                        <div className="mt-4 pt-3 border-t border-border/20 text-center">
                            {(() => {
                                const ownExtras = Object.values(prop.extras).filter(Boolean).length;
                                const avgExtras = cluster.reduce((s, c) => s + Object.values(c.extras).filter(Boolean).length, 0) / cluster.length;
                                const advantage = ownExtras - avgExtras;
                                return (
                                    <p className="text-xs text-muted-foreground">
                                        URUS tiene <span className="font-bold text-foreground">{ownExtras}/4</span> extras vs media de <span className="font-bold text-foreground">{avgExtras.toFixed(1)}/4</span> —{" "}
                                        <span className={`font-bold ${advantage >= 0 ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                            {advantage >= 0 ? "Ventaja competitiva" : "Desventaja competitiva"}
                                        </span>
                                    </p>
                                );
                            })()}
                        </div>
                    </CardContent>
                </Card>

                {/* Position History */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-secondary" />
                            <CardTitle className="text-sm font-semibold">Histórico de Posición en Portales</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Chart */}
                        <div className="py-4">
                            <svg width="100%" viewBox={`-20 -10 ${chartW + 40} ${chartH + 30}`} className="overflow-visible">
                                {/* Grid lines */}
                                {[1, 5, 10, 15, 20].filter((v) => v <= maxPos).map((v) => {
                                    const yPos = ((v - 1) / (maxPos - 1)) * chartH;
                                    return (
                                        <g key={v}>
                                            <line x1="0" y1={yPos} x2={chartW} y2={yPos} stroke="currentColor" strokeOpacity="0.06" />
                                            <text x="-8" y={yPos + 3} textAnchor="end" className="text-[8px]" fill="currentColor" opacity="0.3">#{v}</text>
                                        </g>
                                    );
                                })}

                                {/* Path */}
                                <path d={pathD} fill="none" stroke="var(--color-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                                {/* Area */}
                                <path
                                    d={`${pathD} L ${chartW} ${chartH} L 0 ${chartH} Z`}
                                    fill="var(--color-secondary)"
                                    opacity="0.06"
                                />

                                {/* Points */}
                                {points.map((p, i) => (
                                    <g key={i}>
                                        <circle cx={p.x} cy={p.y} r="4" fill="var(--color-card)" stroke="var(--color-secondary)" strokeWidth="2" />
                                        <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[8px] font-mono font-bold" fill="var(--color-secondary)">
                                            #{positionHistory[i].position}
                                        </text>
                                        <text x={p.x} y={chartH + 15} textAnchor="middle" className="text-[8px]" fill="currentColor" opacity="0.4">
                                            {positionHistory[i].month}
                                        </text>
                                    </g>
                                ))}
                            </svg>
                        </div>

                        {/* Trend note */}
                        <div className="rounded-xl p-3 bg-accent/10 border border-border/20">
                            {(() => {
                                const first = positionHistory[0].position;
                                const last = positionHistory[positionHistory.length - 1].position;
                                const improved = last < first;
                                return (
                                    <div className="flex items-center gap-2">
                                        {improved ? (
                                            <TrendingUp className="h-4 w-4 text-[var(--urus-success)]" />
                                        ) : (
                                            <TrendingDown className="h-4 w-4 text-[var(--urus-danger)]" />
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            La posición {improved ? "mejoró" : "empeoró"} de #{first} a #{last} en 6 meses{" "}
                                            <span className={`font-bold ${improved ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                                                ({improved ? "↑" : "↓"} {Math.abs(first - last)} posiciones)
                                            </span>
                                        </p>
                                    </div>
                                );
                            })()}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
