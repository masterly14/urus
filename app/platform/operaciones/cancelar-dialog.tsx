"use client";

import { useState } from "react";
import { XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CancelarDialog({
  operacion,
  onOpenChange,
  onSuccess,
}: {
  operacion: { id: string; codigo: string };
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${operacion.id}/cancelar`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" /> Cancelar operación
          </DialogTitle>
          <DialogDescription>
            ¿Seguro que deseas cancelar la operación <strong>{operacion.codigo}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            La operación pasará a estado <strong>Cancelada</strong>. La demanda asociada no se
            modificará automáticamente — el comercial decide su siguiente estado.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Volver
            </Button>
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              {submitting ? "Cancelando..." : "Cancelar operación"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
