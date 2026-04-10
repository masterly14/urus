"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Workflow,
  Users,
  HeartPulse,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Semaforo } from "@/components/dashboard/semaforo";
import { useHealthPanel } from "@/lib/hooks/use-health-panel";
import { UserManagement } from "@/components/configuracion/user-management";
import { cn } from "@/lib/utils";

function toSemaforoStatus(status: "ok" | "degraded" | "error" | "never_run") {
  if (status === "ok") return "verde";
  if (status === "degraded" || status === "never_run") return "amarillo";
  return "rojo";
}

function formatRelativeMinutes(value: number | null): string {
  if (value == null) return "Nunca";
  if (value < 1) return "Hace <1 min";
  return `Hace ${value.toLocaleString("es-ES", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} min`;
}

function formatIso(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("es-ES");
}

function formatSource(source: string): string {
  if (source === "ingestion_cycle_metrics") return "Métrica de ingesta";
  if (source === "execution_metrics") return "Métrica de ejecución";
  if (source === "job_queue") return "Cola de jobs";
  return "Snapshot";
}

type Tab = "users" | "health";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "users", label: "Usuarios", icon: Users },
  { id: "health", label: "Health", icon: HeartPulse },
];

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const { data, loading, error, refetch } = useHealthPanel();

  const totals = useMemo(() => {
    const workers = data?.workers ?? [];
    return {
      ok: workers.filter((worker) => worker.status === "ok").length,
      degraded: workers.filter((worker) => worker.status === "degraded").length,
      neverRun: workers.filter((worker) => worker.status === "never_run").length,
    };
  }, [data?.workers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configuración
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestión de usuarios, invitaciones y estado del sistema.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-1 border-b border-border/40 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-2.5",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "users" && <UserManagement />}

      {activeTab === "health" && (
        <>
      <div className="flex items-center gap-3 justify-end">
          <Badge variant={data?.status === "ok" ? "secondary" : "destructive"}>
            Estado global: {data?.status ?? "cargando"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error || !data ? (
        <div className="flex h-64 items-center justify-center">
          <AlertTriangle className="mr-2 h-6 w-6 text-destructive" />
          <span className="text-destructive">{error ?? "No se pudo cargar el panel"}</span>
        </div>
      ) : (
        <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workers OK</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.ok}</div>
            <p className="text-xs text-muted-foreground">
              {data.workers.length} workers monitorizados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workers degradados</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.degraded}</div>
            <p className="text-xs text-muted-foreground">
              {totals.neverRun} sin ejecución registrada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">DB</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.db.toUpperCase()}</div>
            <p className="text-xs text-muted-foreground">
              Última lectura: {formatIso(data.timestamp)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs pendientes</CardTitle>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.jobQueue.pending}</div>
            <p className="text-xs text-muted-foreground">
              {data.jobQueue.inProgress} en progreso
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-200/50 dark:border-amber-800/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errores / DLQ</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {data.jobQueue.failed + data.jobQueue.deadLetter}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.jobQueue.deadLetter} en dead-letter
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Estado de workers</CardTitle>
            <CardDescription>
              Último poll o ejecución exitosa registrada por worker.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último éxito</TableHead>
                  <TableHead>Antigüedad</TableHead>
                  <TableHead>Fuente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.workers.map((worker) => (
                  <TableRow key={worker.id}>
                    <TableCell>
                      <div className="font-medium">{worker.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {worker.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Semaforo
                        status={toSemaforoStatus(worker.status)}
                        pulse={worker.status !== "ok"}
                        label={worker.status}
                      />
                    </TableCell>
                    <TableCell>{formatIso(worker.lastSuccessAt)}</TableCell>
                    <TableCell>{formatRelativeMinutes(worker.ageMinutes)}</TableCell>
                    <TableCell>{formatSource(worker.lastSuccessSource)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cola por tipo</CardTitle>
            <CardDescription>
              Jobs pendientes agregados por `type`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.pendingByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay jobs pendientes en cola.
              </p>
            ) : (
              data.pendingByType.map((item) => (
                <div
                  key={item.type}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="text-sm font-medium">{item.type}</span>
                  <Badge variant="outline">{item.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jobs pendientes y en progreso</CardTitle>
            <CardDescription>
              Primeros jobs activos ordenados por disponibilidad/antigüedad.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Intentos</TableHead>
                  <TableHead>Edad</TableHead>
                  <TableHead>Disponible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pendingJobs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No hay jobs activos.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.pendingJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="font-medium">{job.type}</div>
                        <div className="text-xs text-muted-foreground">
                          {job.id.slice(0, 10)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={job.status === "IN_PROGRESS" ? "secondary" : "outline"}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {job.attempts}/{job.maxAttempts}
                      </TableCell>
                      <TableCell>{formatRelativeMinutes(job.ageMinutes)}</TableCell>
                      <TableCell>{formatIso(job.availableAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Errores recientes</CardTitle>
            <CardDescription>
              Últimos fallos de la cola de jobs y dead-letter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentErrors.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No hay errores recientes.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.recentErrors.map((errorItem) => (
                    <TableRow key={errorItem.id}>
                      <TableCell>
                        <div className="font-medium">{errorItem.type}</div>
                        <div className="text-xs text-muted-foreground">
                          {errorItem.id.slice(0, 10)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[360px] truncate">
                        {errorItem.lastError ?? "Sin detalle"}
                      </TableCell>
                      <TableCell>{formatIso(errorItem.failedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lectura operativa rápida</CardTitle>
          <CardDescription>
            Resumen de salud para diagnóstico rápido del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              Última actualización
            </div>
            <p className="text-sm text-muted-foreground">
              {formatIso(data.timestamp)}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Workflow className="h-4 w-4 text-muted-foreground" />
              Cola activa
            </div>
            <p className="text-sm text-muted-foreground">
              {data.jobQueue.pending} pendientes, {data.jobQueue.inProgress} en
              progreso y {data.jobQueue.deadLetter} en DLQ.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Riesgo actual
            </div>
            <p className="text-sm text-muted-foreground">
              {data.status === "ok"
                ? "Todos los workers reportan actividad reciente."
                : "Hay workers degradados o sin ejecución reciente; revisar detalle."}
            </p>
          </div>
        </CardContent>
      </Card>
        </>
      )}
        </>
      )}
    </div>
  );
}
