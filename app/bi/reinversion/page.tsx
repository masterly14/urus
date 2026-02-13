"use client";

import {
    ArrowUpRight,
    Banknote,
    Briefcase,
    PieChart,
    RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SimpleAreaChart, SimpleBarChart } from "@/components/bi/charts";

const currentTreasury = 185000;
const reinvestmentCapacity = 65000; // Safe to reinvest without risking operations

const investments = [
    { id: "INV-22", type: "Tecnología", concept: "CRM Automation", amount: 12000, roi: 185, status: "active" },
    { id: "INV-23", type: "Marketing", concept: "Q1 Campaign", amount: 25000, roi: 120, status: "completed" },
    { id: "INV-24", type: "Talento", concept: "Headhunter Fee", amount: 8000, roi: 95, status: "active" },
];

export default function ReinvestmentDashboard() {
    const capacityPercentage = (reinvestmentCapacity / currentTreasury) * 100;

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-slate-900 text-slate-50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-slate-400 font-medium text-sm">Tesorería Disponible</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4">
                            <Banknote className="h-10 w-10 text-emerald-400" />
                            <div>
                                <p className="text-4xl font-bold font-mono">
                                    €{currentTreasury.toLocaleString()}
                                </p>
                                <p className="text-sm text-emerald-400 flex items-center gap-1 mt-1">
                                    <ArrowUpRight className="h-3 w-3" /> +12% vs mes anterior
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Capacidad de Reinversión Segura</span>
                            <span className="text-sm font-normal text-muted-foreground">
                                €{reinvestmentCapacity.toLocaleString()} disponibles
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>0%</span>
                                <span>50% (Riesgo Medio)</span>
                                <span>100%</span>
                            </div>
                            <Progress value={capacityPercentage} className="h-4 bg-muted" />
                            <p className="text-xs text-muted-foreground pt-2">
                                Basado en cash flow proyectado y costes operativos fijos de los próximos 3 meses.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Histórico de Retorno de Inversión (ROI)</CardTitle>
                            <CardDescription>Rentabilidad de las últimas inversiones estratégicas</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead className="text-right">Importe</TableHead>
                                        <TableHead className="text-right">ROI Actual</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {investments.map((inv) => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-medium">{inv.concept}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{inv.type}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                €{inv.amount.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-bold text-emerald-600">
                                                    {inv.roi}%
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {inv.status === "active" ? (
                                                        <RefreshCcw className="h-3 w-3 text-blue-500 animate-spin-slow" />
                                                    ) : (
                                                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                    )}
                                                    <span className="text-xs capitalization">{inv.status}</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase className="h-5 w-5" />
                                Cartera de Proyectos
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="text-center">
                                <p className="text-5xl font-bold">3</p>
                                <p className="text-indigo-100 text-sm">Proyectos Activos</p>
                            </div>
                            <div className="text-center">
                                <p className="text-5xl font-bold">145%</p>
                                <p className="text-indigo-100 text-sm">ROI Promedio Ponderado</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
