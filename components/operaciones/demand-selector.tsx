"use client";

import * as React from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, Phone, Banknote } from "lucide-react";

export interface DemandOption {
  codigo: string;
  ref: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
  zonas: string;
  tipos: string;
  presupuestoMin: number;
  presupuestoMax: number;
}

interface DemandSelectorProps {
  value: DemandOption | null;
  onChange: (demand: DemandOption | null) => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}

function fmtBudget(min: number, max: number): string {
  if (min <= 0 && max <= 0) return "";
  const fmt = (n: number) => new Intl.NumberFormat("es-ES").format(n) + " €";
  if (min > 0 && max > 0) return `${fmt(min)} – ${fmt(max)}`;
  if (max > 0) return `hasta ${fmt(max)}`;
  return `desde ${fmt(min)}`;
}

const STATUS_LABELS: Record<string, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  EN_SELECCION: "En selección",
  VISITA_PENDIENTE: "Visita pendiente",
  VISITA_CONFIRMADA: "Visita confirmada",
  VISITA_REALIZADA: "Visita realizada",
  EN_NEGOCIACION: "En negociación",
  EN_FIRMA: "En firma",
};

export function DemandPreviewCard({ demand }: { demand: DemandOption }) {
  const budget = fmtBudget(demand.presupuestoMin, demand.presupuestoMax);
  return (
    <div className="flex gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="h-5 w-5 text-muted-foreground/60" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {demand.nombre || "Sin nombre"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{demand.codigo}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            {STATUS_LABELS[demand.leadStatus] ?? demand.leadStatus}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {demand.zonas && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {demand.zonas}
            </span>
          )}
          {demand.telefono && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> {demand.telefono}
            </span>
          )}
          {budget && (
            <span className="inline-flex items-center gap-1">
              <Banknote className="h-3 w-3" /> {budget}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function DemandSelector({
  value,
  onChange,
  portalContainer,
}: DemandSelectorProps) {
  const [options, setOptions] = React.useState<DemandOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOptions = React.useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/operaciones/buscar-demandas?q=${encodeURIComponent(query)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setOptions(data.demands ?? []);
      }
    } catch {
      /* keep previous options */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchOptions("");
  }, [fetchOptions]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = React.useCallback((inputValue: unknown) => {
    const q = typeof inputValue === "string" ? inputValue : "";
    const normalizedQuery = q.length >= 2 ? q : "";

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      await fetchOptions(normalizedQuery);
    }, 300);
  }, [fetchOptions]);

  const handleValueChange = React.useCallback(
    (val: unknown) => {
      if (val === null || val === undefined) {
        onChange(null);
        return;
      }
      const code = typeof val === "string" ? val : String(val);
      const match = options.find((o) => o.codigo === code);
      onChange(match ?? null);
    },
    [options, onChange],
  );

  return (
    <div className="space-y-3">
      <Combobox
        value={value?.codigo ?? null}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputChange}
      >
        <ComboboxInput
          className="w-full min-h-11 text-base"
          placeholder="Buscar por nombre, referencia o código…"
          showClear={!!value}
        />
        <ComboboxContent
          container={portalContainer}
          className="!w-[min(100%,min(var(--anchor-width),36rem))] !min-w-[min(100%,var(--anchor-width))] max-w-[min(100vw-1.5rem,36rem)]"
        >
          <ComboboxList className="max-h-[min(20rem,calc(var(--available-height)-1rem))] scroll-py-2 p-2">
            <ComboboxEmpty>
              {loading ? "Buscando…" : "Sin resultados"}
            </ComboboxEmpty>
            {options.map((d) => {
              const budget = fmtBudget(d.presupuestoMin, d.presupuestoMax);
              return (
                <ComboboxItem
                  key={d.codigo}
                  value={d.codigo}
                  className="items-start gap-3 py-2.5 pr-10"
                >
                  <div className="flex w-full items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                      <User className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {d.nombre || "Sin nombre"}
                        </p>
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                          {STATUS_LABELS[d.leadStatus] ?? d.leadStatus}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {d.codigo}
                        {d.ref && d.ref !== d.codigo ? ` · ${d.ref}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {d.zonas && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{d.zonas}</span>
                          </span>
                        )}
                        {budget && (
                          <span className="inline-flex items-center gap-1">
                            <Banknote className="h-3 w-3 shrink-0" />
                            {budget}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </ComboboxItem>
              );
            })}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {value && <DemandPreviewCard demand={value} />}
    </div>
  );
}
