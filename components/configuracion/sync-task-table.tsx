"use client";

import { CheckCircle2, Loader2, PlayCircle, PauseCircle } from "lucide-react";
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

export type SyncTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "BLOCKED";
export type SyncTaskType = "PROPERTY" | "DEMAND";
export type SyncTask = {
  id: string;
  type: SyncTaskType;
  status: SyncTaskStatus;
  recordCode: string;
  recordRef: string | null;
  targetComercialName: string;
  note: string;
  createdAt: string;
  doneAt: string | null;
};

type SyncTaskTableProps = {
  tasks: SyncTask[];
  isUpdatingTaskId: string | null;
  onMarkInProgress: (taskId: string) => void;
  onMarkBlocked: (taskId: string) => void;
  onMarkDone: (task: SyncTask) => void;
};

function statusBadgeVariant(status: SyncTaskStatus) {
  switch (status) {
    case "DONE":
      return "success" as const;
    case "IN_PROGRESS":
      return "warning" as const;
    case "BLOCKED":
      return "destructive" as const;
    default:
      return "info" as const;
  }
}

function statusLabel(status: SyncTaskStatus) {
  switch (status) {
    case "DONE":
      return "Hecha";
    case "IN_PROGRESS":
      return "En progreso";
    case "BLOCKED":
      return "Bloqueada";
    default:
      return "Pendiente";
  }
}

function typeLabel(type: SyncTaskType) {
  return type === "PROPERTY" ? "Propiedad" : "Demanda";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function SyncTaskTable({
  tasks,
  isUpdatingTaskId,
  onMarkInProgress,
  onMarkBlocked,
  onMarkDone,
}: SyncTaskTableProps) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarea</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creada</TableHead>
            <TableHead>Cierre</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                No hay tareas para los filtros aplicados.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => {
              const isUpdating = isUpdatingTaskId === task.id;
              const isDone = task.status === "DONE";
              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="font-medium">{typeLabel(task.type)}</div>
                    <div className="text-xs text-muted-foreground">
                      {task.recordCode}
                      {task.recordRef ? ` · ${task.recordRef}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{task.targetComercialName}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(task.status)}>{statusLabel(task.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(task.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(task.doneAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!isDone && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => onMarkInProgress(task.id)}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <PlayCircle className="h-4 w-4" />
                          )}
                          En progreso
                        </Button>
                      )}

                      {!isDone && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => onMarkBlocked(task.id)}
                        >
                          <PauseCircle className="h-4 w-4" />
                          Bloqueada
                        </Button>
                      )}

                      {!isDone && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => onMarkDone(task)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Marcar hecha
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
