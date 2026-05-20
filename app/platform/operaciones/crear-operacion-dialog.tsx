"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PropertySelector, type PropertyOption } from "@/components/captacion/property-selector";
import { DemandSelector, type DemandOption } from "@/components/operaciones/demand-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/hooks/use-session";

type ComercialOption = {
  id: string;
  nombre: string;
  ciudad: string;
  email: string;
};

export function CrearOperacionDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { session } = useSession();
  const isCeo = session.role === "ceo";

  const [property, setProperty] = useState<PropertyOption | null>(null);
  const [demand, setDemand] = useState<DemandOption | null>(null);
  const [comercialId, setComercialId] = useState("");
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [loadingComerciales, setLoadingComerciales] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setProperty(null);
    setDemand(null);
    setComercialId("");
    setError(null);
  };

  const loadComerciales = async () => {
    if (!isCeo) return;
    setLoadingComerciales(true);
    try {
      const res = await fetch("/api/comerciales/activos");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudieron cargar comerciales");
      }
      setComerciales((data.comerciales as ComercialOption[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar comerciales");
    } finally {
      setLoadingComerciales(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadComerciales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCeo]);

  const handleSubmit = async () => {
    if (!property) {
      setError("Selecciona una propiedad");
      return;
    }
    if (isCeo && !comercialId) {
      setError("Selecciona el comercial responsable de la operación");
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
      if (isCeo) body.comercialId = comercialId;

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
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent
        ref={sheetRef}
        side="right"
        className="w-full overflow-y-auto data-[side=right]:border-l-0 sm:!max-w-[640px] md:!max-w-[720px] lg:!max-w-[820px]"
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

          {/* Comercial obligatorio para CEO */}
          {isCeo && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Comercial responsable *</label>
              <Select
                value={comercialId}
                onValueChange={setComercialId}
                disabled={submitting || loadingComerciales}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingComerciales ? "Cargando comerciales..." : "Selecciona un comercial"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {loadingComerciales ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">Cargando comerciales...</div>
                  ) : comerciales.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No hay comerciales activos disponibles
                    </div>
                  ) : (
                    comerciales.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} ({c.ciudad})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !property || (isCeo && !comercialId)}
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
