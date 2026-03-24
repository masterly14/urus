"use client";

import {
    ArrowDownRight,
    ArrowUpRight,
    BarChart,
    MapPin,
    Users,
    AlertOctagon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { salesPerformanceData } from "@/lib/mock-data/bi";
import { SimpleBarChart } from "@/components/bi/charts";
import { cn } from "@/lib/utils";

export default function OperationalDashboard() {
    const sortedAgents = [...salesPerformanceData].sort((a, b) => b.efficiency - a.efficiency);
    const cityData = salesPerformanceData.reduce((acc, curr) => {
        const existing = acc.find((c) => c.city === curr.city);
        if (existing) {
            existing.revenue += curr.revenue;
            existing.leads += curr.leads;
            existing.conversions += curr.conversions;
        } else {
            acc.push({ ...curr });
        }
        return acc;
    }, [] as typeof salesPerformanceData);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Leads Activos</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">235</div>
                        <p className="text-xs text-muted-foreground">+12% vs mes anterior</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Conversión Global</CardTitle>
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">12.5%</div>
                        <p className="text-xs text-muted-foreground">+2.1% mejora operativa</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="agents" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="agents">Rendimiento Agentes</TabsTrigger>
                    <TabsTrigger value="cities">Desglose por Ciudad</TabsTrigger>
                </TabsList>
                <TabsContent value="agents" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Ranking de Eficiencia</CardTitle>
                            <CardDescription>
                                Basado en conversión de leads y ticket promedio.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Agente</TableHead>
                                        <TableHead>Ciudad</TableHead>
                                        <TableHead>Eficiencia</TableHead>
                                        <TableHead className="text-right">Ingresos</TableHead>
                                        <TableHead className="text-right">Ticket Medio</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedAgents.map((agent) => (
                                        <TableRow key={agent.agentId}>
                                            <TableCell className="font-medium">{agent.agentName}</TableCell>
                                            <TableCell>{agent.city}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Progress
                                                        value={agent.efficiency}
                                                        className={cn(
                                                            "w-[60px]",
                                                            agent.efficiency > 90
                                                                ? "bg-emerald-100"
                                                                : agent.efficiency < 70
                                                                    ? "bg-red-100"
                                                                    : "bg-yellow-100"
                                                        )}
                                                    />
                                                    <span className="text-sm font-bold">{agent.efficiency}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">€{agent.revenue.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">€{agent.avgTicket.toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="cities" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Rendimiento por Sede</CardTitle>
                        </CardHeader>
                        <CardContent className="pl-2">
                            <SimpleBarChart
                                data={cityData}
                                index="city"
                                categories={["revenue"]}
                                colors={["#3b82f6"]}
                                height={350}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Inefficiency Alerts */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sortedAgents
                    .filter((a) => a.efficiency < 70)
                    .map((agent) => (
                        <Card key={agent.agentId} className="border-red-200 bg-red-50 dark:bg-red-900/10">
                            <CardHeader className="flex flex-row items-center gap-2 pb-2">
                                <AlertOctagon className="h-5 w-5 text-red-600" />
                                <CardTitle className="text-sm font-medium text-red-900 dark:text-red-200">
                                    Bajo Rendimiento Detectado
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-red-800 dark:text-red-300">
                                    El agente <span className="font-bold">{agent.agentName}</span> ({agent.city}) tiene una eficiencia del {agent.efficiency}%, muy por debajo de la media.
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <Badge variant="outline" className="bg-white hover:bg-white text-red-700 border-red-200">
                                        Sugerir Capacitación
                                    </Badge>
                                    <Badge variant="outline" className="bg-white hover:bg-white text-red-700 border-red-200">
                                        Revisar Leads
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
            </div>
        </div>
    );
}
