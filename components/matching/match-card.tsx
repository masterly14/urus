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
    Send,
    ArrowLeftRight,
    Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Match, EstadoMensaje } from "@/lib/mock-data/types";

interface MatchCardProps {
    match: Match;
    isNew?: boolean;
    className?: string;
}

const estadoMensajeConfig: Record<EstadoMensaje, { label: string; color: string; icon: string }> = {
    enviado: { label: "Enviado", color: "var(--urus-info)", icon: "📤" },
    me_encaja: { label: "Me encaja", color: "var(--urus-success)", icon: "✅" },
    no_encaja: { label: "No me encaja", color: "var(--urus-danger)", icon: "❌" },
    busco_diferente: { label: "Busco diferente", color: "var(--urus-warning)", icon: "🔄" },
};

const variableConfig: Record<string, { label: string; icon: typeof Check }> = {
    precio: { label: "Precio", icon: DollarSign },
    zona: { label: "Zona", icon: MapPin },
    habitaciones: { label: "Habitaciones", icon: BedDouble },
    metros: { label: "Metros", icon: Ruler },
};

function getMatchColor(pct: number): string {
    if (pct >= 90) return "var(--urus-success)";
    if (pct >= 75) return "var(--urus-gold)";
    if (pct >= 60) return "var(--urus-warning)";
    return "var(--urus-danger)";
}

export function MatchCard({ match, isNew = false, className }: MatchCardProps) {
    const matchColor = getMatchColor(match.porcentajeMatch);
    const estado = estadoMensajeConfig[match.estadoMensaje];
    const matchDate = new Date(match.fechaMatch);
    const allVars = ["precio", "zona", "habitaciones", "metros"];

    return (
        <Card
            className={cn(
                "border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card hover:shadow-lg hover:shadow-background/20 transition-all duration-500 group overflow-hidden",
                isNew && "animate-in slide-in-from-top-4 ease-out duration-700 ring-2 ring-secondary/30",
                className
            )}
        >
            {/* Top color bar */}
            <div className="h-1" style={{ background: `linear-gradient(90deg, ${matchColor}, transparent)` }} />

            <CardContent className="p-4 space-y-4">
                {/* Match % + New badge */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4 text-secondary" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Cruce Automático
                        </span>
                        {isNew && (
                            <Badge className="text-[9px] px-1.5 bg-secondary/15 text-secondary border-secondary/30 animate-pulse">
                                ✨ Nuevo
                            </Badge>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {matchDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {matchDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>

                {/* Property ↔ Buyer */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-center">
                    {/* Property */}
                    <div className="rounded-xl p-3 bg-accent/20 border border-border/30 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <Home className="h-3.5 w-3.5 text-secondary" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Propiedad</span>
                        </div>
                        <p className="text-sm font-medium truncate">{match.propiedad.direccion}</p>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="font-mono font-semibold text-foreground">{match.propiedad.precio.toLocaleString("es-ES")} €</span>
                            <span>{match.propiedad.metros} m²</span>
                            <span>{match.propiedad.habitaciones} hab</span>
                        </div>
                        <Badge variant="outline" className="text-[9px]">
                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                            {match.propiedad.zona}
                        </Badge>
                    </div>

                    {/* Match % gauge */}
                    <div className="flex flex-col items-center gap-1 px-2">
                        <div className="relative">
                            <svg width="64" height="64" viewBox="0 0 64 64">
                                <circle
                                    cx="32" cy="32" r="26"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    opacity="0.08"
                                />
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
                                <text
                                    x="32" y="35"
                                    textAnchor="middle"
                                    className="text-sm font-bold font-mono"
                                    fill={matchColor}
                                >
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
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comprador</span>
                        </div>
                        <p className="text-sm font-medium truncate">{match.comprador.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                            Presupuesto: <span className="font-mono font-semibold text-foreground">{match.comprador.presupuestoMax.toLocaleString("es-ES")} €</span>
                        </p>
                        <div className="flex items-center gap-1 flex-wrap">
                            {match.comprador.zonasInteres.map((z) => (
                                <Badge key={z} variant="outline" className="text-[9px] px-1.5">
                                    {z}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Variables coincidentes */}
                <div className="space-y-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Variables de coincidencia</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {allVars.map((v) => {
                            const isMatch = match.variablesCoincidentes.includes(v);
                            const config = variableConfig[v];
                            const Icon = config?.icon || Check;
                            return (
                                <Badge
                                    key={v}
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] gap-1 transition-all",
                                        isMatch
                                            ? "border-[var(--urus-success)]/30 text-[var(--urus-success)] bg-[var(--urus-success)]/5"
                                            : "border-border/30 text-muted-foreground/50 line-through"
                                    )}
                                >
                                    {isMatch ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                                    {config?.label || v}
                                </Badge>
                            );
                        })}
                    </div>
                </div>

                {/* Estado del mensaje + Preview WA */}
                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                    <Badge
                        variant="outline"
                        className="text-[10px] gap-1"
                        style={{
                            borderColor: `color-mix(in oklch, ${estado.color} 40%, transparent)`,
                            color: estado.color,
                            backgroundColor: `color-mix(in oklch, ${estado.color} 6%, transparent)`,
                        }}
                    >
                        <span>{estado.icon}</span>
                        {estado.label}
                    </Badge>

                    {/* WhatsApp preview snippet */}
                    <div className="flex items-center gap-1.5 bg-[#075e54]/10 dark:bg-[#25D366]/8 rounded-lg px-2.5 py-1.5 border border-[#25D366]/20 max-w-[260px]">
                        <MessageCircle className="h-3 w-3 text-[#25D366] shrink-0" />
                        <p className="text-[10px] text-muted-foreground truncate">
                            &quot;Hola {match.comprador.nombre.split(" ")[0]}, tenemos una propiedad en {match.propiedad.zona}...&quot;
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export { getMatchColor, estadoMensajeConfig };
