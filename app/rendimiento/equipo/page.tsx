"use client";

import {
    ArrowUpRight,
    TrendingDown,
    TrendingUp,
    User,
    MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { teamMembers, archetypeConfig } from "@/lib/mock-data/performance";
import { KPICard } from "@/components/bi/kpi-card";
import { SimpleAreaChart } from "@/components/bi/charts";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function TeamPerformancePage() {
    const topPerformers = teamMembers.filter((m) => m.archetype === "Top Performer");
    const lowPerformers = teamMembers.filter((m) => m.archetype === "Bajo Rendimiento");

    return (
        <div className="space-y-6">
            {/* Global KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Facturación Total"
                    value="€785,000"
                    trend={12.5}
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <KPICard
                    title="Conversión Global"
                    value="14.2%"
                    trend={1.8}
                    icon={<ArrowUpRight className="h-4 w-4" />}
                    Description="vs objetivo 12%"
                />
                <KPICard
                    title="Top Performers"
                    value={topPerformers.length.toString()}
                    trend={0}
                    icon={<User className="h-4 w-4" />}
                    trendLabel="Sin cambios"
                />
                <KPICard
                    title="Riesgo de Fuga"
                    value="2"
                    trend={-1}
                    icon={<TrendingDown className="h-4 w-4" />}
                    trendLabel="Agentes en riesgo"
                    className="border-l-4 border-l-red-500"
                />
            </div>

            {/* Archetype Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Object.entries(archetypeConfig).map(([key, config]) => {
                    const count = teamMembers.filter((m) => m.archetype === key).length;
                    return (
                        <Card key={key} className={cn("border-t-4",
                            key === "Top Performer" ? "border-t-emerald-500" :
                                key === "Productivo Ineficiente" ? "border-t-blue-500" :
                                    key === "Dependiente del Lead" ? "border-t-yellow-500" :
                                        "border-t-red-500"
                        )}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{key}</CardTitle>
                                <CardDescription className="text-xs">{config.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-between items-end">
                                    <span className="text-2xl font-bold">{count}</span>
                                    <Badge variant="outline" className="text-[10px] opacity-70">
                                        {config.action}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Team Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Rendimiento del Equipo</CardTitle>
                    <CardDescription>
                        Análisis detallado por agente, métricas y tendencia de las últimas 6 semanas.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Agente</TableHead>
                                <TableHead>Arquetipo</TableHead>
                                <TableHead className="text-right">Conversión</TableHead>
                                <TableHead className="text-right">Actividad</TableHead>
                                <TableHead className="text-right">Facturación (Mes)</TableHead>
                                <TableHead className="w-[150px]">Tendencia (6 sem)</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {teamMembers.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={`/avatars/${member.id}.png`} />
                                                <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-medium">{member.name}</div>
                                                <div className="text-xs text-muted-foreground">{member.zone}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[10px] font-normal border-opacity-50",
                                                member.archetype === "Top Performer" ? "bg-emerald-50 text-emerald-700 border-emerald-300" :
                                                    member.archetype === "Productivo Ineficiente" ? "bg-blue-50 text-blue-700 border-blue-300" :
                                                        member.archetype === "Dependiente del Lead" ? "bg-yellow-50 text-yellow-700 border-yellow-300" :
                                                            "bg-red-50 text-red-700 border-red-300"
                                            )}
                                        >
                                            {member.archetype}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {member.metrics.conversion}%
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-sm">{member.metrics.activityScore}/100</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        €{member.metrics.revenue.toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="h-[30px] w-full">
                                            <SimpleAreaChart
                                                data={member.trend.map((val, i) => ({ w: i, v: val }))}
                                                categories={["v"]}
                                                index="w"
                                                colors={[archetypeConfig[member.archetype].color]}
                                                height={30}
                                                showLegend={false}
                                                className="opacity-70"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/rendimiento/comercial/${member.id}`}>Ver Perfil Completo</Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem>Asignar Plan de Mejora</DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600">Reportar Anomalía</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
