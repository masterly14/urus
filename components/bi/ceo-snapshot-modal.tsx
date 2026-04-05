"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/hooks/use-session";
import type { SnapshotPeriodStatus } from "@/lib/dashboard/ceo/types";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SnapshotFormValues {
  ebitdaEur: string;
  operatingCostEur: string;
  cashAvailableEur: string;
  fixedCostsEur: string;
  variableCostsEur: string;
  reinvestmentCapacity: string;
}

const EMPTY_FORM: SnapshotFormValues = {
  ebitdaEur: "",
  operatingCostEur: "",
  cashAvailableEur: "",
  fixedCostsEur: "",
  variableCostsEur: "",
  reinvestmentCapacity: "",
};

interface ExistingSnapshot {
  ebitdaEur: number;
  operatingCostEur: number;
  cashAvailableEur: number;
  fixedCostsEur: number;
  variableCostsEur: number;
  reinvestmentCapacity: number;
}

export interface CeoSnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Periodos disponibles para seleccionar en el formulario */
  periods: SnapshotPeriodStatus[];
  /** Periodo pre-seleccionado al abrir */
  defaultPeriod?: string;
  /** Se llama tras guardar con éxito */
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numericValue(raw: string): number {
  const parsed = parseFloat(raw.replace(",", "."));
  return isNaN(parsed) ? 0 : parsed;
}

function formFromSnapshot(s: ExistingSnapshot): SnapshotFormValues {
  return {
    ebitdaEur: s.ebitdaEur === 0 ? "" : String(s.ebitdaEur),
    operatingCostEur: s.operatingCostEur === 0 ? "" : String(s.operatingCostEur),
    cashAvailableEur: s.cashAvailableEur === 0 ? "" : String(s.cashAvailableEur),
    fixedCostsEur: s.fixedCostsEur === 0 ? "" : String(s.fixedCostsEur),
    variableCostsEur: s.variableCostsEur === 0 ? "" : String(s.variableCostsEur),
    reinvestmentCapacity:
      s.reinvestmentCapacity === 0 ? "" : String(s.reinvestmentCapacity),
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function CeoSnapshotModal({
  open,
  onOpenChange,
  periods,
  defaultPeriod,
  onSuccess,
}: CeoSnapshotModalProps) {
  const { sessionHeaders } = useSession();

  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    defaultPeriod ?? periods[0]?.period ?? "",
  );
  const [form, setForm] = useState<SnapshotFormValues>(EMPTY_FORM);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cuando cambia el periodo seleccionado, carga los datos existentes
  const loadPeriodData = useCallback(
    async (period: string) => {
      if (!period) return;
      setLoadingData(true);
      setSaveError(null);
      try {
        const res = await fetch(`/api/ceo/snapshot?period=${period}`, {
          headers: sessionHeaders as Record<string, string>,
        });
        if (!res.ok) return;
        const json = await res.json() as { snapshot: ExistingSnapshot | null };
        setForm(json.snapshot ? formFromSnapshot(json.snapshot) : EMPTY_FORM);
      } catch {
        // Si falla la carga, simplemente dejamos el form vacío
        setForm(EMPTY_FORM);
      } finally {
        setLoadingData(false);
      }
    },
    [sessionHeaders],
  );

  // Cargar datos cuando se abre el modal o cambia el periodo
  useEffect(() => {
    if (open && selectedPeriod) {
      void loadPeriodData(selectedPeriod);
    }
  }, [open, selectedPeriod, loadPeriodData]);

  // Sincronizar el periodo por defecto cuando cambien las props
  useEffect(() => {
    if (defaultPeriod) setSelectedPeriod(defaultPeriod);
  }, [defaultPeriod]);

  function handleField(field: keyof SnapshotFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!selectedPeriod) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        period: selectedPeriod,
        ebitdaEur: numericValue(form.ebitdaEur),
        operatingCostEur: numericValue(form.operatingCostEur),
        cashAvailableEur: numericValue(form.cashAvailableEur),
        fixedCostsEur: numericValue(form.fixedCostsEur),
        variableCostsEur: numericValue(form.variableCostsEur),
        reinvestmentCapacity: numericValue(form.reinvestmentCapacity),
      };

      const res = await fetch("/api/ceo/snapshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionHeaders as Record<string, string>),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const selectedPeriodInfo = periods.find((p) => p.period === selectedPeriod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Datos financieros del periodo</DialogTitle>
          <DialogDescription>
            Introduce los valores del corte mensual. Estos datos alimentan los
            KPIs, semáforos y análisis de IA del CEO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Selector de periodo */}
          {periods.length > 1 && (
            <div className="space-y-1.5">
              <Label>Periodo</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un periodo" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.period} value={p.period}>
                      {p.label}
                      {!p.hasData && (
                        <span className="ml-2 text-xs text-amber-600 font-medium">
                          · sin datos
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPeriodInfo && (
                <p className="text-xs text-muted-foreground">
                  {selectedPeriodInfo.hasData
                    ? "Este periodo ya tiene datos. Modifícalos si es necesario."
                    : "Este periodo no tiene datos aún."}
                </p>
              )}
            </div>
          )}

          {loadingData ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ebitda">EBITDA (€)</Label>
                <Input
                  id="ebitda"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.ebitdaEur}
                  onChange={handleField("ebitdaEur")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="opCost">Costes operativos (€)</Label>
                <Input
                  id="opCost"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.operatingCostEur}
                  onChange={handleField("operatingCostEur")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cash">Cash disponible (€)</Label>
                <Input
                  id="cash"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.cashAvailableEur}
                  onChange={handleField("cashAvailableEur")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fixed">Costes fijos (€)</Label>
                <Input
                  id="fixed"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.fixedCostsEur}
                  onChange={handleField("fixedCostsEur")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="variable">Costes variables (€)</Label>
                <Input
                  id="variable"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.variableCostsEur}
                  onChange={handleField("variableCostsEur")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reinversion">Cap. reinversión (€)</Label>
                <Input
                  id="reinversion"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.reinvestmentCapacity}
                  onChange={handleField("reinvestmentCapacity")}
                />
              </div>
            </div>
          )}

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-md">
              {saveError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingData || !selectedPeriod}>
            {saving ? "Guardando…" : "Guardar datos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
