"use client";

import { PlatformLink } from "@/components/loading/platform-link";
import { useMemo } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  CalendarCheck2,
  DollarSign,
  FileText,
  LayoutDashboard,
  PieChart,
  Signature,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useSession } from "@/lib/hooks/use-session";

const quickLinks = [
  {
    title: "Inteligencia de Negocio",
    description: "Visión ejecutiva, financiero y operativo",
    href: "/platform/bi/vision-ejecutiva",
    icon: PieChart,
  },
  {
    title: "Legal",
    description: "Contratos y plantillas",
    href: "/platform/legal/contratos",
    icon: FileText,
  },
  {
    title: "Colaboradores",
    description: "Vista general y rankings",
    href: "/platform/colaboradores",
    icon: Users,
  },
  {
    title: "Cartera interna",
    description: "Semáforo y mercado",
    href: "/platform/pricing",
    icon: DollarSign,
  },
];

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  EN_CURSO: "En curso",
  OFERTA_FIRME: "Oferta firme",
  RESERVA: "Reserva",
  ARRAS: "Arras",
  PENDIENTE_FIRMA: "Pendiente firma",
};

const LEAD_STAGE_LABELS: Record<string, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  EN_SELECCION: "En selección",
  VISITA_PENDIENTE: "Visita pendiente",
  VISITA_CONFIRMADA: "Visita confirmada",
  VISITA_REALIZADA: "Visita realizada",
  EN_NEGOCIACION: "En negociación",
  EN_FIRMA: "En firma",
  CERRADO: "Cerrado",
  PERDIDO: "Perdido",
};

interface PlatformSummaryResponse {
  ok: boolean;
  kpis: {
    activeOperations: number;
    closedThisMonth: number;
    staleOperations: number;
    cancelledThisMonth: number;
    openAlerts: number;
    highAlerts: number;
    pendingSignatures: number;
    expiredSignatures: number;
    escalatedSignatures: number;
    overdueCollaboratorMilestones: number;
    visitsNextWeek: number;
  };
  pipeline: Record<string, number>;
  leads: Record<string, number>;
  postventa: Record<string, number>;
}

export default function PlatformHomePage() {
  useSession();

  const { data, error: swrError, isLoading } = useSWR<PlatformSummaryResponse>(
    "/api/platform/summary",
    { revalidateOnMount: true, keepPreviousData: true },
  );
  const loading = isLoading && !data;
  const error = swrError
    ? (swrError instanceof Error ? swrError.message : String(swrError))
    : null;

  const pipelineRows = useMemo(() => {
    const source = data?.pipeline ?? {};
    return Object.entries(PIPELINE_STAGE_LABELS).map(([stage, label]) => ({
      stage,
      label,
      count: source[stage] ?? 0,
    }));
  }, [data?.pipeline]);

  const leadRows = useMemo(() => {
    const source = data?.leads ?? {};
    return Object.entries(LEAD_STAGE_LABELS).map(([stage, label]) => ({
      stage,
      label,
      count: source[stage] ?? 0,
    }));
  }, [data?.leads]);

  const pipelineTotal = pipelineRows.reduce((acc, row) => acc + row.count, 0);
  const leadTotal = leadRows.reduce((acc, row) => acc + row.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Panel</h1>
          <p className="text-xs text-muted-foreground">
            Resumen operativo y accesos rápidos
          </p>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">No se pudo cargar el resumen</CardTitle>
            <CardDescription className="text-xs">{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              title="Operaciones activas"
              value={data.kpis.activeOperations}
              change={0}
              trend="stable"
              icon={PieChart}
              description={`${data.kpis.staleOperations} atascadas (>7d)`}
            />
            <KpiCard
              title="Cierres del mes"
              value={data.kpis.closedThisMonth}
              change={0}
              trend="stable"
              icon={DollarSign}
              description={`${data.kpis.cancelledThisMonth} canceladas`}
            />
            <KpiCard
              title="Alertas abiertas"
              value={data.kpis.openAlerts}
              change={0}
              trend="stable"
              icon={AlertTriangle}
              description={`${data.kpis.highAlerts} severidad alta`}
            />
            <KpiCard
              title="Firmas pendientes"
              value={data.kpis.pendingSignatures}
              change={0}
              trend="stable"
              icon={Signature}
              description={`${data.kpis.escalatedSignatures} escaladas · ${data.kpis.expiredSignatures} expiradas`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Pipeline de operaciones</CardTitle>
                <CardDescription className="text-xs">{pipelineTotal} operaciones en etapas activas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pipelineRows.map((row) => (
                  <div key={row.stage} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Estado de leads</CardTitle>
                <CardDescription className="text-xs">{leadTotal} demandas en seguimiento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {leadRows.map((row) => (
                  <div key={row.stage} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Riesgo operativo</CardTitle>
                <CardDescription className="text-xs">Señales para priorizar hoy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarCheck2 className="h-4 w-4 shrink-0" />
                    <span>Visitas próximos 7 días</span>
                  </div>
                  <span className="font-semibold tabular-nums">{data.kpis.visitsNextWeek}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>Hitos colaborador vencidos</span>
                  </div>
                  <span className="font-semibold tabular-nums">{data.kpis.overdueCollaboratorMilestones}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>Post-venta pendiente/enviada</span>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {(data.postventa.PENDING ?? 0) + (data.postventa.SENT ?? 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <PlatformLink key={item.href} href={item.href}>
              <Card className="h-full transition-colors duration-150 hover:bg-muted/40 hover:border-primary/30">
                <CardHeader className="pb-1">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm">{item.title}</CardTitle>
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </PlatformLink>
          );
        })}
      </div>
    </div>
  );
}
