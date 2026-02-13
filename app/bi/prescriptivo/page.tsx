"use client";

import {
    ArrowRight,
    Brain,
    CheckCircle2,
    Clock,
    Coins,
    FileBarChart,
    Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const aiRecommendations = [
    {
        id: "REC-01",
        type: "Contratación",
        severity: "High",
        title: "Contratar 2 Agentes en Madrid",
        reason: "La carga de leads en Madrid supera la capacidad actual (65 leads/agente).",
        impact: "+€45.000 facturación est.",
        status: "new",
    },
    {
        id: "REC-02",
        type: "Formación",
        severity: "Medium",
        title: "Capacitación en Cierre para Ana García",
        reason: "Alta generación de leads (45) pero baja conversión (8%).",
        impact: "+15% eficiencia operativa",
        status: "new",
    },
    {
        id: "REC-03",
        type: "Marketing",
        severity: "Low",
        title: "Redistribuir presupuesto a Google Ads",
        reason: "CPL en Facebook aumentó un 25% vs mes anterior.",
        impact: "-12% coste adquisición",
        status: "pending",
    },
];

const automatedRules = [
    {
        rule: "Si Leads > 50 por agente",
        action: "Sugerir contratación o pausar campañas",
        active: true,
    },
    {
        rule: "Si Conversión < 5% por 2 meses",
        action: "Activar alerta de bajo rendimiento",
        active: true,
    },
    {
        rule: "Si Cash Flow < €10.000",
        action: "Congelar reinversiones no críticas",
        active: true,
    },
];

export default function PrescriptiveDashboard() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200 dark:border-violet-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
                            <Brain className="h-6 w-6" />
                            Motor de Inteligencia Artificial
                        </CardTitle>
                        <CardDescription className="text-violet-600/80 dark:text-violet-400/80">
                            Analizando 1,240 puntos de datos en tiempo real para generar recomendaciones accionables.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold tracking-tight">Recomendaciones Activas</h2>
                    <div className="grid gap-4">
                        {aiRecommendations.map((rec) => (
                            <Card key={rec.id} className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant={rec.severity === "High" ? "destructive" : "secondary"}
                                                    className="mr-2"
                                                >
                                                    {rec.severity === "High" ? "Crítico" : rec.severity === "Medium" ? "Importante" : "Sugerencia"}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                                                    {rec.type}
                                                </span>
                                            </div>
                                            <CardTitle className="text-lg">{rec.title}</CardTitle>
                                        </div>
                                        <Button size="sm" variant="outline" className="gap-1">
                                            Aplicar <ArrowRight className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid md:grid-cols-2 gap-4 text-sm mt-2">
                                        <div className="space-y-1">
                                            <span className="font-semibold text-muted-foreground flex items-center gap-1">
                                                <Lightbulb className="h-3 w-3" /> Motivo Detectado:
                                            </span>
                                            <p className="pl-4 border-l-2 border-muted">{rec.reason}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="font-semibold text-muted-foreground flex items-center gap-1">
                                                <Coins className="h-3 w-3" /> Impacto Estimado:
                                            </span>
                                            <p className="font-bold text-emerald-600 dark:text-emerald-400">
                                                {rec.impact}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <FileBarChart className="h-4 w-4" />
                                Reglas del Negocio
                            </CardTitle>
                            <CardDescription>Lógica de decisión automatizada</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    {automatedRules.map((rule, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="py-3">
                                                <div className="space-y-1">
                                                    <p className="font-medium text-sm">{rule.rule}</p>
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                                                        {rule.action}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-3 align-top">
                                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                                    Activa
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Historial de Éxito
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                                    <div>
                                        <p className="font-medium">Redistribución Leads (Enero)</p>
                                        <p className="text-xs text-muted-foreground">Logró aumentar conversiones un 4%</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                                    <div>
                                        <p className="font-medium">Contratación Jr. (Noviembre)</p>
                                        <p className="text-xs text-muted-foreground">ROI positivo en mes 2</p>
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
