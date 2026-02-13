"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    User,
    Calendar,
    MapPin,
    DollarSign,
    ArrowRight,
    CheckCircle2,
    Clock,
    Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OperacionPostVenta, EtapaPostVenta } from "@/lib/mock-data/types";

interface OperationCardProps {
    operation: OperacionPostVenta;
    className?: string;
}

const etapaLabels: Record<EtapaPostVenta, string> = {
    1: "Cierre Inmediato",
    2: "Soporte Temprano",
    3: "Reputación",
    4: "Referidos",
    5: "Recaptación",
};

const tipoClienteConfig = {
    comprador: { label: "Comprador", color: "var(--urus-info)", emoji: "🏠" },
    inversor: { label: "Inversor", color: "var(--urus-gold)", emoji: "💰" },
    vendedor: { label: "Vendedor", color: "var(--urus-success)", emoji: "📤" },
};

function formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
    });
}

export function OperationCard({ operation, className }: OperationCardProps) {
    const tipoConfig = tipoClienteConfig[operation.tipoCliente];
    const messageCount = operation.mensajes.length;
    const lastMessage = operation.mensajes[operation.mensajes.length - 1];

    return (
        <Link href={`/post-venta/operacion/${operation.id}`}>
            <Card
                className={cn(
                    "border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card hover:shadow-md hover:shadow-background/20 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer group",
                    className
                )}
            >
                <CardContent className="p-3.5 space-y-2.5">
                    {/* Top: Price + Type */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono text-secondary">
                            {operation.precio.toLocaleString("es-ES")} €
                        </span>
                        <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 gap-1"
                            style={{
                                borderColor: `color-mix(in oklch, ${tipoConfig.color} 40%, transparent)`,
                                color: tipoConfig.color,
                                backgroundColor: `color-mix(in oklch, ${tipoConfig.color} 8%, transparent)`,
                            }}
                        >
                            {tipoConfig.emoji} {tipoConfig.label}
                        </Badge>
                    </div>

                    {/* Address */}
                    <div className="flex items-start gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-sm font-medium leading-tight truncate">{operation.direccion}</p>
                    </div>

                    {/* People */}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1 truncate">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{operation.comprador}</span>
                        </div>
                    </div>

                    {/* Date + Checklist */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="h-2.5 w-2.5" />
                            <span>{formatDate(operation.fechaCierre)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {operation.checklistCompleto ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-[var(--urus-success)]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Completo
                                </span>
                            ) : (
                                <span className="flex items-center gap-0.5 text-[10px] text-[var(--urus-warning)]">
                                    <Clock className="h-3 w-3" />
                                    Pendiente
                                </span>
                            )}
                            {messageCount > 0 && (
                                <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-[20px] justify-center">
                                    {messageCount}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Arrow indicator on hover */}
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity -mt-1">
                        <ArrowRight className="h-3 w-3 text-secondary" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

export { etapaLabels, tipoClienteConfig };
