"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { BedDouble, Home, MapPin, Phone, Ruler, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GlobalPropertyOption } from "@/components/properties/global-property-selector";

type GlobalPropertyListPickerProps = {
  properties: GlobalPropertyOption[];
  value: string;
  onChange: (propertyId: string) => void;
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

function PropertyListAvatar({
  property,
  isSelected,
}: {
  property: GlobalPropertyOption;
  isSelected: boolean;
}) {
  const [imageError, setImageError] = useState(false);

  const frameClass = cn(
    "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
    isSelected
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border/60 bg-muted/40 text-muted-foreground",
  );

  if (property.mainPhotoUrl && !imageError) {
    return (
      <span className={cn(frameClass, "p-0")} aria-hidden>
        <Image
          src={property.mainPhotoUrl}
          alt=""
          width={56}
          height={56}
          className="size-full object-cover"
          onError={() => setImageError(true)}
          unoptimized
        />
      </span>
    );
  }

  return (
    <span className={frameClass} aria-hidden>
      <Home className="size-6" />
    </span>
  );
}

export function GlobalPropertyListPicker({
  properties,
  value,
  onChange,
  disabled,
  className,
}: GlobalPropertyListPickerProps) {
  const [query, setQuery] = useState("");

  const filteredProperties = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return properties;
    return properties.filter((property) =>
      [
        property.codigo,
        property.ref,
        property.titulo,
        property.zona,
        property.ciudad,
        property.propietarioNombre ?? "",
        property.propietarioPhone ?? "",
      ].some((field) => field.toLowerCase().includes(normalized)),
    );
  }, [properties, query]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por ref, título, zona o propietario..."
          className="pl-9"
          disabled={disabled}
        />
      </div>

      <ScrollArea className="h-[min(280px,42vh)] rounded-lg border border-border/60 bg-background">
        <div className="p-1.5">
          {filteredProperties.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {properties.length === 0
                ? "No hay propiedades disponibles"
                : "Sin resultados para la búsqueda"}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredProperties.map((property) => {
                const isSelected = property.codigo === value;
                return (
                  <li key={property.codigo}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(property.codigo)}
                      className={cn(
                        "flex w-full gap-3 rounded-md p-3 text-left transition-colors",
                        isSelected
                          ? "bg-primary/5 ring-1 ring-primary/25"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <PropertyListAvatar property={property} isSelected={isSelected} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {property.titulo || property.ref || property.codigo}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {property.ref || property.codigo}
                          </Badge>
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="truncate">
                              {[property.zona, property.ciudad].filter(Boolean).join(", ") ||
                                "Sin zona"}
                            </span>
                          </span>
                          <span className="font-medium text-foreground">
                            {formatMoney(property.precio)}
                          </span>
                          {property.habitaciones > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <BedDouble className="size-3.5" />
                              {property.habitaciones} hab.
                            </span>
                          ) : null}
                          {property.metrosConstruidos > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Ruler className="size-3.5" />
                              {property.metrosConstruidos} m²
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "mt-1 flex items-center gap-1.5 text-xs",
                            property.propietarioPhone
                              ? "text-muted-foreground"
                              : "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          <Phone className="size-3.5 shrink-0" />
                          {property.propietarioPhone || "Sin teléfono propietario"}
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

      {properties.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {filteredProperties.length} de {properties.length} propiedad
          {properties.length === 1 ? "" : "es"}
          {query.trim() ? " (filtradas)" : ""}
        </p>
      ) : null}
    </div>
  );
}
