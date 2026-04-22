"use client";

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  Loader2,
  TrendingDown,
  ShieldAlert,
  BarChart3,
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
  sla_breach: "Plazo incumplido",
  deviation: "Desviación vs media",
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
    default:
      return <AlertOctagon className="h-5 w-5" />;
  }
}

function severityColor(severity: string) {
  switch (severity) {
    case "high":
      return { border: "#ef4444", bg: "bg-urus-danger/10 text-urus-danger", text: "text-urus-danger" };
    case "medium":
      return { border: "#f59e0b", bg: "bg-urus-warning/10 text-urus-warning", text: "text-urus-warning" };
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
        <Card className="bg-urus-danger/5 dark:bg-urus-danger/10 border-urus-danger/30 dark:border-urus-danger/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-urus-danger">
              Alertas Críticas
            </CardTitle>
            <AlertOctagon className="h-4 w-4 text-urus-danger" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-urus-danger">
              {loading ? "-" : highCount}
            </div>
            <p className="text-xs text-urus-danger/80">
              Severidad alta sin resolver
            </p>
          </CardContent>
        </Card>

        <Card className="bg-urus-warning/5 dark:bg-urus-warning/10 border-urus-warning/30 dark:border-urus-warning/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-urus-warning">
              Plazos Incumplidos
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-urus-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-urus-warning">
              {loading ? "-" : slaCount}
            </div>
            <p className="text-xs text-urus-warning/80">
              Clientes, firma o micrositio
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
        {(["drop", "sla_breach", "deviation"] as const).map((type) => (
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
          <h2 className="text-lg font-semibold tracking-tight">Registro de Alertas</h2>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={loading}>
            {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Actualizar
          </Button>
        </div>

        {error && (
          <Card className="border-urus-danger/30 bg-urus-danger/5 dark:bg-urus-danger/10">
            <CardContent className="p-4 text-sm text-urus-danger">
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
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-urus-success/50" />
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
                <Badge variant="outline" className="bg-urus-success/10 text-urus-success border-urus-success/30 font-normal">
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
