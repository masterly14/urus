"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    MapPin,
    DollarSign,
    Ruler,
    BedDouble,
    TrendingUp,
    TrendingDown,
    ArrowRight,
    Phone,
    Eye,
    Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SemaforoIndicator, semaforoConfig } from "./semaforo-indicator";
import type { Propiedad } from "@/lib/mock-data/types";

interface PropertyCardProps {
    property: Propiedad;
    className?: string;
}

export function PropertyCard({ property, className }: PropertyCardProps) {
    const semConfig = semaforoConfig[property.semaforo];
    const isNegativeGap = property.gapPrecio < 0;

    return (
        <Link href={`/pricing/analisis/${property.id}`}>
            <Card
                className={cn(
                    "border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card hover:shadow-lg hover:shadow-background/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer group overflow-hidden",
                    className
                )}
            >
                {/* Top semáforo bar */}
                <div className="h-1" style={{ backgroundColor: semConfig.color }} />

                <CardContent className="p-4 space-y-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <SemaforoIndicator status={property.semaforo} size="sm" />
                                <p className="text-sm font-semibold truncate">{property.direccion}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px]">
                                    <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                    {property.zona}
                                </Badge>
                                <Badge variant="outline" className="text-[9px]">
                                    {property.tipologia}
                                </Badge>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-lg font-bold font-mono">{property.precio.toLocaleString("es-ES")} €</p>
                            <p className="text-[10px] text-muted-foreground">{(property.precio / property.metros).toFixed(0)} €/m²</p>
                        </div>
                    </div>

                    {/* Property details */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Ruler className="h-3 w-3" />
                            {property.metros} m²
                        </span>
                        <span className="flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {property.habitaciones} hab
                        </span>
                        <Badge
                            variant="outline"
                            className="text-[9px]"
                            style={{
                                borderColor: property.estado === "Reservado" ? "var(--urus-success)" : "var(--color-border)",
                                color: property.estado === "Reservado" ? "var(--urus-success)" : undefined,
                            }}
                        >
                            {property.estado}
                        </Badge>
                    </div>

                    {/* Gap + Position + Days */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/20">
                        <div className="text-center">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Gap precio</p>
                            <p
                                className="text-sm font-bold font-mono mt-0.5"
                                style={{ color: isNegativeGap ? "var(--urus-success)" : "var(--urus-danger)" }}
                            >
                                {isNegativeGap ? "" : "+"}{property.gapPrecio}%
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Posición</p>
                            <p className="text-sm font-bold font-mono mt-0.5">
                                #{property.posicionPortal}
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sin llamadas</p>
                            <p
                                className="text-sm font-bold font-mono mt-0.5"
                                style={{ color: property.diasSinLlamadas > 15 ? "var(--urus-danger)" : property.diasSinLlamadas > 7 ? "var(--urus-warning)" : "var(--urus-success)" }}
                            >
                                {property.diasSinLlamadas}d
                            </p>
                        </div>
                    </div>

                    {/* Extras */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {Object.entries(property.extras).map(([key, val]) => (
                            <Badge
                                key={key}
                                variant="outline"
                                className={cn(
                                    "text-[9px] capitalize",
                                    val ? "border-[var(--urus-success)]/30 text-[var(--urus-success)]" : "border-border/20 text-muted-foreground/40 line-through"
                                )}
                            >
                                {key === "reformado" ? "Reformado" : key === "terraza" ? "Terraza" : key === "garaje" ? "Garaje" : "Ascensor"}
                            </Badge>
                        ))}
                    </div>

                    {/* CTA */}
                    <div className="flex items-center justify-end pt-1">
                        <span className="text-[10px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            Ver análisis <ArrowRight className="h-3 w-3" />
                        </span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
