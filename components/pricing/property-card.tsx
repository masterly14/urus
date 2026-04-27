"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Ruler,
  BedDouble,
  ArrowRight,
  Tag,
  Bath,
  ImageOff,
  ExternalLink,
  UserRound,
  Phone,
  IdCard,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PropertyListItem } from "@/app/platform/pricing/page";

interface PropertyCardProps {
  property: PropertyListItem;
  className?: string;
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function isEligibleForSmartPricing(property: PropertyListItem): boolean {
  const ciudad = property.ciudad?.trim() ?? "";
  const zona = property.zona?.trim() ?? "";
  if (!ciudad || !zona) return false;
  return normalizeForComparison(ciudad).includes("cordoba");
}

function getPortalLabel(portalName?: string | null): string {
  if (!portalName) return "Ver anuncio";
  const n = portalName.toLowerCase();
  if (n.includes("idealista")) return "Ver en Idealista";
  if (n.includes("fotocasa")) return "Ver en Fotocasa";
  if (n.includes("pisos")) return "Ver en Pisos.com";
  if (n.includes("habitaclia")) return "Ver en Habitaclia";
  return `Ver en ${portalName}`;
}

function getPortalOverlayClass(portalName?: string | null): string {
  const n = (portalName ?? "").toLowerCase();
  if (n.includes("idealista"))
    return "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-white/35 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-900 hover:border-white/50";
  if (n.includes("fotocasa"))
    return "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-[#0065EB]/60 bg-[#0065EB]/15 px-2.5 py-1 text-xs font-semibold text-[#0065EB] backdrop-blur transition-colors hover:bg-[#0065EB]/25";
  return "absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur transition-colors hover:bg-secondary/20 hover:text-secondary";
}

function PropertyImage({ property }: { property: PropertyListItem }) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(property.mainPhotoUrl) && !errored;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted/60 via-background to-muted/30">
      {showImage ? (
        <Image
          src={property.mainPhotoUrl as string}
          alt={property.titulo || property.ref || property.codigo}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-contain transition-transform duration-500"
          onError={() => setErrored(true)}
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground/60">
          <ImageOff className="h-6 w-6" />
          <span className="text-[10px] uppercase tracking-wider">
            Sin imagen sincronizada
          </span>
          {property.numFotos > 0 && (
            <span className="text-[9px] text-muted-foreground/50">
              {property.numFotos} fotos en Inmovilla
            </span>
          )}
        </div>
      )}

      {property.estado && (
        <div className="pointer-events-none absolute left-3 top-3">
          <Badge
            variant="outline"
            className="border-border/50 bg-background/90 px-2 py-0.5 text-xs font-medium backdrop-blur"
            style={{
              borderColor:
                property.estado === "Reservado"
                  ? "var(--urus-success)"
                  : undefined,
              color:
                property.estado === "Reservado"
                  ? "var(--urus-success)"
                  : undefined,
            }}
          >
            {property.estado}
          </Badge>
        </div>
      )}

      {property.portalUrl && (
        <a
          href={property.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            getPortalOverlayClass(property.portalName),
            "pointer-events-auto",
          )}
          title={getPortalLabel(property.portalName)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {getPortalLabel(property.portalName)}
        </a>
      )}
    </div>
  );
}

export function PropertyCard({ property, className }: PropertyCardProps) {
  const priceM2 =
    property.metrosConstruidos > 0
      ? Math.round(property.precio / property.metrosConstruidos)
      : 0;
  const isEligible = isEligibleForSmartPricing(property);
  const ownerName = property.propietarioNombre?.trim() || "Sin propietario";
  const ownerDni = property.propietarioDni?.trim() || "Sin DNI";
  const ownerPhone = property.propietarioPhone?.trim() || "Sin teléfono";
  const ownerAddress =
    property.propietarioDomicilioFiscal?.trim() || "Sin domicilio fiscal";

  const content = (
    <Card
      className={cn(
        "overflow-hidden rounded-lg border-border/50 py-0 transition-all duration-300",
        isEligible
          ? "pointer-events-none cursor-pointer group-hover:border-border/80 group-hover:bg-card group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-elevated)]"
          : "cursor-not-allowed opacity-70",
        className,
      )}
    >
      <PropertyImage property={property} />

      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="truncate text-base font-semibold leading-tight">
                {property.titulo || property.ref || property.codigo}
              </p>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {property.codigo}
              {property.ref && property.ref !== property.codigo
                ? ` · ${property.ref}`
                : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-xl font-bold leading-tight">
              {property.precio.toLocaleString("es-ES")} €
            </p>
            {priceM2 > 0 && (
              <p className="text-xs text-muted-foreground">
                {priceM2.toLocaleString("es-ES")} €/m²
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {property.zona || property.ciudad}
            </span>
          </span>
          {property.metrosConstruidos > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {property.metrosConstruidos} m²
              </span>
            </span>
          )}
          {property.habitaciones > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{property.habitaciones}</span>
              <span className="text-xs text-muted-foreground">hab</span>
            </span>
          )}
          {property.banyos > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{property.banyos}</span>
              <span className="text-xs text-muted-foreground">baños</span>
            </span>
          )}
        </div>

        <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/20 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Propietario
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            {ownerName}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <IdCard className="h-3.5 w-3.5" />
              {ownerDni}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {ownerPhone}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground" title={ownerAddress}>
            {ownerAddress}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
          <span className="truncate text-xs text-muted-foreground">
            {property.agente || property.ciudad}
          </span>
          {isEligible ? (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-secondary opacity-0 transition-opacity group-hover:opacity-100">
              Ver informe <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Badge
              variant="outline"
              className="shrink-0 border-[var(--urus-warning)]/40 px-2 py-0.5 text-[10px] text-[var(--urus-warning)]"
            >
              No elegible
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!isEligible) return content;

  const informeHref = `/platform/pricing/informe/${property.codigo}`;
  const informeLabel = `Ver informe: ${property.titulo || property.ref || property.codigo}`;

  return (
    <div className="group relative">
      <Link
        href={informeHref}
        className="absolute inset-0 z-[1] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={informeLabel}
      />
      <div className="relative z-[2] pointer-events-none">{content}</div>
    </div>
  );
}
