"use client";

import { useMemo, useState } from "react";
import { Phone, Search, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GlobalDemandOption } from "@/components/demands/global-demand-selector";

type GlobalDemandListPickerProps = {
  demands: GlobalDemandOption[];
  value: string;
  onChange: (demandId: string) => void;
  disabled?: boolean;
  className?: string;
};

function formatDemandCreatedAt(iso: string | undefined): string {
  if (!iso) return "Sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function GlobalDemandListPicker({
  demands,
  value,
  onChange,
  disabled,
  className,
}: GlobalDemandListPickerProps) {
  const [query, setQuery] = useState("");

  const filteredDemands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return demands;
    return demands.filter((demand) =>
      [demand.codigo, demand.nombre, demand.telefono, formatDemandCreatedAt(demand.createdAt)].some(
        (field) => field?.toLowerCase().includes(normalized),
      ),
    );
  }, [demands, query]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, teléfono o código..."
          className="pl-9"
          disabled={disabled}
        />
      </div>

      <ScrollArea className="h-[min(280px,42vh)] rounded-lg border border-border/60 bg-background">
        <div className="p-1.5">
          {filteredDemands.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {demands.length === 0 ? "No hay demandas disponibles" : "Sin resultados para la búsqueda"}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredDemands.map((demand) => {
                const isSelected = demand.codigo === value;
                return (
                  <li key={demand.codigo}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(demand.codigo)}
                      className={cn(
                        "flex w-full gap-3 rounded-md p-3 text-left transition-colors",
                        isSelected
                          ? "bg-primary/5 ring-1 ring-primary/25"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border/60 bg-muted/40 text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        <User className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {demand.nombre || demand.codigo}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground"
                            title="Fecha de alta de la demanda"
                          >
                            Alta {formatDemandCreatedAt(demand.createdAt)}
                          </Badge>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {demand.leadStatus}
                          </Badge>
                        </span>
                        <span
                          className={cn(
                            "mt-1.5 flex items-center gap-1.5 text-xs",
                            demand.telefono ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          <Phone className="size-3.5 shrink-0" />
                          {demand.telefono || "Sin teléfono"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>

      {demands.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {filteredDemands.length} de {demands.length} demanda{demands.length === 1 ? "" : "s"}
          {query.trim() ? " (filtradas)" : ""}
        </p>
      ) : null}
    </div>
  );
}
