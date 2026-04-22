"use client";

import { useState } from "react";
import { FileText, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STAGE_TO_KIND: Record<string, string> = {
  OFERTA_FIRME: "oferta_firme",
  RESERVA: "senal_compra",
  ARRAS: "arras",
};

const KIND_LABELS: Record<string, string> = {
  oferta_firme: "Oferta en Firme",
  senal_compra: "Señal de Compra",
  arras: "Contrato de Arras",
};

export function CompletarDatosDialog({
  operacion,
  onOpenChange,
  onSuccess,
}: {
  operacion: { id: string; codigo: string; estado: string };
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const defaultKind = STAGE_TO_KIND[operacion.estado] ?? "";
  const [documentKind, setDocumentKind] = useState(defaultKind);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addField = () => {
    if (fieldKey.trim() && fieldValue.trim()) {
      setFields({ ...fields, [fieldKey.trim()]: fieldValue.trim() });
      setFieldKey("");
      setFieldValue("");
    }
  };

  const removeField = (key: string) => {
    const next = { ...fields };
    delete next[key];
    setFields(next);
  };

  const handleSubmit = async () => {
    if (!documentKind) {
      setError("Selecciona un tipo de documento");
      return;
    }
    if (Object.keys(fields).length === 0) {
      setError("Agrega al menos un dato");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${operacion.id}/completar-datos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentKind, data: fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        onSuccess();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText className="h-4 w-4" /> Completar datos — {operacion.codigo}
          </DialogTitle>
          <DialogDescription>
            Proporciona los datos faltantes para reintentar la generación del contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo de documento</label>
            <select
              value={documentKind}
              onChange={(e) => setDocumentKind(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="">Seleccionar...</option>
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Existing fields */}
          {Object.keys(fields).length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Datos agregados</label>
              {Object.entries(fields).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 break-all">
                    <strong>{k}:</strong> {v}
                  </span>
                  <button onClick={() => removeField(k)} className="text-destructive hover:underline text-xs">Quitar</button>
                </div>
              ))}
            </div>
          )}

          {/* Add field */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input
              type="text"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              placeholder="Campo (ej: totalPurchasePrice)"
              className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            <input
              type="text"
              value={fieldValue}
              onChange={(e) => setFieldValue(e.target.value)}
              placeholder="Valor"
              className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            <Button variant="outline" size="sm" onClick={addField} className="h-8 w-full text-xs sm:w-auto">
              Agregar
            </Button>
          </div>

          {success && (
            <div className="text-xs text-green-600 bg-green-50 rounded-md px-3 py-2">
              Generación de contrato re-encolada correctamente.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || success} className="gap-1.5">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {submitting ? "Enviando..." : "Enviar datos"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
