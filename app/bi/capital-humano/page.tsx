"use client";

import {
    Activity,
    AlertTriangle,
    BrainCircuit,
    HeartPulse,
    ThermometerSun,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { humanCapitalRisks } from "@/lib/mock-data/bi";
import { cn } from "@/lib/utils";

export default function HumanCapitalDashboard() {
    const highRiskZones = humanCapitalRisks.filter(
        (z) => z.burnoutRisk === "High" || z.burnoutRisk === "Critical"
    );

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Nivel de Estrés Global</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">Media</div>
                        <p className="text-xs text-muted-foreground">62/100 (Estable)</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Riesgo de Burnout</CardTitle>
                        <HeartPulse className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{highRiskZones.length} Zonas</div>
                        <p className="text-xs text-muted-foreground">Requieren atención inmediata</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-7">
                {/* Heatmap Simulation */}
                <Card className="md:col-span-4">
                    <CardHeader>
                        <CardTitle>Mapa de Presión por Zona</CardTitle>
                        <CardDescription>
                            Intensidad de carga de trabajo y horas promedio.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {humanCapitalRisks.map((zone) => (
                                <div key={zone.zone} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm">{zone.zone}</span>
                                        <span className="text-sm text-muted-foreground">
                                            {zone.avgHours}h/semana
                                        </span>
                                    </div>
                                    <div className="relative pt-1">
                                        <div className="flex mb-2 items-center justify-between">
                                            <div>
                                                <Badge
                                                    variant={
                                                        zone.burnoutRisk === "Critical"
                                                            ? "destructive"
                                                            : zone.burnoutRisk === "High"
                                                                ? "destructive"
                                                                : zone.burnoutRisk === "Medium"
                                                                    ? "secondary"
                                                                    : "outline"
                                                    }
                                                    className="text-[10px]"
                                                >
                                                    Riesgo {zone.burnoutRisk}
                                                </Badge>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-semibold inline-block text-muted-foreground">
                                                    {zone.pressureLevel}% Presión
                                                </span>
                                            </div>
                                        </div>
                                        <Progress
                                            value={zone.pressureLevel}
                                            className={cn(
                                                "h-2",
                                                zone.pressureLevel > 80
                                                    ? "bg-red-100 [&>div]:bg-red-600"
                                                    : zone.pressureLevel > 60
                                                        ? "bg-yellow-100 [&>div]:bg-yellow-500"
                                                        : "bg-emerald-100 [&>div]:bg-emerald-500"
                                            )}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Action Recommendations */}
                <Card className="md:col-span-3 border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BrainCircuit className="h-5 w-5 text-blue-500" />
                            Recomendaciones Preventivas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {highRiskZones.map((zone) => (
                            <div
                                key={zone.zone}
                                className="p-3 bg-accent/50 rounded-lg text-sm border border-border/50"
                            >
                                <div className="flex items-start gap-3">
                                    <ThermometerSun className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-semibold text-foreground">
                                            Intervención en {zone.zone}
                                        </p>
                                        <p className="text-muted-foreground text-xs leading-relaxed">
                                            La carga horaria ({zone.avgHours}h) supera el límite saludable. Se sugiere:
                                        </p>
                                        <ul className="list-disc list-inside text-xs text-muted-foreground pt-1">
                                            <li>Redistribuir leads a zonas colindantes.</li>
                                            <li>Obligar a día de descanso el viernes.</li>
                                            <li>Activar protocolo de soporte emocional.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {highRiskZones.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>No se detectan riesgos críticos actualmente.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
