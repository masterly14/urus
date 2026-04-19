"use client";

import { cn } from "@/lib/utils";
import {
    Home,
    User,
    MapPin,
    DollarSign,
    Ruler,
    BedDouble,
    Check,
    X,
    MessageCircle,
    ArrowLeftRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface CruceMatch {
    id: string;
    fechaMatch: string;
    position: string;
    propiedad: {
        id: string;
        ref: string;
        titulo: string;
        tipoOfer: string;
        precio: number;
        metros: number;
        habitaciones: number;
        zona: string;
        ciudad: string;
    };
    comprador: {
        id: string;
        nombre: string;
        presupuestoMin: number;
        presupuestoMax: number;
        habitacionesMin: number;
        tipos: string;
        zonasInteres: string[];
    };
    porcentajeMatch: number;
    matchScore: {
        zone?: { score: number; reason: string };
        price?: { score: number; reason: string };
        type?: { score: number; reason: string };
        size?: { score: number; reason: string };
        rooms?: { score: number; reason: string };
    } | null;
}

interface MatchCardProps {
    match: CruceMatch;
    isNew?: boolean;
    className?: string;
}

function getMatchColor(pct: number): string {
    if (pct >= 90) return "var(--urus-success)";
    if (pct >= 75) return "var(--urus-gold)";
    if (pct >= 60) return "var(--urus-warning)";
    return "var(--urus-danger)";
}

const CRITERIA = [
    { key: "zone", label: "Zona", icon: MapPin },
    { key: "price", label: "Precio", icon: DollarSign },
    { key: "type", label: "Tipología", icon: Home },
    { key: "size", label: "Superficie", icon: Ruler },
    { key: "rooms", label: "Habitaciones", icon: BedDouble },
] as const;

function CriterionBadge({ label, score, icon: Icon }: { label: string; score: number; icon: typeof Check }) {
    const isGood = score >= 0.6;
    return (
        <Badge
            variant="outline"
            className={cn(
                "text-[10px] gap-1 transition-all",
                isGood
                    ? "border-[var(--urus-success)]/30 text-[var(--urus-success)] bg-[var(--urus-success)]/5"
                    : score > 0
                        ? "border-[var(--urus-warning)]/30 text-[var(--urus-warning)] bg-[var(--urus-warning)]/5"
                        : "border-border/30 text-muted-foreground/50"
            )}
        >
            {isGood ? <Check className="h-2.5 w-2.5" /> : score > 0 ? <Icon className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
            {label}
            <span className="font-mono">{Math.round(score * 100)}%</span>
        </Badge>
    );
}

function MatchCard({ match, isNew = false, className }: MatchCardProps) {
    const matchColor = getMatchColor(match.porcentajeMatch);
    const matchDate = new Date(match.fechaMatch);
    const scores = match.matchScore;

    return (
        <Card
            className={cn(
                "border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card hover:shadow-lg hover:shadow-background/20 transition-all duration-500 group overflow-hidden",
                isNew && "animate-in slide-in-from-top-4 ease-out duration-700 ring-2 ring-secondary/30",
                className
            )}
        >
            <div className="h-1" style={{ background: `linear-gradient(90deg, ${matchColor}, transparent)` }} />

            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4 text-secondary" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Cruce Automático
                        </span>
                        {isNew && (
                            <Badge className="text-[9px] px-1.5 bg-secondary/15 text-secondary border-secondary/30 animate-pulse">
                                Nuevo
                            </Badge>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {matchDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {matchDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-center">
                    {/* Property */}
                    <div className="rounded-xl p-3 bg-accent/20 border border-border/30 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Home className="h-3.5 w-3.5 text-secondary" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Propiedad</span>
                        </div>
                        <p className="text-sm font-medium truncate">{match.propiedad.titulo || match.propiedad.ref}</p>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="font-mono font-semibold text-foreground">{match.propiedad.precio.toLocaleString("es-ES")} €</span>
                            <span>{match.propiedad.metros} m²</span>
                            <span>{match.propiedad.habitaciones} hab</span>
                            {match.propiedad.tipoOfer && (
                                <Badge variant="outline" className="text-[9px] px-1">{match.propiedad.tipoOfer}</Badge>
                            )}
                        </div>
                        <Badge variant="outline" className="text-[9px]">
                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                            {match.propiedad.zona}{match.propiedad.ciudad ? `, ${match.propiedad.ciudad}` : ""}
                        </Badge>
                    </div>

                    {/* Match gauge */}
                    <div className="flex flex-col items-center gap-1 px-2">
                        <div className="relative">
                            <svg width="64" height="64" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.08" />
                                <circle
                                    cx="32" cy="32" r="26"
                                    fill="none"
                                    stroke={matchColor}
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(match.porcentajeMatch / 100) * 163.36} 163.36`}
                                    transform="rotate(-90 32 32)"
                                    style={{ transition: "stroke-dasharray 1s ease" }}
                                />
                                <text x="32" y="35" textAnchor="middle" className="text-sm font-bold font-mono" fill={matchColor}>
                                    {match.porcentajeMatch}%
                                </text>
                            </svg>
                        </div>
                        <span className="text-[9px] text-muted-foreground font-medium">Match</span>
                    </div>

                    {/* Buyer */}
                    <div className="rounded-xl p-3 bg-accent/20 border border-border/30 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-[var(--urus-gold)]" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demanda</span>
                        </div>
                        <p className="text-sm font-medium truncate">{match.comprador.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                            Presupuesto: <span className="font-mono font-semibold text-foreground">
                                {match.comprador.presupuestoMin > 0
                                    ? `${match.comprador.presupuestoMin.toLocaleString("es-ES")} – ${match.comprador.presupuestoMax.toLocaleString("es-ES")} €`
                                    : `Hasta ${match.comprador.presupuestoMax.toLocaleString("es-ES")} €`
                                }
                            </span>
                        </p>
                        <div className="flex items-center gap-1 flex-wrap">
                            {match.comprador.zonasInteres.slice(0, 3).map((z) => (
                                <Badge key={z} variant="outline" className="text-[9px] px-1.5">{z}</Badge>
                            ))}
                            {match.comprador.zonasInteres.length > 3 && (
                                <Badge variant="outline" className="text-[9px] px-1.5">+{match.comprador.zonasInteres.length - 3}</Badge>
                            )}
                        </div>
                    </div>
                </div>

                {/* Scoring breakdown */}
                <div className="space-y-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Desglose de scoring</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {scores ? (
                            CRITERIA.map(({ key, label, icon }) => {
                                const s = scores[key];
                                return (
                                    <CriterionBadge
                                        key={key}
                                        label={label}
                                        score={s?.score ?? 0}
                                        icon={icon}
                                    />
                                );
                            })
                        ) : (
                            <span className="text-[10px] text-muted-foreground">Desglose no disponible</span>
                        )}
                    </div>
                </div>

                {/* Scoring reasons (expanded view) */}
                {scores && (
                    <div className="pt-2 border-t border-border/20">
                        <div className="flex items-center gap-1.5 bg-accent/10 rounded-lg px-2.5 py-1.5 border border-border/10">
                            <MessageCircle className="h-3 w-3 text-secondary shrink-0" />
                            <p className="text-[10px] text-muted-foreground truncate">
                                {scores.zone?.reason ?? "Zona evaluada"} · {scores.price?.reason ?? "Precio evaluado"}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export { MatchCard, getMatchColor };
