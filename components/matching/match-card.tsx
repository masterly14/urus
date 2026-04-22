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
    Bath,
    Camera,
    Calendar,
    Phone,
    Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AiIndicator } from "@/components/ui/ai-indicator";

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
        banyos: number;
        zona: string;
        ciudad: string;
        estado: string;
        numFotos: number;
        fechaAlta: string;
    };
    comprador: {
        id: string;
        nombre: string;
        presupuestoMin: number;
        presupuestoMax: number;
        habitacionesMin: number;
        tipos: string;
        zonasInteres: string[];
        telefono: string;
        leadStatus: string;
        metrosMin: number | null;
        metrosMax: number | null;
        estadoNombre: string;
    };
    porcentajeMatch: number;
    matchScore: {
        zone?: { score: number; reason: string };
        price?: { score: number; reason: string };
        type?: { score: number; reason: string };
        size?: { score: number; reason: string };
        rooms?: { score: number; reason: string };
    } | null;
    whatsappEnviado: boolean;
    validationToken: string | null;
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

    const leadStatusLabel: Record<string, { label: string; color: string }> = {
        NUEVO: { label: "Nuevo", color: "var(--urus-info)" },
        CONTACTADO: { label: "Contactado", color: "var(--urus-gold)" },
        EN_SELECCION: { label: "En selección", color: "var(--urus-warning)" },
        VISITA_PENDIENTE: { label: "Visita pendiente", color: "var(--urus-warning)" },
        OFERTA: { label: "Oferta", color: "var(--urus-success)" },
        CERRADO: { label: "Cerrado", color: "var(--urus-success)" },
        DESCARTADO: { label: "Descartado", color: "var(--urus-danger)" },
    };

    const statusInfo = leadStatusLabel[match.comprador.leadStatus] ?? { label: match.comprador.leadStatus, color: "var(--urus-info)" };

    return (
        <Card
            className={cn(
                "transition-all duration-300 group overflow-hidden hover:shadow-[var(--shadow-elevated)]",
                isNew && "animate-in slide-in-from-top-4 ease-out duration-700 ring-2 ring-primary/20",
                className
            )}
        >
            <div className="h-1" style={{ background: `linear-gradient(90deg, ${matchColor}, transparent)` }} />

            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Cruce Automático
                        </span>
                        <AiIndicator />
                        {isNew && (
                            <Badge className="text-[9px] px-1.5 bg-secondary/15 text-secondary border-secondary/30 animate-pulse">
                                Nuevo
                            </Badge>
                        )}
                        {match.whatsappEnviado && (
                            <Badge className="text-[9px] px-1.5 bg-[#25D366]/15 text-[#25D366] border-[#25D366]/30">
                                <Check className="h-2.5 w-2.5 mr-0.5" />
                                WA Enviado
                            </Badge>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {matchDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {matchDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-center">
                    {/* Property */}
                    <div className="rounded-lg p-3 bg-accent/20 border border-border/30 space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Home className="h-3.5 w-3.5 text-secondary" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Propiedad</span>
                            {match.propiedad.estado && (
                                <Badge variant="outline" className="text-[9px] px-1 ml-auto">{match.propiedad.estado}</Badge>
                            )}
                        </div>
                        <p className="text-sm font-medium truncate">{match.propiedad.titulo || match.propiedad.ref}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono">Ref: {match.propiedad.ref || match.propiedad.id}</p>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                            <span className="font-mono font-semibold text-foreground">{match.propiedad.precio.toLocaleString("es-ES")} €</span>
                            <span className="flex items-center gap-0.5"><Ruler className="h-2.5 w-2.5" />{match.propiedad.metros} m²</span>
                            <span className="flex items-center gap-0.5"><BedDouble className="h-2.5 w-2.5" />{match.propiedad.habitaciones} hab</span>
                            <span className="flex items-center gap-0.5"><Bath className="h-2.5 w-2.5" />{match.propiedad.banyos} baños</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {match.propiedad.tipoOfer && (
                                <Badge variant="outline" className="text-[9px] px-1">
                                    <Tag className="h-2.5 w-2.5 mr-0.5" />{match.propiedad.tipoOfer}
                                </Badge>
                            )}
                            <Badge variant="outline" className="text-[9px]">
                                <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                {match.propiedad.zona}{match.propiedad.ciudad ? `, ${match.propiedad.ciudad}` : ""}
                            </Badge>
                            {match.propiedad.numFotos > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1">
                                    <Camera className="h-2.5 w-2.5 mr-0.5" />{match.propiedad.numFotos}
                                </Badge>
                            )}
                            {match.propiedad.fechaAlta && (
                                <Badge variant="outline" className="text-[9px] px-1">
                                    <Calendar className="h-2.5 w-2.5 mr-0.5" />{match.propiedad.fechaAlta}
                                </Badge>
                            )}
                        </div>
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

                    {/* Buyer / Demand */}
                    <div className="rounded-lg p-3 bg-accent/20 border border-border/30 space-y-2">
                        <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-[var(--urus-gold)]" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demanda</span>
                            <Badge
                                variant="outline"
                                className="text-[9px] px-1 ml-auto"
                                style={{ borderColor: `${statusInfo.color}40`, color: statusInfo.color }}
                            >
                                {statusInfo.label}
                            </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">{match.comprador.nombre}</p>
                        {match.comprador.telefono && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Phone className="h-2.5 w-2.5" />
                                <span className="font-mono">{match.comprador.telefono}</span>
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Presupuesto: <span className="font-mono font-semibold text-foreground">
                                {match.comprador.presupuestoMin > 0
                                    ? `${match.comprador.presupuestoMin.toLocaleString("es-ES")} – ${match.comprador.presupuestoMax.toLocaleString("es-ES")} €`
                                    : `Hasta ${match.comprador.presupuestoMax.toLocaleString("es-ES")} €`
                                }
                            </span>
                        </p>
                        {(match.comprador.metrosMin || match.comprador.metrosMax) && (
                            <p className="text-[10px] text-muted-foreground">
                                Superficie: <span className="font-mono font-semibold text-foreground">
                                    {match.comprador.metrosMin && match.comprador.metrosMax
                                        ? `${match.comprador.metrosMin} – ${match.comprador.metrosMax} m²`
                                        : match.comprador.metrosMin
                                            ? `Desde ${match.comprador.metrosMin} m²`
                                            : `Hasta ${match.comprador.metrosMax} m²`
                                    }
                                </span>
                            </p>
                        )}
                        {match.comprador.tipos && (
                            <p className="text-[10px] text-muted-foreground">
                                Busca: <span className="font-semibold text-foreground">{match.comprador.tipos}</span>
                            </p>
                        )}
                        {match.comprador.habitacionesMin > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                                Mín. habitaciones: <span className="font-mono font-semibold text-foreground">{match.comprador.habitacionesMin}</span>
                            </p>
                        )}
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
