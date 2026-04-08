"use client";

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  TrendingDown,
  ShieldAlert,
  BarChart3,
  Brain,
  Repeat,
  Gauge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDashboardAlerts,
  type DashboardAlert,
  type DashboardAlertsFilters,
} from "@/lib/hooks/use-dashboard-alerts";

const TYPE_LABELS: Record<string, string> = {
  drop: "Caída rendimiento",
  sla_breach: "SLA incumplido",
  deviation: "Desviación vs media",
  mh_energy_low: "Coach: energía baja",
  mh_bloqueo_recurrente: "Coach: bloqueo recurrente",
  mh_sobrecarga_uso: "Coach: uso intensivo",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

function AlertIcon({ type }: { type: string }) {
  switch (type) {
    case "drop":
      return <TrendingDown className="h-5 w-5" />;
    case "sla_breach":
      return <ShieldAlert className="h-5 w-5" />;
    case "deviation":
      return <BarChart3 className="h-5 w-5" />;
    case "mh_energy_low":
      return <Gauge className="h-5 w-5" />;
    case "mh_bloqueo_recurrente":
      return <Repeat className="h-5 w-5" />;
    case "mh_sobrecarga_uso":
      return <Brain className="h-5 w-5" />;
    default:
      return <AlertOctagon className="h-5 w-5" />;
  }
}

function severityColor(severity: string) {
  switch (severity) {
    case "high":
      return { border: "#ef4444", bg: "bg-red-100 text-red-600", text: "text-red-600" };
    case "medium":
      return { border: "#f59e0b", bg: "bg-amber-100 text-amber-600", text: "text-amber-600" };
    default:
      return { border: "#3b82f6", bg: "bg-blue-100 text-blue-600", text: "text-blue-600" };
  }
}

export default function PerformanceAlertsPage() {
  const [filters, setFilters] = useState<DashboardAlertsFilters>({
    resolved: false,
  });
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  const [activeSeverityFilter, setActiveSeverityFilter] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const effectiveFilters: DashboardAlertsFilters = {
    ...filters,
    ...(activeTypeFilter ? { type: activeTypeFilter } : {}),
    ...(activeSeverityFilter ? { severity: activeSeverityFilter } : {}),
  };

  const { data, loading, error, refetch, resolveAlert } = useDashboardAlerts(effectiveFilters);

  const alerts = data?.alerts ?? [];
  const total = data?.total ?? 0;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const slaCount = alerts.filter((a) => a.type === "sla_breach").length;

  async function handleResolve(alertId: string) {
    setResolving(alertId);
    try {
      await resolveAlert(alertId);
    } catch {
      // Error handled by hook
    } finally {
      setResolving(null);
    }
  }

  function toggleTypeFilter(type: string) {
    setActiveTypeFilter((prev) => (prev === type ? null : type));
  }

  function toggleSeverityFilter(severity: string) {
    setActiveSeverityFilter((prev) => (prev === severity ? null : severity));
  }

  function toggleShowResolved() {
    setFilters((prev) => ({ ...prev, resolved: !prev.resolved }));
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-800 dark:text-red-200">
              Alertas Criticas
            </CardTitle>
            <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">
              {loading ? "-" : highCount}
            </div>
            <p className="text-xs text-red-600/80 dark:text-red-400/80">
              Severidad alta sin resolver
            </p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-200">
              SLAs Incumplidos
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
              {loading ? "-" : slaCount}
            </div>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
              Leads, firma o microsite
            </p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Total Alertas
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {loading ? "-" : total}
            </div>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
              {filters.resolved ? "Incluye resueltas" : "Sin resolver"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-1">Tipo:</span>
        {(
          [
            "drop",
            "sla_breach",
            "deviation",
            "mh_energy_low",
            "mh_bloqueo_recurrente",
            "mh_sobrecarga_uso",
          ] as const
        ).map((type) => (
          <Button
            key={type}
            size="sm"
            variant={activeTypeFilter === type ? "default" : "outline"}
            className="text-xs h-7"
            onClick={() => toggleTypeFilter(type)}
          >
            {TYPE_LABELS[type]}
          </Button>
        ))}
        <span className="text-sm text-muted-foreground ml-3 mr-1">Severidad:</span>
        {(["high", "medium", "low"] as const).map((sev) => (
          <Button
            key={sev}
            size="sm"
            variant={activeSeverityFilter === sev ? "default" : "outline"}
            className="text-xs h-7"
            onClick={() => toggleSeverityFilter(sev)}
          >
            {SEVERITY_LABELS[sev]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-7 ml-auto"
          onClick={toggleShowResolved}
        >
          {filters.resolved ? "Ocultar resueltas" : "Mostrar resueltas"}
        </Button>
      </div>

      {/* Alert feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Feed de Anomalias</h2>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={loading}>
            {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Actualizar
          </Button>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
            <CardContent className="p-4 text-sm text-red-700 dark:text-red-300">
              Error: {error}
            </CardContent>
          </Card>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && alerts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-emerald-500/50" />
            <p>No hay alertas activas. El rendimiento es optimo.</p>
          </div>
        )}

        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onResolve={handleResolve}
            resolving={resolving === alert.id}
          />
        ))}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  onResolve,
  resolving,
}: {
  alert: DashboardAlert;
  onResolve: (id: string) => void;
  resolving: boolean;
}) {
  const colors = severityColor(alert.severity);

  return (
    <Card
      className={cn(
        "border-l-4 shadow-sm hover:bg-accent/5 transition-colors",
        alert.resolvedAt && "opacity-60",
      )}
      style={{ borderLeftColor: colors.border }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={cn("p-2 rounded-full shrink-0", colors.bg)}>
            <AlertIcon type={alert.type} />
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{alert.message}</h3>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />{" "}
                {new Date(alert.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Agente:{" "}
              <span className="font-medium text-foreground">
                {alert.comercialNombre}
              </span>
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Badge
                variant="outline"
                className="bg-transparent border-dashed text-muted-foreground font-normal"
              >
                {TYPE_LABELS[alert.type] ?? alert.type}
              </Badge>
              <Badge
                variant="outline"
                className={cn("bg-transparent border-dashed font-normal", colors.text)}
              >
                {SEVERITY_LABELS[alert.severity] ?? alert.severity}
              </Badge>
              {alert.resolvedAt && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-normal">
                  Resuelta
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 self-center">
            {!alert.resolvedAt && (
              <Button
                size="sm"
                variant={alert.severity === "high" ? "destructive" : "outline"}
                className="text-xs h-8"
                onClick={() => onResolve(alert.id)}
                disabled={resolving}
              >
                {resolving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Resolver"
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
