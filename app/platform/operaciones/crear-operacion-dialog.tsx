"use client";

import { useState, useRef } from "react";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PropertySelector, type PropertyOption } from "@/components/captacion/property-selector";
import { DemandSelector, type DemandOption } from "@/components/operaciones/demand-selector";

export function CrearOperacionDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [property, setProperty] = useState<PropertyOption | null>(null);
  const [demand, setDemand] = useState<DemandOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setProperty(null);
    setDemand(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!property) {
      setError("Selecciona una propiedad");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        propertyCode: property.codigo,
      };
      if (property.ciudad) body.ciudad = property.ciudad;
      if (demand) body.demandId = demand.codigo;

      const res = await fetch("/api/operaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent
        ref={sheetRef}
        side="right"
        className="w-full overflow-y-auto sm:!max-w-[640px] md:!max-w-[720px] lg:!max-w-[820px]"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nueva operación
          </SheetTitle>
          <SheetDescription>
            Crea una operación sobre una propiedad. Se iniciará en estado En curso.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-8 px-4 pb-6">
          {/* Propiedad */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Propiedad *</label>
            <PropertySelector
              value={property}
              onChange={setProperty}
              portalContainer={sheetRef}
            />
          </div>

          {/* Demanda */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Demanda (comprador, opcional)</label>
            <DemandSelector
              value={demand}
              onChange={setDemand}
              portalContainer={sheetRef}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !property}
            className="w-full mt-auto gap-2"
            size="lg"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {submitting ? "Creando operación..." : "Crear operación"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
