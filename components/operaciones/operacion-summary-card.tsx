"use client";

import Image from "next/image";
import { MapPin, Ruler, BedDouble, Bath, Home, UserRound, Phone, IdCard, Euro, Mail, ImageOff, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { operacionEstadoFilterLabels } from "@/lib/postventa/pipeline-filter-options";

function displayValue(value: string | null | undefined, fallback = "Sin dato"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Sin precio";
  return `${Math.round(value).toLocaleString("es-ES")} €`;
}

function formatBudget(min: number, max: number): string {
  if (min > 0 && max > 0) return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  if (max > 0) return `Hasta ${formatCurrency(max)}`;
  if (min > 0) return `Desde ${formatCurrency(min)}`;
  return "Sin presupuesto";
}

function formatMeters(min: number | null, max: number | null): string {
  if (min && max) return `${min}-${max} m²`;
  if (min) return `Desde ${min} m²`;
  if (max) return `Hasta ${max} m²`;
  return "Sin metros definidos";
}

function portalLabel(portalName: string | null): string {
  return portalName ? `Ver en ${portalName}` : "Ver anuncio";
}

export function OperacionSummaryCard({ data }: { data: any }) {
  const property = data?.property ?? null;
  const demand = data?.demand ?? null;
  const comercial = data?.comercial ?? null;
  
  const propertyTitle =
    property?.titulo?.trim() ||
    property?.ref?.trim() ||
    (data ? `Propiedad ${data.propertyCode}` : "Propiedad");
    
  const propertyLocation = [property?.zona, property?.ciudad || data?.ciudad]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
    
  const ownerName = displayValue(property?.propietarioNombre, "Propietario sin identificar");
  const ownerPhone = displayValue(property?.propietarioPhone, "Sin teléfono");
  const ownerDni = displayValue(property?.propietarioDni, "Sin DNI");
  const ownerAddress = displayValue(property?.propietarioDomicilioFiscal, "Sin domicilio fiscal");

  return (
    <div className="space-y-5">
      {/* Resumen comercial */}
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <div className="relative aspect-[16/10] sm:aspect-[21/9] lg:aspect-[24/7] bg-muted/40 max-h-[300px]">
          {property?.mainPhotoUrl ? (
            <Image
              src={property.mainPhotoUrl}
              alt={propertyTitle}
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-7 w-7" />
              <span className="text-xs">
                {property?.numFotos ? `${property.numFotos} fotos en Inmovilla` : "Sin imagen sincronizada"}
              </span>
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge variant="secondary">
              {operacionEstadoFilterLabels[data.estado as keyof typeof operacionEstadoFilterLabels] ?? data.estado}
            </Badge>
            {property?.estado && <Badge variant="outline" className="bg-background/90">{property.estado}</Badge>}
          </div>
          {property?.portalUrl && (
            <a
              href={property.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur hover:bg-background"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {portalLabel(property.portalName)}
            </a>
          )}
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-tight">{propertyTitle}</h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {propertyLocation || "Ubicación sin sincronizar"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold">{formatCurrency(property?.precio ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {property?.ref ? `Ref. ${property.ref}` : `Ficha ${data.propertyCode}`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-border/40 p-2">
              <Ruler className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
              <p className="font-medium">{property?.metrosConstruidos ? `${property.metrosConstruidos} m²` : "Sin m²"}</p>
              <p className="text-[10px] text-muted-foreground">Superficie</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <BedDouble className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
              <p className="font-medium">{property?.habitaciones ? property.habitaciones : "Sin dato"}</p>
              <p className="text-[10px] text-muted-foreground">Habitaciones</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <Bath className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
              <p className="font-medium">{property?.banyos ? property.banyos : "Sin dato"}</p>
              <p className="text-[10px] text-muted-foreground">Baños</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <Home className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
              <p className="font-medium">{displayValue(property?.tipoOfer, "Sin tipo")}</p>
              <p className="text-[10px] text-muted-foreground">Tipología</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border/50 p-4 bg-card">
          <div className="flex items-center gap-2 font-medium">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            Propietario
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <p className="font-medium">{ownerName}</p>
              <p className="text-muted-foreground">{ownerAddress}</p>
            </div>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {ownerPhone}
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <IdCard className="h-3.5 w-3.5" />
              {ownerDni}
            </p>
            {data.sellerClientId && (
              <p className="text-[10px] text-muted-foreground">Cliente Inmovilla: {data.sellerClientId}</p>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border/50 p-4 bg-card">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Demanda / comprador
          </div>
          {demand ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{displayValue(demand.nombre, "Comprador sin nombre")}</p>
                  <p className="text-muted-foreground">{displayValue(demand.estadoNombre, demand.leadStatus)}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{demand.leadStatus}</Badge>
              </div>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {displayValue(demand.telefono, "Sin teléfono")}
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Euro className="h-3.5 w-3.5" />
                {formatBudget(demand.presupuestoMin, demand.presupuestoMax)}
              </p>
              <p className="text-muted-foreground">
                {displayValue(demand.zonas, "Sin zonas")} · {displayValue(demand.tipos, "Sin tipología")}
              </p>
              <p className="text-muted-foreground">
                {demand.habitacionesMin > 0 ? `${demand.habitacionesMin}+ hab.` : "Habitaciones sin definir"} · {formatMeters(demand.metrosMin, demand.metrosMax)}
              </p>
            </div>
          ) : (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>No hay demanda local asociada.</p>
              {data.demandId && <p>Ref. demanda: {data.demandId}</p>}
              {data.buyerClientId && <p>Cliente comprador: {data.buyerClientId}</p>}
            </div>
          )}
        </section>
      </div>

      <div className="rounded-xl border border-border/50 p-4 text-sm bg-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Gestión comercial</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Operación creada el {new Date(data.createdAt).toLocaleDateString("es-ES")}
              {data.closedAt ? ` · cerrada el ${new Date(data.closedAt).toLocaleDateString("es-ES")}` : ""}
            </p>
          </div>
          <Badge variant="secondary">{data.codigo}</Badge>
        </div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            {comercial?.nombre ?? data.comercialId ?? "Sin comercial"}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            {displayValue(comercial?.telefono, "Sin teléfono")}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            {displayValue(comercial?.email, "Sin email")}
          </p>
        </div>
      </div>
    </div>
  );
}
