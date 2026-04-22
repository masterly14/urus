"use client";

import { useState } from "react";
import { CheckCircle, Search, Loader2, AlertTriangle, UserPlus, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Step = "tipo" | "comprador" | "confirmar";

interface DemandResult {
  codigo: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
  zonas: string;
  tipos: string;
}

interface ClienteResult {
  cod_cli: number | string;
  nombre: string;
  apellidos: string;
  nif: string;
  telefono1: number | string;
  email: string;
}

export function CerrarDialog({
  operacion,
  onOpenChange,
  onSuccess,
}: {
  operacion: { id: string; codigo: string; estado: string; demandId: string | null; buyerClientId: string | null };
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>("tipo");
  const [tipoCierre, setTipoCierre] = useState("CERRADA_VENTA");
  const [selectedDemandId, setSelectedDemandId] = useState(operacion.demandId ?? "");
  const [selectedBuyerClientId, setSelectedBuyerClientId] = useState(operacion.buyerClientId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buyer search state
  const [searchMode, setSearchMode] = useState<"local" | "inmovilla">("local");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTelefono, setSearchTelefono] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [localResults, setLocalResults] = useState<DemandResult[]>([]);
  const [suggestedDemand, setSuggestedDemand] = useState<DemandResult | null>(null);
  const [inmovillaResults, setInmovillaResults] = useState<ClienteResult[]>([]);

  const searchLocal = async () => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "10");
      const res = await fetch(`/api/operaciones/${operacion.id}/buscar-comprador?${params}`);
      const data = await res.json();
      setLocalResults(data.demands ?? []);
      setSuggestedDemand(data.suggestedDemand ?? null);
    } catch {
      /* noop */
    } finally {
      setSearchLoading(false);
    }
  };

  const searchInmovilla = async () => {
    if (!searchTelefono && !searchEmail) return;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ source: "inmovilla" });
      if (searchTelefono) params.set("telefono", searchTelefono);
      if (searchEmail) params.set("email", searchEmail);
      const res = await fetch(`/api/operaciones/${operacion.id}/buscar-comprador?${params}`);
      const data = await res.json();
      setInmovillaResults(data.clientes ?? []);
    } catch {
      /* noop */
    } finally {
      setSearchLoading(false);
    }
  };

  const importarCliente = async (cod_cli: number | string) => {
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/operaciones/${operacion.id}/importar-comprador`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_cli: Number(cod_cli) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al importar");
      setSelectedBuyerClientId(String(cod_cli));
      setStep("confirmar");
    } catch {
      /* noop */
    } finally {
      setSearchLoading(false);
    }
  };

  const selectDemand = async (demandCodigo: string) => {
    try {
      await fetch(`/api/operaciones/${operacion.id}/asociar-comprador`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId: demandCodigo }),
      });
      setSelectedDemandId(demandCodigo);
      setStep("confirmar");
    } catch {
      /* noop */
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = { tipoCierre };
      if (selectedDemandId) body.demandId = selectedDemandId;
      if (selectedBuyerClientId) body.buyerClientId = selectedBuyerClientId;

      const res = await fetch(`/api/operaciones/${operacion.id}/cerrar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> Cerrar operación {operacion.codigo}
          </DialogTitle>
          <DialogDescription>
            {step === "tipo" && "Selecciona el tipo de cierre."}
            {step === "comprador" && "Busca y asocia un comprador (opcional)."}
            {step === "confirmar" && "Confirma el cierre de la operación."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {/* Step 1: Tipo de cierre */}
          {step === "tipo" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo de cierre</label>
                <select
                  value={tipoCierre}
                  onChange={(e) => setTipoCierre(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="CERRADA_VENTA">Venta</option>
                  <option value="CERRADA_ALQUILER">Alquiler</option>
                  <option value="CERRADA_TRASPASO">Traspaso</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button size="sm" onClick={() => setStep("comprador")}>Siguiente</Button>
              </div>
            </>
          )}

          {/* Step 2: Buscar comprador */}
          {step === "comprador" && (
            <>
              <div className="flex gap-2 mb-2">
                <Button
                  variant={searchMode === "local" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchMode("local")}
                >
                  Demandas locales
                </Button>
                <Button
                  variant={searchMode === "inmovilla" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchMode("inmovilla")}
                >
                  Inmovilla
                </Button>
              </div>

              {searchMode === "local" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre..."
                      className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                    <Button size="sm" onClick={searchLocal} disabled={searchLoading} className="gap-1">
                      <Search className="h-3.5 w-3.5" /> Buscar
                    </Button>
                  </div>

                  {suggestedDemand && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                      <span className="font-medium">Sugerencia:</span> {suggestedDemand.nombre} ({suggestedDemand.codigo})
                      <Button variant="outline" size="sm" className="ml-2 h-6 text-xs" onClick={() => selectDemand(suggestedDemand.codigo)}>
                        <UserPlus className="h-3 w-3 mr-1" /> Seleccionar
                      </Button>
                    </div>
                  )}

                  {searchLoading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Buscando...</p>}

                  {localResults.map((d) => (
                    <div key={d.codigo} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium">{d.nombre || "Sin nombre"}</span>
                        <span className="text-muted-foreground ml-2">{d.codigo}</span>
                        {d.telefono && <span className="text-muted-foreground ml-2">{d.telefono}</span>}
                        <Badge variant="outline" className="ml-2">{d.leadStatus}</Badge>
                      </div>
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => selectDemand(d.codigo)}>
                        Seleccionar
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {searchMode === "inmovilla" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={searchTelefono}
                      onChange={(e) => setSearchTelefono(e.target.value)}
                      placeholder="Teléfono"
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      placeholder="Email"
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <Button size="sm" onClick={searchInmovilla} disabled={searchLoading} className="gap-1">
                    <Search className="h-3.5 w-3.5" /> Buscar en Inmovilla
                  </Button>

                  {searchLoading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Buscando...</p>}

                  {inmovillaResults.map((c) => (
                    <div key={String(c.cod_cli)} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium">{[c.nombre, c.apellidos].filter(Boolean).join(" ") || "Sin nombre"}</span>
                        <span className="text-muted-foreground ml-2">#{c.cod_cli}</span>
                        {c.nif && <span className="text-muted-foreground ml-2">{c.nif}</span>}
                      </div>
                      <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => importarCliente(c.cod_cli)}>
                        <Download className="h-3 w-3" /> Importar
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("tipo")}>Atrás</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("confirmar")}>
                    Cerrar sin comprador
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Confirmar */}
          {step === "confirmar" && (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">
                    {tipoCierre === "CERRADA_VENTA" ? "Venta" : tipoCierre === "CERRADA_ALQUILER" ? "Alquiler" : "Traspaso"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comprador</span>
                  <span>
                    {selectedDemandId ? `Demanda ${selectedDemandId}` : selectedBuyerClientId ? `Cliente #${selectedBuyerClientId}` : "Sin comprador"}
                  </span>
                </div>
                {!selectedDemandId && !selectedBuyerClientId && (
                  <p className="text-xs text-urus-warning">
                    Advertencia: se cerrará sin comprador asociado. La baja de demanda y el keycli en Inmovilla no se ejecutarán.
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep("comprador")}>Atrás</Button>
                <Button size="sm" onClick={handleClose} disabled={submitting} className="gap-1.5">
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  {submitting ? "Cerrando..." : "Confirmar cierre"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
