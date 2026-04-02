"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  MapPin,
  TrendingDown,
  TrendingUp,
  Users,
  Briefcase,
  DollarSign,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { SimpleBarChart } from "@/components/bi/charts";
import { cn } from "@/lib/utils";
import { formatEur, formatNum } from "@/lib/utils/format";
import { MockBadge } from "@/components/bi/mock-badge";
import { useCeoCityPerformance } from "@/lib/hooks/use-ceo-cities";
import { useDashboardComerciales } from "@/lib/hooks/use-dashboard-comercial";
import type { CeoCityRow } from "@/lib/dashboard/ceo/types";
import { CIUDADES_OPERATIVAS } from "@/lib/dashboard/ceo/types";
import { salesPerformanceData } from "@/lib/mock-data/bi";

// ---------------------------------------------------------------------------
// Mock data for ?mock=1
// ---------------------------------------------------------------------------

const MOCK_CITIES: CeoCityRow[] = [
  {
    ciudad: "Córdoba",
    comercialesActivos: 5,
    cargaMedia: 14,
    propiedadesActivas: 120,
    operacionesMes: 8,
    facturacionMes: 72000,
    rentabilidadPorComercial: 14400,
    costeOportunidadLeadsPerdidos: 18000,
    costeOportunidadCapacidadOciosa: 9600,
    costeOportunidadTotal: 27600,
    leadsAsignados: 45,
    leadsPerdidos: 4,
    ticketMedio: 4500,
    capacidadOciosa: 30,
    revenuePerLead: 320,
  },
  {
    ciudad: "Málaga",
    comercialesActivos: 4,
    cargaMedia: 16,
    propiedadesActivas: 95,
    operacionesMes: 6,
    facturacionMes: 58000,
    rentabilidadPorComercial: 14500,
    costeOportunidadLeadsPerdidos: 12000,
    costeOportunidadCapacidadOciosa: 4800,
    costeOportunidadTotal: 16800,
    leadsAsignados: 38,
    leadsPerdidos: 3,
    ticketMedio: 4000,
    capacidadOciosa: 16,
    revenuePerLead: 300,
  },
  {
    ciudad: "Sevilla",
    comercialesActivos: 3,
    cargaMedia: 12,
    propiedadesActivas: 80,
    operacionesMes: 4,
    facturacionMes: 38000,
    rentabilidadPorComercial: 12667,
    costeOportunidadLeadsPerdidos: 15000,
    costeOportunidadCapacidadOciosa: 7200,
    costeOportunidadTotal: 22200,
    leadsAsignados: 30,
    leadsPerdidos: 5,
    ticketMedio: 3000,
    capacidadOciosa: 24,
    revenuePerLead: 300,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cityBarData(cities: CeoCityRow[]) {
  return cities.map((c) => ({
    ciudad: c.ciudad,
    "Facturación": c.facturacionMes,
    "Coste Oportunidad": c.costeOportunidadTotal,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function OperationalDashboardInner() {
  const searchParams = useSearchParams();
  const isMock = searchParams.get("mock") === "1";

  const {
    data: cityData,
    loading: cityLoading,
    error: cityError,
  } = useCeoCityPerformance();

  const {
    data: agentData,
    loading: agentLoading,
    error: agentError,
  } = useDashboardComerciales();

  const cities: CeoCityRow[] = isMock
    ? MOCK_CITIES
    : cityData?.cities ?? [];

  const totals = cities.reduce(
    (acc, c) => ({
      comerciales: acc.comerciales + c.comercialesActivos,
      propiedades: acc.propiedades + c.propiedadesActivas,
      facturacion: acc.facturacion + c.facturacionMes,
      operaciones: acc.operaciones + c.operacionesMes,
      costeOportunidad: acc.costeOportunidad + c.costeOportunidadTotal,
    }),
    { comerciales: 0, propiedades: 0, facturacion: 0, operaciones: 0, costeOportunidad: 0 },
  );

  const agentRows = isMock
    ? salesPerformanceData
    : (agentData?.rows ?? []).map((r) => ({
        agentId: r.comercialId,
        agentName: r.comercialNombre,
        city: r.ciudad,
        leads: r.leadsAssigned,
        conversions: r.closings,
        revenue: r.estimatedRevenueEur,
        avgTicket: r.revenuePerOperationEur,
        efficiency:
          r.leadsAssigned > 0
            ? Math.round((r.closings / r.leadsAssigned) * 100)
            : 0,
      }));

  const sortedAgents = [...agentRows].sort((a, b) => b.efficiency - a.efficiency);

  const isLoading = (!isMock && cityLoading) || (!isMock && agentLoading);
  const hasError = !isMock && (cityError ?? agentError);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Cargando rendimiento por ciudad...</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle className="h-6 w-6 text-destructive mr-2" />
        <span className="text-destructive">{cityError ?? agentError}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isMock && <MockBadge />}

      {/* KPI Cards globales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comerciales</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.comerciales}</div>
            <p className="text-xs text-muted-foreground">
              en {cities.length} ciudades
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Propiedades Activas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNum(totals.propiedades)}</div>
            <p className="text-xs text-muted-foreground">stock disponible total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operaciones/Mes</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.operaciones}</div>
            <p className="text-xs text-muted-foreground">cierres en el período</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Facturación Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatEur(totals.facturacion)}</div>
            <p className="text-xs text-muted-foreground">estimada con comisión</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200/50 dark:border-amber-800/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coste Oportunidad</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatEur(totals.costeOportunidad)}
            </div>
            <p className="text-xs text-muted-foreground">dinero potencialmente perdido</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cities" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cities">Desglose por Ciudad</TabsTrigger>
          <TabsTrigger value="agents">Rendimiento Agentes</TabsTrigger>
        </TabsList>

        {/* Tab: Ciudades */}
        <TabsContent value="cities" className="space-y-6">
          {/* Comparativa gráfica */}
          <Card>
            <CardHeader>
              <CardTitle>Facturación vs Coste de Oportunidad</CardTitle>
              <CardDescription>
                Comparativa por sede: ingresos generados frente a dinero potencialmente perdido.
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <SimpleBarChart
                data={cityBarData(cities)}
                index="ciudad"
                categories={["Facturación", "Coste Oportunidad"]}
                colors={["#10b981", "#f59e0b"]}
                height={300}
              />
            </CardContent>
          </Card>

          {/* Tabla comparativa detallada */}
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por Ciudad</CardTitle>
              <CardDescription>
                Las 8 métricas clave por cada sede operativa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-center">Comerciales</TableHead>
                    <TableHead className="text-center">Carga Media</TableHead>
                    <TableHead className="text-center">Propiedades</TableHead>
                    <TableHead className="text-center">Operaciones</TableHead>
                    <TableHead className="text-right">Facturación</TableHead>
                    <TableHead className="text-right">Rent./Comercial</TableHead>
                    <TableHead className="text-right">Coste Oport.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cities.map((city) => {
                    const maxCarga = 20;
                    const cargaRatio = city.cargaMedia / maxCarga;
                    return (
                      <TableRow key={city.ciudad}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{city.ciudad}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{city.comercialesActivos}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress
                              value={cargaRatio * 100}
                              className={cn(
                                "w-[50px]",
                                cargaRatio > 0.85
                                  ? "bg-red-100"
                                  : cargaRatio > 0.7
                                    ? "bg-yellow-100"
                                    : "bg-emerald-100",
                              )}
                            />
                            <span className="text-sm tabular-nums">{city.cargaMedia.toFixed(1)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{city.propiedadesActivas}</TableCell>
                        <TableCell className="text-center">{city.operacionesMes}</TableCell>
                        <TableCell className="text-right font-medium">{formatEur(city.facturacionMes)}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">{formatEur(city.rentabilidadPorComercial)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {formatEur(city.costeOportunidadTotal)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          {/* Detalle de coste de oportunidad */}
          <div className="grid gap-4 md:grid-cols-3">
            {cities.map((city) => (
              <Card key={city.ciudad}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {city.ciudad}
                  </CardTitle>
                  <CardDescription>Desglose de coste de oportunidad</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Leads perdidos</span>
                    <span className="font-medium">{city.leadsPerdidos} leads</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ticket medio</span>
                    <span className="font-medium">{formatEur(city.ticketMedio)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Coste por leads</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {formatEur(city.costeOportunidadLeadsPerdidos)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Capacidad ociosa</span>
                    <span className="font-medium">{formatNum(city.capacidadOciosa)} leads libres</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Revenue/lead</span>
                    <span className="font-medium">{formatEur(city.revenuePerLead)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Coste por capacidad</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {formatEur(city.costeOportunidadCapacidadOciosa)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t pt-2">
                    <span>Total oportunidad</span>
                    <span className="text-amber-600 dark:text-amber-400">
                      {formatEur(city.costeOportunidadTotal)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab: Agentes */}
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ranking de Eficiencia por Agente</CardTitle>
              <CardDescription>
                Ordenados por tasa de conversión lead→cierre. Datos del período actual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
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
                              agent.efficiency > 20
                                ? "bg-emerald-100"
                                : agent.efficiency > 10
                                  ? "bg-yellow-100"
                                  : "bg-red-100",
                            )}
                          />
                          <span className="text-sm font-bold tabular-nums">{agent.efficiency}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatEur(agent.revenue)}</TableCell>
                      <TableCell className="text-right">{formatEur(agent.avgTicket)}</TableCell>
                    </TableRow>
                  ))}
                  {sortedAgents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No hay datos de agentes para el período actual.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          {/* Alertas de bajo rendimiento */}
          {sortedAgents.filter((a) => a.efficiency < 10 && a.leads > 0).length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sortedAgents
                .filter((a) => a.efficiency < 10 && a.leads > 0)
                .map((agent) => (
                  <Card
                    key={agent.agentId}
                    className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800/50"
                  >
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <CardTitle className="text-sm font-medium text-red-900 dark:text-red-200">
                        Bajo Rendimiento
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-red-800 dark:text-red-300">
                        <span className="font-bold">{agent.agentName}</span> ({agent.city})
                        — eficiencia del {agent.efficiency}% con {agent.leads} leads asignados.
                      </p>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function OperationalDashboard() {
  return (
    <Suspense>
      <OperationalDashboardInner />
    </Suspense>
  );
}
