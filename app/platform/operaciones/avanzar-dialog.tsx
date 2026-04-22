"use client";

import { useState } from "react";
import { ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { operacionEstadoFilterLabels } from "@/lib/postventa/pipeline-filter-options";

const STAGE_ORDER = ["EN_CURSO", "OFERTA_FIRME", "RESERVA", "ARRAS", "PENDIENTE_FIRMA"] as const;

interface MissingField {
  field: string;
  label: string;
  source: string;
}

export function AvanzarDialog({
  operacion,
  onOpenChange,
  onSuccess,
}: {
  operacion: { id: string; codigo: string; estado: string };
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const currentIdx = STAGE_ORDER.indexOf(operacion.estado as typeof STAGE_ORDER[number]);
  const availableStages = STAGE_ORDER.filter((_, i) => i > currentIdx);

  const [targetEstado, setTargetEstado] = useState<string>(availableStages[0] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [documentKind, setDocumentKind] = useState<string | null>(null);
  const [manualData, setManualData] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    if (!targetEstado) return;
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { targetEstado };
      if (Object.keys(manualData).length > 0) {
        body.manualData = manualData;
      }

      const res = await fetch(`/api/operaciones/${operacion.id}/avanzar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.status === 422 && data.missingFields) {
        setMissingFields(data.missingFields);
        setDocumentKind(data.documentKind ?? null);
        return;
      }

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4" /> Avanzar operación {operacion.codigo}
          </DialogTitle>
          <DialogDescription>
            Estado actual: {operacionEstadoFilterLabels[operacion.estado as keyof typeof operacionEstadoFilterLabels] ?? operacion.estado}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {availableStages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay etapas disponibles para avanzar.</p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Etapa destino</label>
                <select
                  value={targetEstado}
                  onChange={(e) => { setTargetEstado(e.target.value); setMissingFields([]); setManualData({}); }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {availableStages.map((s) => (
                    <option key={s} value={s}>
                      {operacionEstadoFilterLabels[s as keyof typeof operacionEstadoFilterLabels] ?? s}
                    </option>
                  ))}
                </select>
              </div>

              {missingFields.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-urus-warning font-medium">
                    Faltan datos para generar el documento ({documentKind}):
                  </p>
                  {missingFields.map((f) => (
                    <div key={f.field}>
                      <label className="text-xs text-muted-foreground">{f.label} ({f.source})</label>
                      <input
                        type="text"
                        value={manualData[f.field] ?? ""}
                        onChange={(e) => setManualData({ ...manualData, [f.field]: e.target.value })}
                        placeholder={f.label}
                        className="mt-0.5 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            {availableStages.length > 0 && (
              <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {missingFields.length > 0 ? "Reintentar con datos" : "Avanzar"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
