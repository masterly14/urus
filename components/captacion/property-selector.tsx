"use client";

import * as React from "react";
import Image from "next/image";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  MapPin,
  BedDouble,
  Bath,
  Ruler,
  ImageOff,
} from "lucide-react";

export interface PropertyOption {
  codigo: string;
  ref: string;
  titulo: string;
  mainPhotoUrl: string | null;
  ciudad: string;
  zona: string;
  precio: number;
  tipoOfer: string;
  habitaciones: number;
  banyos: number;
  metrosConstruidos: number;
}

interface PropertySelectorProps {
  value: PropertyOption | null;
  onChange: (property: PropertyOption | null) => void;
  /**
   * Opcional: contenedor DOM donde se renderiza el portal del dropdown.
   * Útil cuando el selector vive dentro de un Sheet/Dialog con focus trap
   * (por defecto el portal se monta en `document.body` y queda bloqueado).
   */
  portalContainer?: React.RefObject<HTMLElement | null>;
}

function fmtPrice(precio: number) {
  return new Intl.NumberFormat("es-ES").format(precio) + " \u20AC";
}

function PropertyThumb({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = React.useState(false);

  if (!src || errored) {
    return (
      <div className="flex h-[7.5rem] w-[9.5rem] shrink-0 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-6 w-6 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={152}
      height={120}
      className="h-[7.5rem] w-[9.5rem] shrink-0 rounded-lg object-cover"
      onError={() => setErrored(true)}
      unoptimized
    />
  );
}

export function PropertyPreviewCard({ property }: { property: PropertyOption }) {
  return (
    <div className="flex gap-4 rounded-lg border border-border/50 bg-muted/30 p-4">
      <div className="relative h-36 w-48 shrink-0 overflow-hidden rounded-lg bg-muted">
        {property.mainPhotoUrl ? (
          <Image
            src={property.mainPhotoUrl}
            alt={property.ref}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Home className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">
              {property.titulo || property.tipoOfer}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {property.ref}
            </p>
          </div>
          <p className="shrink-0 font-mono text-base font-bold">
            {fmtPrice(property.precio)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {[property.zona, property.ciudad].filter(Boolean).join(", ")}
          </span>
          {property.metrosConstruidos > 0 && (
            <span className="inline-flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              {property.metrosConstruidos} m²
            </span>
          )}
          {property.habitaciones > 0 && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3 w-3" />
              {property.habitaciones} hab
            </span>
          )}
          {property.banyos > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bath className="h-3 w-3" />
              {property.banyos}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PropertySelector({
  value,
  onChange,
  portalContainer,
}: PropertySelectorProps) {
  const [options, setOptions] = React.useState<PropertyOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchOptions = React.useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/captacion/properties?q=${encodeURIComponent(query)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setOptions(data.properties ?? []);
      }
    } catch {
      /* network error — keep previous options */
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
    <div className="space-y-4">
      <Combobox
        value={value?.codigo ?? null}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputChange}
      >
        <ComboboxInput
          className="w-full min-h-11 text-base"
          placeholder="Buscar por ref, dirección o zona…"
          showClear={!!value}
        />
        <ComboboxContent
          container={portalContainer}
          className="!w-[min(100%,min(var(--anchor-width),42rem))] !min-w-[min(100%,var(--anchor-width))] max-w-[min(100vw-1.5rem,42rem)]"
        >
          <ComboboxList className="max-h-[min(24rem,calc(var(--available-height)-1rem))] scroll-py-2 p-2">
            <ComboboxEmpty>
              {loading ? "Buscando…" : "Sin resultados"}
            </ComboboxEmpty>
            {options.map((p) => (
              <ComboboxItem
                key={p.codigo}
                value={p.codigo}
                className="items-start gap-4 py-3 pr-10"
              >
                <div className="flex w-full items-start gap-4">
                  <PropertyThumb src={p.mainPhotoUrl} alt={p.ref} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-medium">
                        {p.ref}
                      </p>
                      <Badge
                        variant="outline"
                        className="shrink-0 px-2 py-0.5 text-xs"
                      >
                        {p.tipoOfer}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {p.titulo}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {[p.zona, p.ciudad].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {fmtPrice(p.precio)}
                      </span>
                    </div>
                  </div>
                </div>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {value && <PropertyPreviewCard property={value} />}
    </div>
  );
}
