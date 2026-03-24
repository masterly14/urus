"use client";

import { useState } from "react";
import {
    CheckSquare,
    Globe2,
    MapPin,
    Rocket,
    TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SimpleBarChart } from "@/components/bi/charts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const expansionCriteria = [
    { label: "Cash Flow > €50k stable (3 mos)", current: 35000, target: 50000, met: false },
    { label: "Margen Neto > 15%", current: 18, target: 15, met: true },
    { label: "Liderazgo Formado (Head of Sales)", current: 1, target: 1, met: true },
    { label: "Manual de Operaciones Estandarizado", current: 0.8, target: 1, met: false },
];

const potentialLocations = [
    { city: "Barcelona", score: 85, investment: 120000, roi: 18 },
    { city: "Málaga", score: 72, investment: 80000, roi: 22 },
    { city: "Alicante", score: 65, investment: 60000, roi: 15 },
    { city: "Sevilla", score: 60, investment: 90000, roi: 12 },
];

export default function ExpansionDashboard() {
    const [simulationInvestment, setSimulationInvestment] = useState(100000);
    const [projectedRevenue, setProjectedRevenue] = useState(150000);

    const criteriaMetCount = expansionCriteria.filter((c) => c.met).length;
    const expansionReadyPercentage = (criteriaMetCount / expansionCriteria.length) * 100;

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                {/* Readiness Checklist */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckSquare className="h-5 w-5 text-primary" />
                            Checklist de Expansión
                        </CardTitle>
                        <CardDescription>
                            Requisitos previos para abrir una nueva sede.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-6 space-y-2">
                            <div className="flex justify-between text-sm font-medium">
                                <span>Progreso Global</span>
                                <span>{expansionReadyPercentage}%</span>
                            </div>
                            <Progress value={expansionReadyPercentage} className="h-2" />
                        </div>

                        <div className="space-y-4">
                            {expansionCriteria.map((criterion, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                                            criterion.met
                                                ? "bg-primary border-primary text-primary-foreground"
                                                : "border-muted-foreground"
                                        )}
                                    >
                                        {criterion.met && <CheckSquare className="h-3 w-3" />}
                                    </div>
                                    <div className="active:flex-1 space-y-1 w-full">
                                        <p className={cn("text-sm font-medium", criterion.met ? "" : "text-muted-foreground")}>
                                            {criterion.label}
                                        </p>
                                        {!criterion.met && (
                                            <div className="text-xs text-muted-foreground flex justify-between">
                                                <span>Actual: {criterion.current}</span>
                                                <span>Meta: {criterion.target}</span>
                                            </div>
                                        )}
                                        {!criterion.met && (
                                            <Progress
                                                value={(criterion.current / criterion.target) * 100}
                                                className="h-1.5 bg-muted"
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Location Analysis */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe2 className="h-5 w-5 text-primary" />
                            Análisis de Ubicaciones
                        </CardTitle>
                        <CardDescription>
                            Puntuación de viabilidad y ROI estimado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {potentialLocations.map((loc) => (
                                <div key={loc.city} className="flex items-center justify-between p-3 border rounded-lg bg-card/50 hover:bg-accent/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-primary/10 p-2 rounded-full">
                                            <MapPin className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">{loc.city}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Inv. €{loc.investment.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 justify-end font-bold text-emerald-600">
                                            <TrendingUp className="h-3 w-3" />
                                            {loc.roi}% ROI
                                        </div>
                                        <Badge variant="outline" className="mt-1">
                                            Score: {loc.score}/100
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Simulator */}
            <Card className="bg-slate-900 text-slate-50 border-slate-800">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Rocket className="h-5 w-5 text-purple-400" />
                        Simulador de Nueva Apertura
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Proyecta el impacto financiero de una nueva sede.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Inversión Inicial (€)</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        value={simulationInvestment}
                                        onChange={(e) => setSimulationInvestment(Number(e.target.value))}
                                        className="bg-slate-800 border-slate-700 text-slate-50"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Facturación Estimada Año 1 (€)</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        value={projectedRevenue}
                                        onChange={(e) => setProjectedRevenue(Number(e.target.value))}
                                        className="bg-slate-800 border-slate-700 text-slate-50"
                                    />
                                </div>
                            </div>
                            <Button className="w-full bg-purple-600 hover:bg-purple-700">
                                Calcular Proyección
                            </Button>
                        </div>

                        <div className="md:col-span-2 h-[200px] bg-slate-800/50 rounded-lg p-4 flex items-center justify-center border border-slate-700 border-dashed">
                            <div className="text-center space-y-2">
                                <p className="text-slate-400 text-sm">ROI Estimado (Año 1)</p>
                                <p className="text-4xl font-bold text-emerald-400">
                                    {(((projectedRevenue - simulationInvestment) / simulationInvestment) * 100).toFixed(1)}%
                                </p>
                                <p className="text-xs text-slate-500">
                                    Break-even estimado: Mes 8
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
