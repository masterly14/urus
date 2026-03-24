"use client";

import {
    AlertOctagon,
    ArrowRight,
    CheckCircle2,
    Clock,
    DollarSign,
    TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { performanceAlerts } from "@/lib/mock-data/performance";
import { cn } from "@/lib/utils";

export default function PerformanceAlertsPage() {
    const highSeverityCount = performanceAlerts.filter((a) => a.severity === "high").length;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-red-800 dark:text-red-200">Alertas Críticas</CardTitle>
                        <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-700 dark:text-red-300">{highSeverityCount}</div>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80">+2 desde ayer</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-200">Coste de Oportunidad</CardTitle>
                        <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">€45,000</div>
                        <p className="text-xs text-amber-600/80 dark:text-amber-400/80">Perdidos en leads no gestionados</p>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <h2 className="text-lg font-semibold tracking-tight">Feed de Anomalías</h2>
                {performanceAlerts.map((alert) => (
                    <Card key={alert.id} className="border-l-4 shadow-sm hover:bg-accent/5 transition-colors"
                        style={{
                            borderLeftColor: alert.severity === "high" ? "#ef4444" : alert.severity === "medium" ? "#f59e0b" : "#3b82f6"
                        }}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                                <div className={cn(
                                    "p-2 rounded-full shrink-0",
                                    alert.severity === "high" ? "bg-red-100 text-red-600" :
                                        alert.severity === "medium" ? "bg-amber-100 text-amber-600" :
                                            "bg-blue-100 text-blue-600"
                                )}>
                                    {alert.type === "drop" ? <TrendingDown className="h-5 w-5" /> :
                                        alert.type === "opportunity_cost" ? <DollarSign className="h-5 w-5" /> :
                                            <AlertOctagon className="h-5 w-5" />
                                    }
                                </div>

                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-sm">{alert.message}</h3>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> {new Date(alert.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Agente: <span className="font-medium text-foreground">{alert.agentName}</span>
                                    </p>
                                    <div className="flex items-center gap-2 pt-2">
                                        <Badge variant="outline" className="bg-transparent border-dashed text-muted-foreground font-normal">
                                            Impacto: {alert.impact}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 self-center">
                                    <Button size="sm" variant="outline" className="text-xs h-8">
                                        Ver Detalles
                                    </Button>
                                    {alert.severity === "high" && (
                                        <Button size="sm" className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white">
                                            Intervenir
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {performanceAlerts.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-emerald-500/50" />
                        <p>No hay alertas activas. El rendimiento es óptimo.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
