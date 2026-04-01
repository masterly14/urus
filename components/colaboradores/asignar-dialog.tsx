"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Loader2, X, Building2 } from "lucide-react";

type Operacion = {
  id: string;
  codigo: string;
  propertyCode: string;
  estado: string;
  ciudad: string;
  _count: { asignaciones: number };
};

type HitoInput = { nombre: string; orden: number; slaDias: number | null };

export function AsignarDialog({
  colaboradorId,
  colaboradorTipo,
  onAssigned,
}: {
  colaboradorId: string;
  colaboradorTipo: string;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [search, setSearch] = useState("");
  const [selectedOp, setSelectedOp] = useState<Operacion | null>(null);
  const [hitos, setHitos] = useState<HitoInput[]>([]);
  const [newHitoName, setNewHitoName] = useState("");
  const [newHitoSla, setNewHitoSla] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingOps(true);
    fetch(`/api/operaciones?limit=100&search=${encodeURIComponent(search)}`)
      .then((r) => r.json())
      .then((data) => setOperaciones(data.operaciones ?? []))
      .catch(() => setOperaciones([]))
      .finally(() => setLoadingOps(false));
  }, [open, search]);

  useEffect(() => {
    if (!open || !selectedOp) return;
    fetch(`/api/colaboradores/route?tipo=${encodeURIComponent(colaboradorTipo)}`)
      .catch(() => null);
  }, [open, selectedOp, colaboradorTipo]);

  const addHito = () => {
    if (!newHitoName.trim()) return;
    setHitos((prev) => [
      ...prev,
      {
        nombre: newHitoName.trim(),
        orden: prev.length + 1,
        slaDias: newHitoSla ? parseInt(newHitoSla, 10) : null,
      },
    ]);
    setNewHitoName("");
    setNewHitoSla("");
  };

  const removeHito = (idx: number) => {
    setHitos((prev) => prev.filter((_, i) => i !== idx).map((h, i) => ({ ...h, orden: i + 1 })));
  };

  const handleAssign = async () => {
    if (!selectedOp) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/colaboradores/${colaboradorId}/asignaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operacionId: selectedOp.id,
          hitos: hitos.length > 0 ? hitos : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al asignar");
      setOpen(false);
      setSelectedOp(null);
      setHitos([]);
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Asignar a Operación
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Asignar a Operación</DialogTitle>
        </DialogHeader>

        {!selectedOp ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar operación por código o propiedad..."
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1.5">
              {loadingOps ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : operaciones.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No hay operaciones disponibles
                </p>
              ) : (
                operaciones.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => setSelectedOp(op)}
                    className="w-full text-left rounded-lg p-3 border border-border/30 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-secondary" />
                        <span className="text-sm font-medium font-mono">{op.codigo}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px]">{op.estado}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Propiedad: {op.propertyCode} · {op._count.asignaciones} colaborador{op._count.asignaciones !== 1 ? "es" : ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg p-3 bg-accent/20 border border-border/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-secondary" />
                  <span className="text-sm font-medium font-mono">{selectedOp.codigo}</span>
                  <Badge variant="outline" className="text-[9px]">{selectedOp.estado}</Badge>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => setSelectedOp(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Hitos (opcional — si vacío, se usan las plantillas del tipo)
              </Label>

              {hitos.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground font-mono w-5">{h.orden}.</span>
                  <span className="flex-1">{h.nombre}</span>
                  {h.slaDias && <span className="text-muted-foreground">{h.slaDias}d</span>}
                  <Button variant="ghost" size="icon-xs" onClick={() => removeHito(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <div className="flex gap-1.5">
                <Input
                  value={newHitoName}
                  onChange={(e) => setNewHitoName(e.target.value)}
                  placeholder="Nombre del hito"
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHito())}
                />
                <Input
                  value={newHitoSla}
                  onChange={(e) => setNewHitoSla(e.target.value)}
                  placeholder="SLA (días)"
                  type="number"
                  className="h-7 text-xs w-20"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHito())}
                />
                <Button variant="outline" size="xs" onClick={addHito}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {error && <p className="text-xs text-[var(--urus-danger)]">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedOp(null); setHitos([]); }}>
                Atrás
              </Button>
              <Button size="sm" onClick={handleAssign} disabled={loading}>
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                Asignar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
