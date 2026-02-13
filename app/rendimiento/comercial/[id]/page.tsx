"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    ArrowRight,
    Brain,
    Eye,
    TrendingDown,
    TrendingUp,
    User,
    ShieldCheck,
    Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { teamMembers, archetypeConfig, type TeamMember } from "@/lib/mock-data/performance";
import { KPICard } from "@/components/bi/kpi-card";
import { SimpleAreaChart } from "@/components/bi/charts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function IndividualPerformancePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const [member, setMember] = useState<TeamMember | undefined>(undefined);
    const [isCeoView, setIsCeoView] = useState(true);

    useEffect(() => {
        if (resolvedParams.id === "me") {
            setMember(teamMembers[0]); // Simulate logged-in user
            setIsCeoView(false); // Default to agent view
        } else {
            const found = teamMembers.find((m) => m.id === resolvedParams.id);
            if (found) setMember(found);
        }
    }, [resolvedParams.id]);

    if (!member) return <div className="p-8 text-center text-muted-foreground">Cargando perfil...</div>;

    const archetype = archetypeConfig[member.archetype];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/rendimiento/equipo">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 border-2 border-border/50">
                            <AvatarImage src={`/avatars/${member.id}.png`} />
                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{member.name}</h1>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                {member.role} · {member.zone}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-card/50 p-2 rounded-lg border border-border/50">
                    <span className={cn("text-xs font-medium", !isCeoView ? "text-primary" : "text-muted-foreground")}>Vista Agente</span>
                    <Switch checked={isCeoView} onCheckedChange={setIsCeoView} />
                    <span className={cn("text-xs font-medium", isCeoView ? "text-primary" : "text-muted-foreground")}>Vista CEO</span>
                </div>
            </div>

            {/* Archetype Badge (CEO View Only) */}
            {isCeoView && (
                <Card className="bg-gradient-to-r from-card to-accent/20 border-l-4" style={{ borderLeftColor: archetype.color }}>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" style={{ borderColor: archetype.color, color: archetype.color }}>
                                    Arquetipo: {member.archetype}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{archetype.description}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Acción Recomendada</p>
                            <div className="flex items-center gap-2 font-medium">
                                <Target className="h-4 w-4 text-primary" />
                                {archetype.action}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Facturación (Mes)"
                    value={`€${member.metrics.revenue.toLocaleString()}`}
                    trend={member.trend[member.trend.length - 1] > member.trend[member.trend.length - 2] ? 5.2 : -2.1}
                    icon={<Brain className="h-4 w-4" />}
                />
                <KPICard
                    title="Conversión"
                    value={`${member.metrics.conversion}%`}
                    trend={0.5}
                    icon={<Target className="h-4 w-4" />}
                />
                <KPICard
                    title="Actividad"
                    value={`${member.metrics.activityScore}/100`}
                    trend={-2}
                    trendLabel="Ligera bajada"
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                {isCeoView ? (
                    <KPICard
                        title="Coste de Oportunidad"
                        value="€12,500"
                        trend={15}
                        trendLabel="Aumentando"
                        icon={<TrendingDown className="h-4 w-4" />}
                        className="border-red-200 bg-red-50 dark:bg-red-900/10"
                    />
                ) : (
                    <KPICard
                        title="Objetivo Mensual"
                        value="85%"
                        trend={12}
                        trendLabel="Completado"
                        icon={<ShieldCheck className="h-4 w-4" />}
                        className="border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10"
                    />
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Trend Chart */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Tendencia de Rendimiento</CardTitle>
                        <CardDescription>Evolución de ingresos y leads en las últimas 12 semanas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SimpleAreaChart
                            data={member.history}
                            index="week"
                            categories={["revenue", "leads"]}
                            colors={["#10b981", "#3b82f6"]}
                            height={300}
                        />
                    </CardContent>
                </Card>

                {/* Action / Comparison Panel */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {isCeoView ? "Plan de Acción" : "Tus Siguientes Pasos"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {member.archetype === "Top Performer" ? (
                                <div className="space-y-2">
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800 text-sm">
                                        <p className="font-semibold text-emerald-800 dark:text-emerald-300">🎉 Mantener Ritmo</p>
                                        <p className="text-emerald-700 dark:text-emerald-400 text-xs">Estás superando tus metas. Considera mentorizar a un junior.</p>
                                    </div>
                                    <Button className="w-full" variant="outline">Ver Programa Mentoring</Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800 text-sm">
                                        <p className="font-semibold text-amber-800 dark:text-amber-300">⚠️ Foco en Cierre</p>
                                        <p className="text-amber-700 dark:text-amber-400 text-xs">Tienes muchos leads pero pocos cierres. Revisa tus guiones de ventas.</p>
                                    </div>
                                    <Button className="w-full" variant="outline">Agendar 1:1 con Manager</Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Comparativa con Equipo</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span>Conversión</span>
                                        <span className="font-bold">{member.metrics.conversion}% vs 12% (Media)</span>
                                    </div>
                                    <div className="h-2 w-full bg-accent rounded-full overflow-hidden">
                                        <div className="h-full bg-primary" style={{ width: `${(member.metrics.conversion / 20) * 100}%` }} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span>Ticket Medio</span>
                                        <span className="font-bold">€215k vs €190k (Media)</span>
                                    </div>
                                    <div className="h-2 w-full bg-accent rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: "80%" }} />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
