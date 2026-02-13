"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    MapPin,
    Briefcase,
    ArrowRight,
    Star,
    Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SlaIndicator } from "./sla-indicator";
import { SparklineChart } from "@/components/dashboard/sparkline-chart";
import type { Colaborador, EstadoColaborador } from "@/lib/mock-data/types";

interface CollaboratorCardProps {
    collaborator: Colaborador;
    rank?: number;
    className?: string;
}

const estadoColors: Record<EstadoColaborador, string> = {
    ok: "var(--urus-success)",
    retrasado: "var(--urus-warning)",
    critico: "var(--urus-danger)",
};

function getScoreColor(score: number): string {
    if (score >= 80) return "var(--urus-success)";
    if (score >= 60) return "var(--urus-warning)";
    return "var(--urus-danger)";
}

export function CollaboratorCard({ collaborator, rank, className }: CollaboratorCardProps) {
    const scoreColor = getScoreColor(collaborator.score);

    return (
        <Link href={`/colaboradores/${collaborator.id}`}>
            <Card
                className={cn(
                    "border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card hover:shadow-md hover:shadow-background/20 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer group",
                    className
                )}
            >
                <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            {rank !== undefined && (
                                <div
                                    className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                                    style={{
                                        backgroundColor: `color-mix(in oklch, ${scoreColor} 12%, transparent)`,
                                        color: scoreColor,
                                    }}
                                >
                                    #{rank}
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{collaborator.nombre}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-[9px] px-1.5 shrink-0">
                                        {collaborator.tipo}
                                    </Badge>
                                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {collaborator.ciudad}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Score */}
                        <div className="shrink-0 text-right">
                            <div
                                className="text-xl font-bold font-mono"
                                style={{ color: scoreColor }}
                            >
                                {collaborator.score}
                            </div>
                            <p className="text-[9px] text-muted-foreground">puntos</p>
                        </div>
                    </div>

                    {/* Specialty */}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Wrench className="h-3 w-3 shrink-0" />
                        <span className="truncate">{collaborator.especialidad}</span>
                    </div>

                    {/* SLA + Ops */}
                    <div className="flex items-center justify-between">
                        <SlaIndicator
                            slaEsperado={collaborator.slaEsperado}
                            slaReal={collaborator.slaReal}
                            estado={collaborator.estado}
                            compact
                        />
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Briefcase className="h-3 w-3" />
                            {collaborator.operaciones} ops
                        </span>
                    </div>

                    {/* Trend */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                        <SparklineChart
                            data={collaborator.tendenciaMensual}
                            color={scoreColor}
                            width={100}
                            height={22}
                        />
                        <ArrowRight className="h-3 w-3 text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

export { getScoreColor };
