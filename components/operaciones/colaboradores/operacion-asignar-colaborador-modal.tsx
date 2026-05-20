"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Loader2, X, CircleUserRound } from "lucide-react";

type Colaborador = {
  id: string;
  nombre: string;
  tipo: string;
  email: string | null;
  telefono: string | null;
};

type HitoInput = { nombre: string; orden: number; slaDias: number | null };

export function OperacionAsignarColaboradorModal({
  operacionId,
  onOpenChange,
  onSuccess,
}: {
  operacionId: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [search, setSearch] = useState("");
  const [selectedColab, setSelectedColab] = useState<Colaborador | null>(null);
  const [hitos, setHitos] = useState<HitoInput[]>([]);
  const [newHitoName, setNewHitoName] = useState("");
  const [newHitoSla, setNewHitoSla] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingColabs, setLoadingColabs] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoadingColabs(true);
    fetch(`/api/colaboradores?activo=true`)
      .then((r) => r.json())
      .then((data) => setColaboradores(data.colaboradores ?? []))
      .catch(() => setColaboradores([]))
      .finally(() => setLoadingColabs(false));
  }, []);

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
    if (!selectedColab) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/colaboradores/${selectedColab.id}/asignaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operacionId: operacionId,
          hitos: hitos.length > 0 ? hitos : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al asignar");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const filteredColabs = colaboradores.filter(c => 
    c.nombre.toLowerCase().includes(search.toLowerCase()) || 
    c.tipo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Asignar Colaborador</DialogTitle>
        </DialogHeader>

        {!selectedColab ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar colaborador por nombre o tipo..."
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1.5">
              {loadingColabs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredColabs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No hay colaboradores disponibles
                </p>
              ) : (
                filteredColabs.map((colab) => (
                  <button
                    key={colab.id}
                    onClick={() => setSelectedColab(colab)}
                    className="w-full text-left rounded-lg p-3 border border-border/30 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CircleUserRound className="h-3.5 w-3.5 text-secondary" />
                        <span className="text-sm font-medium">{colab.nombre}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px]">{colab.tipo}</Badge>
                    </div>
                    {(colab.email || colab.telefono) && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {colab.telefono} {colab.telefono && colab.email ? '·' : ''} {colab.email}
                      </p>
                    )}
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
                  <CircleUserRound className="h-3.5 w-3.5 text-secondary" />
                  <span className="text-sm font-medium">{selectedColab.nombre}</span>
                  <Badge variant="outline" className="text-[9px]">{selectedColab.tipo}</Badge>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => setSelectedColab(null)}>
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

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedColab(null); setHitos([]); }}>
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
