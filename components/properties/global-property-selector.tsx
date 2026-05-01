"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BedDouble, Home, ImageOff, MapPin, Phone, Ruler, UserRound } from "lucide-react";
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

export type GlobalPropertyOption = {
  codigo: string;
  ref: string;
  refCatastral?: string | null;
  titulo: string;
  ciudad: string;
  zona: string;
  precio: number;
  habitaciones: number;
  metrosConstruidos: number;
  mainPhotoUrl: string | null;
  portalUrl?: string | null;
  propietarioNombre: string | null;
  propietarioPhone: string | null;
};

type GlobalPropertySelectorProps = {
  properties: GlobalPropertyOption[];
  value: string;
  onChange: (propertyId: string) => void;
  onSearch?: (query: string) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
};

function formatMoney(value: number): string {
  if (!value) return "Precio no disponible";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function PropertyImage({ property }: { property: GlobalPropertyOption }) {
  if (!property.mainPhotoUrl) {
    return (
      <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-5 w-5 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <Image
      src={property.mainPhotoUrl}
      alt={property.titulo || property.ref || property.codigo}
      width={112}
      height={80}
      className="h-20 w-28 shrink-0 rounded-lg object-cover"
      unoptimized
    />
  );
}

function PropertyThumb({ property }: { property: GlobalPropertyOption }) {
  const [errored, setErrored] = useState(false);

  if (!property.mainPhotoUrl || errored) {
    return (
      <div className="flex h-[5.5rem] w-[7rem] shrink-0 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-5 w-5 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <Image
      src={property.mainPhotoUrl}
      alt={property.titulo || property.ref || property.codigo}
      width={112}
      height={88}
      className="h-[5.5rem] w-[7rem] shrink-0 rounded-lg object-cover"
      onError={() => setErrored(true)}
      unoptimized
    />
  );
}

export function GlobalPropertySelector({
  properties,
  value,
  onChange,
  onSearch,
  disabled,
  className,
}: GlobalPropertySelectorProps) {
  const selected = properties.find((property) => property.codigo === value) ?? null;
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredProperties = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return properties;
    return properties.filter((property) =>
      [
        property.codigo,
        property.ref,
        property.titulo,
        property.zona,
        property.ciudad,
        property.propietarioNombre ?? "",
        property.propietarioPhone ?? "",
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [properties, query]);

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
          placeholder="Buscar por ref, título, zona o propietario..."
          disabled={disabled}
          showClear={!!value}
        />
        <ComboboxContent className="!w-[min(100%,min(var(--anchor-width),46rem))] !min-w-[min(100%,var(--anchor-width))] max-w-[min(100vw-1.5rem,46rem)] border-border/60 bg-popover/95 shadow-xl shadow-background/30">
          <ComboboxList className="max-h-[min(28rem,calc(var(--available-height)-1rem))] scroll-py-2 p-2">
            <ComboboxEmpty>
              {properties.length === 0 ? "No hay propiedades disponibles" : "Sin resultados"}
            </ComboboxEmpty>
            {filteredProperties.map((property) => (
              <ComboboxItem
                key={property.codigo}
                value={property.codigo}
                className="items-start gap-4 py-3 pr-10"
              >
                <div className="flex w-full items-start gap-4">
                  <PropertyThumb property={property} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-medium">
                        {property.titulo || property.ref || property.codigo}
                      </p>
                      <Badge variant="outline" className="shrink-0 px-2 py-0.5 text-xs">
                        {property.ref || property.codigo}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {[property.zona, property.ciudad].filter(Boolean).join(", ") || "Sin zona"}
                        </span>
                      </span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatMoney(property.precio)}
                      </span>
                      {property.habitaciones > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <BedDouble className="h-3.5 w-3.5" />
                          {property.habitaciones} hab.
                        </span>
                      ) : null}
                      {property.metrosConstruidos > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Ruler className="h-3.5 w-3.5" />
                          {property.metrosConstruidos} m2
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <UserRound className="h-3.5 w-3.5" />
                        {property.propietarioNombre || "Propietario sin nombre"}
                      </span>
                      <span className={cn("inline-flex items-center gap-1", property.propietarioPhone ? "text-muted-foreground" : "text-urus-warning")}>
                        <Phone className="h-3.5 w-3.5" />
                        {property.propietarioPhone || "Sin teléfono"}
                      </span>
                    </div>
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
            <PropertyImage property={selected} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{selected.titulo || selected.ref}</p>
                <Badge variant="outline">{selected.ref || selected.codigo}</Badge>
              </div>
              <p className="font-mono text-sm font-semibold">{formatMoney(selected.precio)}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[selected.zona, selected.ciudad].filter(Boolean).join(", ") || "Sin zona"}
                </span>
                {selected.habitaciones > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <BedDouble className="h-3 w-3" />
                    {selected.habitaciones} hab.
                  </span>
                ) : null}
                {selected.metrosConstruidos > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="h-3 w-3" />
                    {selected.metrosConstruidos} m2
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border/40 bg-background/50 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <UserRound className="h-4 w-4" />
              Propietario
            </div>
            <p>{selected.propietarioNombre || "Nombre no disponible"}</p>
            <p className={cn("mt-1 flex items-center gap-1 text-muted-foreground", !selected.propietarioPhone && "text-urus-warning")}>
              <Phone className="h-3.5 w-3.5" />
              {selected.propietarioPhone || "Telefono no disponible"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/45 bg-muted/10 p-3 text-sm text-muted-foreground">
          <Home className="h-4 w-4" />
          Selecciona una propiedad.
        </div>
      )}
    </div>
  );
}
