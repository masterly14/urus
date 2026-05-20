"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SyncTask } from "@/components/configuracion/sync-task-table";

type CompleteSyncTaskDialogProps = {
  task: SyncTask | null;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
};

export function CompleteSyncTaskDialog({
  task,
  open,
  loading,
  onOpenChange,
  onConfirm,
}: CompleteSyncTaskDialogProps) {
  const [checked, setChecked] = React.useState(false);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setChecked(false);
      setNote("");
    }
  }, [open]);

  if (!task) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[520px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar sincronización manual</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Confirma que actualizaste en Inmovilla la{" "}
                <strong>{task.type === "PROPERTY" ? "propiedad" : "demanda"}</strong>{" "}
                <strong>{task.recordCode}</strong>
                {task.recordRef ? ` (${task.recordRef})` : ""}.
              </p>
              <p>
                Esta acción marca la tarea como <strong>hecha</strong> y quedará auditada.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-border p-3">
            <Checkbox
              id="confirm-sync-task"
              checked={checked}
              onCheckedChange={(value) => setChecked(Boolean(value))}
              disabled={loading}
            />
            <Label htmlFor="confirm-sync-task" className="text-sm leading-tight">
              Confirmo que verifiqué manualmente la actualización en Inmovilla.
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sync-task-note">Nota (opcional)</Label>
            <Textarea
              id="sync-task-note"
              placeholder="Detalle de la actualización, incidencias o referencia interna…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            onClick={() => onConfirm(note)}
            disabled={!checked || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Marcar como hecha"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
