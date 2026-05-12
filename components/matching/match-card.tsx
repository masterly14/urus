"use client";

import { cn } from "@/lib/utils";

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
        mainPhotoUrl: string | null;
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
    isSelected?: boolean;
    className?: string;
}

export function getMatchColor(pct: number): string {
    if (pct >= 90) return "var(--urus-success)";
    if (pct >= 75) return "var(--urus-gold)";
    if (pct >= 60) return "var(--urus-warning)";
    return "var(--urus-danger)";
}

export function MatchCard({ match, isNew = false, isSelected = false, className }: MatchCardProps) {
    const matchColor = getMatchColor(match.porcentajeMatch);
    const time = new Date(match.fechaMatch).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    return (
        <div
            className={cn(
                "p-3 rounded-lg border transition-all duration-150 cursor-pointer",
                isSelected
                    ? "bg-accent/60 border-border/60 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-accent/30",
                className
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate text-foreground">
                            {match.propiedad.titulo || match.propiedad.ref}
                        </span>
                        {isNew && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-blue-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <span>{match.propiedad.precio.toLocaleString("es-ES")} €</span>
                        <span>·</span>
                        <span className="truncate">{match.propiedad.zona}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm font-semibold" style={{ color: matchColor }}>
                        {match.porcentajeMatch}%
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{time}</span>
                </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">
                    {match.comprador.nombre}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                    {match.comprador.leadStatus}
                </span>
            </div>
        </div>
    );
}
