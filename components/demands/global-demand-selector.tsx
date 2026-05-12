"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Phone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export type GlobalDemandOption = {
  codigo: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
};

type GlobalDemandSelectorProps = {
  demands: GlobalDemandOption[];
  value: string;
  onChange: (demandId: string) => void;
  onSearch?: (query: string) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
};

export function GlobalDemandSelector({
  demands,
  value,
  onChange,
  onSearch,
  disabled,
  className,
}: GlobalDemandSelectorProps) {
  const selected = demands.find((demand) => demand.codigo === value) ?? null;
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredDemands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return demands;
    return demands.filter((demand) =>
      [
        demand.codigo,
        demand.nombre,
        demand.telefono,
      ].some((val) => val?.toLowerCase().includes(normalized)),
    );
  }, [demands, query]);

  const handleInputChange = useCallback((inputValue: unknown) => {
    const next = typeof inputValue === "string" ? inputValue : "";
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const normalized = next.length >= 2 ? next : "";
      setQuery(normalized);
      void onSearch?.(normalized);
    }, 300);
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleValueChange = useCallback((nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined) {
      onChange("");
      return;
    }
    onChange(typeof nextValue === "string" ? nextValue : String(nextValue));
  }, [onChange]);

  return (
    <div className={cn("space-y-3", className)}>
      <Combobox
        value={value || null}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputChange}
      >
        <ComboboxInput
          className="min-h-11 w-full border-border/55 bg-background/70 text-base"
          placeholder="Buscar por nombre, teléfono o código..."
          disabled={disabled}
          showClear={!!value}
        />
        <ComboboxContent className="!w-[min(100%,min(var(--anchor-width),46rem))] !min-w-[min(100%,var(--anchor-width))] max-w-[min(100vw-1.5rem,46rem)] border-border/60 bg-popover/95 shadow-xl shadow-background/30">
          <ComboboxList className="max-h-[min(28rem,calc(var(--available-height)-1rem))] scroll-py-2 p-2">
            <ComboboxEmpty>
              {demands.length === 0 ? "No hay demandas disponibles" : "Sin resultados"}
            </ComboboxEmpty>
            {filteredDemands.map((demand) => (
              <ComboboxItem
                key={demand.codigo}
                value={demand.codigo}
                className="items-start gap-4 py-3 pr-10"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-medium">
                      {demand.nombre || demand.codigo}
                    </p>
                    <Badge variant="outline" className="shrink-0 px-2 py-0.5 text-xs">
                      {demand.codigo}
                    </Badge>
                    <Badge variant="secondary" className="shrink-0 px-2 py-0.5 text-xs">
                      {demand.leadStatus}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("inline-flex items-center gap-1", demand.telefono ? "text-muted-foreground" : "text-urus-warning")}>
                      <Phone className="h-3.5 w-3.5" />
                      {demand.telefono || "Sin teléfono"}
                    </span>
                  </div>
                </div>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {selected ? (
        <div className="rounded-xl border border-border/45 bg-muted/10 p-3">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{selected.nombre || selected.codigo}</p>
                <Badge variant="outline">{selected.codigo}</Badge>
                <Badge variant="secondary">{selected.leadStatus}</Badge>
              </div>
              <p className={cn("mt-1 flex items-center gap-1 text-sm", !selected.telefono ? "text-urus-warning" : "text-muted-foreground")}>
                <Phone className="h-4 w-4" />
                {selected.telefono || "Teléfono no disponible"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/45 bg-muted/10 p-3 text-sm text-muted-foreground">
          <UserRound className="h-4 w-4" />
          Selecciona una demanda.
        </div>
      )}
    </div>
  );
}
