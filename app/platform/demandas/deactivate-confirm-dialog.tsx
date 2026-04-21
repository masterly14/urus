"use client";

import { useState } from "react";
import { Ban, AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function displayBuyerName(nombre: string): string {
  const t = nombre?.trim() ?? "";
  if (!t) return "Sin nombre";
  if (/^null$/i.test(t) || /^undefined$/i.test(t)) return "Sin nombre";
  return t;
}

export function DeactivateConfirmDialog({
  open,
  onOpenChange,
  demandCodigo,
  buyerName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demandCodigo: string;
  buyerName: string;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/demands/${encodeURIComponent(demandCodigo)}/deactivate`, {
        method: "POST",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-4 w-4" />
            Dar de baja demanda
          </DialogTitle>
          <DialogDescription>
            ¿Seguro que deseas dar de baja la demanda de{" "}
            <strong>{displayBuyerName(buyerName)}</strong> ({demandCodigo})?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            La demanda pasará a estado <strong>Perdido</strong> en la plataforma y se marcará como{" "}
            <strong>Descartada</strong> en Inmovilla. Esta acción no elimina datos — la demanda seguirá
            visible con filtro de estado.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeactivate}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando...
                </>
              ) : (
                <>
                  <Ban className="h-3.5 w-3.5" /> Dar de baja
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
