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
                <Card className="bg-urus-danger-bg border-urus-danger/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-urus-danger">Alertas Críticas</CardTitle>
                        <AlertOctagon className="h-4 w-4 text-urus-danger" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-urus-danger">{highSeverityCount}</div>
                        <p className="text-xs text-urus-danger/80">+2 desde ayer</p>
                    </CardContent>
                </Card>

                <Card className="bg-urus-warning-bg border-urus-warning/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-urus-warning">Coste de Oportunidad</CardTitle>
                        <DollarSign className="h-4 w-4 text-urus-warning" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-urus-warning">€45,000</div>
                        <p className="text-xs text-urus-warning/80">Perdidos en leads no gestionados</p>
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
                                    alert.severity === "high" ? "bg-urus-danger/10 text-urus-danger" :
                                        alert.severity === "medium" ? "bg-urus-warning/10 text-urus-warning" :
                                            "bg-urus-info/10 text-urus-info"
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
                                        <Button size="sm" className="text-xs h-8 bg-urus-danger hover:bg-urus-danger/90 text-white">
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
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-urus-success/50" />
                        <p>No hay alertas activas. El rendimiento es óptimo.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
