"use client";

import * as React from "react";
import { ClipboardCheck, AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SyncTaskTable,
  type SyncTask,
  type SyncTaskStatus,
  type SyncTaskType,
} from "@/components/configuracion/sync-task-table";
import { CompleteSyncTaskDialog } from "@/components/configuracion/complete-sync-task-dialog";
import { useAppSession } from "@/lib/hooks/use-session";

type SyncTaskApiResponse = {
  ok: boolean;
  error?: string;
  tasks: SyncTask[];
  counts: {
    pending: number;
    inProgress: number;
    blocked: number;
    doneToday: number;
    total: number;
  };
};

type ViewState = "loading" | "error" | "success";

const DEFAULT_COUNTS = { pending: 0, inProgress: 0, blocked: 0, doneToday: 0, total: 0 };

export function SyncTasksTab() {
  const { user } = useAppSession();
  const [tasks, setTasks] = React.useState<SyncTask[]>([]);
  const [counts, setCounts] = React.useState(DEFAULT_COUNTS);
  const [viewState, setViewState] = React.useState<ViewState>("loading");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<SyncTaskStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = React.useState<SyncTaskType | "ALL">("ALL");
  const [search, setSearch] = React.useState("");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isUpdatingTaskId, setIsUpdatingTaskId] = React.useState<string | null>(null);
  const [taskToComplete, setTaskToComplete] = React.useState<SyncTask | null>(null);
  const [isCompleting, setIsCompleting] = React.useState(false);

  const loadTasks = React.useCallback(async () => {
    setErrorMsg(null);
    setViewState((prev) => (prev === "success" ? prev : "loading"));
    setIsRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "200");

      const res = await fetch(`/api/sync-tasks?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as SyncTaskApiResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo cargar la lista de tareas");
      }

      setTasks(data.tasks ?? []);
      setCounts(data.counts ?? DEFAULT_COUNTS);
      setViewState("success");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Error inesperado");
      setViewState("error");
    } finally {
      setIsRefreshing(false);
    }
  }, [search, statusFilter, typeFilter]);

  React.useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function updateTaskStatus(taskId: string, status: Exclude<SyncTaskStatus, "DONE">) {
    setIsUpdatingTaskId(taskId);
    try {
      const res = await fetch("/api/sync-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo actualizar la tarea");
      }
      await loadTasks();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsUpdatingTaskId(null);
    }
  }

  async function completeTask(note: string) {
    if (!taskToComplete) return;
    setIsCompleting(true);
    try {
      const res = await fetch(`/api/sync-tasks/${encodeURIComponent(taskToComplete.id)}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, note }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo marcar la tarea como hecha");
      }
      setTaskToComplete(null);
      await loadTasks();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsCompleting(false);
    }
  }

  const isEmpty = viewState === "success" && tasks.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Tareas de sincronizacion</h2>
          <p className="text-sm text-muted-foreground">
            Seguimiento de sincronizaciones manuales pendientes con Inmovilla tras transferencias de comercial.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadTasks()} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{counts.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">En progreso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{counts.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bloqueadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{counts.blocked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Hechas hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{counts.doneToday}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sync-task-search">Buscar</Label>
            <Input
              id="sync-task-search"
              placeholder="Codigo, ref, responsable o nota"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SyncTaskStatus | "ALL")}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="PENDING">Pendiente</SelectItem>
                <SelectItem value="IN_PROGRESS">En progreso</SelectItem>
                <SelectItem value="BLOCKED">Bloqueada</SelectItem>
                <SelectItem value="DONE">Hecha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as SyncTaskType | "ALL")}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="PROPERTY">Propiedad</SelectItem>
                <SelectItem value="DEMAND">Demanda</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {errorMsg && (
        <div className="rounded-lg border border-urus-danger/30 bg-urus-danger-bg p-3 text-sm text-urus-danger">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {viewState === "loading" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      )}

      {viewState === "error" && (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="No se pudieron cargar las tareas"
              description="Revisa la conexion o los permisos y vuelve a intentarlo."
              action={
                <Button type="button" variant="outline" onClick={() => void loadTasks()}>
                  Reintentar
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {isEmpty && (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ClipboardCheck}
              title="No hay tareas para sincronizar"
              description="Cuando transfieras un comercial con propiedades o demandas, apareceran aqui."
              action={
                <Button type="button" variant="outline" onClick={() => void loadTasks()}>
                  Actualizar lista
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {viewState === "success" && tasks.length > 0 && (
        <SyncTaskTable
          tasks={tasks}
          isUpdatingTaskId={isUpdatingTaskId}
          onMarkInProgress={(taskId) => void updateTaskStatus(taskId, "IN_PROGRESS")}
          onMarkBlocked={(taskId) => void updateTaskStatus(taskId, "BLOCKED")}
          onMarkDone={(task) => setTaskToComplete(task)}
        />
      )}

      <CompleteSyncTaskDialog
        task={taskToComplete}
        open={Boolean(taskToComplete)}
        loading={isCompleting}
        onOpenChange={(open) => {
          if (!open) setTaskToComplete(null);
        }}
        onConfirm={(note) => void completeTask(note)}
      />

      {user?.role === "comercial" && (
        <p className="text-xs text-muted-foreground">
          Solo ves tareas donde eres responsable. CEO/Admin tienen visibilidad global.
        </p>
      )}
    </div>
  );
}
