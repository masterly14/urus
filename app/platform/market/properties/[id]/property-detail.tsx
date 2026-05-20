"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Phone,
  UserPlus,
  X,
  ZoomIn,
  Building,
  BedDouble,
  Bath,
  ArrowRight,
  Maximize2
} from "lucide-react";

interface PortalEntry {
  source: string;
  listingId: string;
  externalId: string;
  canonicalUrl: string;
  price: number | null;
  pricePerMeter: number | null;
  status: string;
  mainImageUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  listingReference: string | null;
}

interface PropertyClusterClient {
  propertyId: string;
  clustered: boolean;
  representativeListingId: string;
  housingType: string;
  operation: string;
  city: string;
  zone: string | null;
  addressApprox: string | null;
  lat: number | null;
  lng: number | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  mainImageUrl: string | null;
  imageUrls: string[];
  portals: PortalEntry[];
  representativePrice: number | null;
  representativePricePerMeter: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceSpreadAbs: number | null;
  priceSpreadPct: number | null;
  description: string | null;
  listingReference: string | null;
  cadastralRef: string | null;
  detailFetchedAt: string | null;
  phoneCanonical: string | null;
  advertiserId: string | null;
  advertiserDisplayName: string | null;
  advertiserType: "particular" | "agency" | null;
  inmovillaContactId: string | null;
  assignedComercialId: string | null;
  assignedComercialNombre: string | null;
  assignedAt: string | null;
  captacionStage:
    | "NEW"
    | "PROSPECT_CREATING"
    | "PROSPECT_CREATED"
    | "ENCARGO_ATTACHED"
    | "READY_FOR_PROPERTY"
    | "PROPERTY_CREATING"
    | "PROPERTY_CREATED"
    | "FAILED";
  inmovillaProspectRef: string | null;
  inmovillaPropertyCodOfer: number | null;
  captacionLastError: string | null;
  captacionUpdatedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface TimelineEntry {
  id: string;
  kind: "version" | "event";
  occurredAt: string;
  listingId: string;
  source: string | null;
  label: string;
  payload: unknown;
}

const SOURCE_LABEL: Record<string, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

const STAGE_LABEL: Record<PropertyClusterClient["captacionStage"], string> = {
  NEW: "Nuevo",
  PROSPECT_CREATING: "Creando prospecto",
  PROSPECT_CREATED: "Prospecto creado",
  ENCARGO_ATTACHED: "Con nota de encargo",
  READY_FOR_PROPERTY: "Listo para alta",
  PROPERTY_CREATING: "Dando alta",
  PROPERTY_CREATED: "Propiedad activa",
  FAILED: "Error",
};

const TIMELINE_FIELD_LABELS: Record<string, string> = {
  status: "estado del anuncio",
  price: "precio",
  pricePerMeter: "precio por m²",
  builtArea: "superficie construida",
  rooms: "habitaciones",
  bathrooms: "baños",
  floor: "planta",
  city: "ciudad",
  zone: "zona",
  addressApprox: "dirección aproximada",
  lat: "ubicación",
  lng: "ubicación",
  geohash: "ubicación",
  advertiserType: "tipo de anunciante",
  advertiserName: "nombre del anunciante",
  phones: "teléfonos de contacto",
  mainImageUrl: "foto principal",
  imageUrls: "galería de fotos",
  qualityScore: "calidad del anuncio",
  description: "descripción",
  listingReference: "referencia del anuncio",
  canonicalUrl: "enlace del anuncio",
};

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPpm(value: number | null): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("es-ES").format(value)} €/m²`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  if (phone.startsWith("+34")) {
    const local = phone.slice(3);
    return `+34 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return phone;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return `${Math.round(diff / 86_400_000)}d`;
}

function humanizeTechnicalLabel(value: string): string {
  const normalized = value
    .trim()
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function summarizeChangedFields(payload: unknown, fallbackLabel: string): string | null {
  const payloadRecord =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const rawChangedFields = payloadRecord?.changedFields;
  const fallbackFields = fallbackLabel
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const changedFields =
    Array.isArray(rawChangedFields) && rawChangedFields.length > 0
      ? rawChangedFields.filter((value): value is string => typeof value === "string")
      : fallbackFields;

  if (changedFields.length === 0) return null;

  const uniqueLabels = [...new Set(changedFields)].map(
    (field) => TIMELINE_FIELD_LABELS[field] ?? humanizeTechnicalLabel(field),
  );
  const compactLabels = [...new Set(uniqueLabels)];
  const visible = compactLabels.slice(0, 4).join(", ");
  const remaining = compactLabels.length - 4;
  return remaining > 0
    ? `Se actualizaron ${visible} y ${remaining} más.`
    : `Se actualizaron ${visible}.`;
}

function describeTimelineEntry(entry: TimelineEntry): {
  title: string;
  detail: string | null;
} {
  if (entry.kind === "event") {
    const payload = entry.payload as Record<string, unknown> | null;
    if (entry.label === "MARKET_LISTING_PRICE_CHANGED") {
      const before = payload?.before as { price?: number } | undefined;
      const after = payload?.after as { price?: number } | undefined;
      const deltaAbs = payload?.deltaAbs as number | undefined;
      const deltaPct = payload?.deltaPct as number | undefined;
      const sign = (deltaAbs ?? 0) < 0 ? "−" : "+";
      const detail =
        deltaAbs != null && deltaPct != null
          ? `${formatPrice(before?.price ?? null)} → ${formatPrice(after?.price ?? null)} (${sign}${Math.abs(deltaPct * 100).toFixed(1)}%)`
          : null;
      return { title: "Cambio de precio", detail };
    }
    if (entry.label === "MARKET_LISTING_REMOVED") {
      return { title: "Retirado del portal", detail: null };
    }
    if (entry.label === "MARKET_LISTING_REACTIVATED") {
      return { title: "Reapareció en el portal", detail: null };
    }
    if (entry.label === "MARKET_LISTING_CREATED") {
      return { title: "Alta nueva", detail: null };
    }
    if (entry.label === "MARKET_PROPERTY_MERGED") {
      return { title: "Fundido cross-portal", detail: null };
    }
    if (entry.label === "MARKET_PROPERTY_SPLIT") {
      return { title: "Marcado como distinto", detail: null };
    }
    if (entry.label === "MARKET_PROPERTY_REVIEW_REQUIRED") {
      return { title: "Pendiente de revisión", detail: null };
    }
    return { title: humanizeTechnicalLabel(entry.label), detail: null };
  }
  return {
    title: "Datos del anuncio actualizados",
    detail: summarizeChangedFields(entry.payload, entry.label),
  };
}

interface ComercialOption {
  comercialId: string;
  comercialNombre: string;
}

export function PropertyDetail({
  cluster: initialCluster,
  initialTimeline,
}: {
  cluster: PropertyClusterClient;
  initialTimeline: TimelineEntry[];
}) {
  const [cluster, setCluster] = useState(initialCluster);
  const [timeline] = useState<TimelineEntry[]>(initialTimeline);
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [pushing, setPushing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(
    null,
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/market/comerciales");
        const body = (await response.json()) as
          | { ok: true; items: ComercialOption[] }
          | { ok: false };
        if (!cancelled && response.ok && "ok" in body && body.ok) {
          setComerciales(body.items);
        }
      } catch {
        // Sin lista de comerciales no podemos asignar. La UI lo refleja.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openLightbox = useCallback((idx: number) => {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      else if (event.key === "ArrowRight") {
        setLightboxIndex((i) =>
          cluster.imageUrls.length > 0
            ? (i + 1) % cluster.imageUrls.length
            : 0,
        );
      } else if (event.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          cluster.imageUrls.length > 0
            ? (i - 1 + cluster.imageUrls.length) % cluster.imageUrls.length
            : 0,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, cluster.imageUrls.length]);

  const sortedPortals = useMemo(
    () =>
      [...cluster.portals].sort(
        (a, b) =>
          new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
      ),
    [cluster.portals],
  );

  async function pushToCrm() {
    if (!cluster.advertiserId || !cluster.phoneCanonical) return;
    setPushing(true);
    setPushFeedback(null);
    try {
      const response = await fetch(
        `/api/market/advertisers/${cluster.advertiserId}/inmovilla-contact`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        ok: boolean;
        status?: "ENQUEUED" | "ALREADY_LINKED";
        inmovillaContactId?: string;
        error?: string;
      };
      if (!response.ok || !body.ok) {
        setPushFeedback(body.error ?? `HTTP ${response.status}`);
        return;
      }
      setCluster((prev) => ({
        ...prev,
        inmovillaContactId: body.inmovillaContactId ?? "pendiente",
      }));
      setPushFeedback(
        body.status === "ALREADY_LINKED"
          ? "Ya estaba en CRM"
          : "Encolado · revisa CRM en unos minutos",
      );
    } catch (err) {
      setPushFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }

  async function assignComercial(nextComercialId: string | null) {
    if (cluster.assignedComercialId === nextComercialId) return;
    setAssigning(true);
    setAssignmentFeedback(null);
    try {
      const response = await fetch(
        `/api/market/listings/${cluster.representativeListingId}/assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comercialId: nextComercialId }),
        },
      );
      const body = (await response.json()) as {
        ok: boolean;
        assignment?: {
          comercialId: string | null;
          comercialNombre: string | null;
          assignedAt: string | null;
        };
        error?: { message?: string };
      };
      if (!response.ok || !body.ok || !body.assignment) {
        setAssignmentFeedback(
          body.error?.message ?? `HTTP ${response.status}`,
        );
        return;
      }
      setCluster((prev) => ({
        ...prev,
        assignedComercialId: body.assignment!.comercialId,
        assignedComercialNombre: body.assignment!.comercialNombre,
        assignedAt: body.assignment!.assignedAt,
      }));
      setAssignmentFeedback(
        nextComercialId ? "Comercial asignado" : "Sin asignar",
      );
    } catch (err) {
      setAssignmentFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {cluster.addressApprox ?? cluster.zone ?? cluster.city}
            </h1>
            {!cluster.clustered && (
              <Badge variant="outline" className="text-xs">
                Sin clusterizar
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {cluster.city}
            {cluster.zone ? ` · ${cluster.zone}` : ""} ·{" "}
            {cluster.housingType} · {cluster.operation}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              cluster.captacionStage === "FAILED"
                ? "destructive"
                : cluster.captacionStage === "PROPERTY_CREATED"
                  ? "secondary"
                  : "outline"
            }
          >
            {STAGE_LABEL[cluster.captacionStage]}
          </Badge>
          {sortedPortals.map((portal) => (
            <Badge key={portal.listingId} variant="secondary" className="text-xs">
              {SOURCE_LABEL[portal.source] ?? portal.source}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              {cluster.imageUrls.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {cluster.imageUrls.slice(0, 9).map((url, idx) => (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      onClick={() => openLightbox(idx)}
                      className="group relative block h-32 overflow-hidden rounded border border-neutral-200 bg-muted shadow-sm transition-all hover:border-emerald-400 hover:shadow-md dark:border-neutral-700"
                      title="Ver foto a tamaño grande"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Foto ${idx + 1}`}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5" />
                      </span>
                    </button>
                  ))}
                  {cluster.imageUrls.length > 9 && (
                    <button
                      type="button"
                      onClick={() => openLightbox(9)}
                      className="flex h-32 items-center justify-center rounded bg-muted text-sm font-medium text-muted-foreground hover:bg-muted/70"
                    >
                      +{cluster.imageUrls.length - 9} fotos
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded bg-muted text-sm text-muted-foreground">
                  Sin galería disponible
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4" />
                Características
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 px-0">
              <Detail icon={Maximize2} label="Superficie" value={cluster.builtArea ? `${cluster.builtArea} m²` : "—"} />
              <Detail icon={BedDouble} label="Habitaciones" value={cluster.rooms ?? "—"} />
              <Detail icon={Bath} label="Baños" value={cluster.bathrooms ?? "—"} />
              <Detail label="Planta" value={cluster.floor ?? "—"} />
              <Detail label="Tipología" value={cluster.housingType} />
              <Detail label="Operación" value={cluster.operation} />
              <Detail
                label="Precio repr."
                value={formatPrice(cluster.representativePrice)}
              />
              <Detail
                label="€/m² repr."
                value={formatPpm(cluster.representativePricePerMeter)}
              />
              <Detail
                label="Rango precio"
                value={
                  cluster.minPrice != null && cluster.maxPrice != null
                    ? cluster.minPrice === cluster.maxPrice
                      ? formatPrice(cluster.minPrice)
                      : `${formatPrice(cluster.minPrice)} – ${formatPrice(cluster.maxPrice)}`
                    : "—"
                }
              />
              {cluster.priceSpreadPct != null && (
                <Detail
                  label="Δ portales"
                  value={`${(cluster.priceSpreadPct * 100).toFixed(1)}%`}
                />
              )}
              <Detail
                label="Ref. anuncio"
                value={cluster.listingReference ?? "—"}
              />
              <Detail
                label="Catastral"
                value={cluster.cadastralRef ?? "—"}
              />
              <Detail
                label="Última vez vista"
                value={relativeTime(cluster.lastSeenAt)}
              />
              <Detail
                label="Primera vez vista"
                value={new Date(cluster.firstSeenAt).toLocaleDateString("es-ES")}
              />
            </CardContent>
          </Card>

          {cluster.description && (
            <Card className="border-0 shadow-none bg-transparent mt-2">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Descripción
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground p-4 bg-muted/20 border border-border/40 rounded-md break-words [overflow-wrap:anywhere]">
                  {cluster.description}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-base">
                Anuncios por portal ({sortedPortals.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-0">
              {sortedPortals.map((portal) => (
                <div
                  key={portal.listingId}
                  className="flex flex-col gap-2 rounded-md border border-border/40 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-background">
                        {SOURCE_LABEL[portal.source] ?? portal.source}
                      </Badge>
                      {portal.listingReference && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          #{portal.listingReference}
                        </span>
                      )}
                    </div>
                    <a
                      href={portal.canonicalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground flex items-center gap-1"
                    >
                      {portal.canonicalUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-4 text-sm mt-2 sm:mt-0">
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-base">{formatPrice(portal.price)}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        visto {relativeTime(portal.lastSeenAt)}
                      </span>
                    </div>
                    <Badge variant={portal.status === "active" ? "secondary" : "outline"} className="capitalize">
                      {portal.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none bg-transparent mt-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-base">
                Línea de tiempo ({timeline.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pt-2">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 bg-muted/20 rounded-md border border-border/40">
                  Sin cambios registrados todavía.
                </p>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-border/60">
                  {timeline.map((entry, index) => {
                    const desc = describeTimelineEntry(entry);
                    return (
                      <div key={entry.id} className="relative">
                        <div className="absolute left-[-29px] top-1 h-[10px] w-[10px] rounded-full bg-background border-2 border-primary z-10" />
                        <div className="flex flex-col gap-1 bg-muted/20 p-3 rounded-md border border-border/40">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-sm text-foreground">{desc.title}</span>
                            <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border/40">
                              {new Date(entry.occurredAt).toLocaleString("es-ES", {
                                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {entry.source && (
                              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider bg-background">
                                {SOURCE_LABEL[entry.source] ?? entry.source}
                              </Badge>
                            )}
                            {desc.detail && <span className="text-xs text-muted-foreground">{desc.detail}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {cluster.lat != null && cluster.lng != null && (
            <Card className="overflow-hidden border-border/40 shadow-sm">
              <CardHeader className="bg-muted/20 pb-3 border-b border-border/40">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Ubicación
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 relative group">
                {/* Iframe estatico de Google Maps; no requiere JS extra ni permisos especiales. */}
                <iframe
                  src={`https://www.google.com/maps?q=${cluster.lat},${cluster.lng}&hl=es&z=16&output=embed`}
                  title={`Mapa de ${cluster.addressApprox ?? cluster.city}`}
                  className="h-[240px] w-full border-0 grayscale-[20%] transition-all group-hover:grayscale-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="absolute bottom-0 w-full p-2 bg-gradient-to-t from-background/80 to-transparent">
                  <a
                    href={`https://www.google.com/maps?q=${cluster.lat},${cluster.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 text-xs font-medium bg-background/95 hover:bg-background border border-border/50 text-foreground py-1.5 px-3 rounded shadow-sm backdrop-blur-sm transition-colors"
                  >
                    Abrir en Google Maps
                    <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-sm border border-border/40 overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4 border-b border-border/40">
              <CardTitle className="text-sm">Comercial Asignado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-sm">
              <div className="space-y-2">
                <Label htmlFor="comercial-select" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Responsable del Lead
                </Label>
                <select
                  id="comercial-select"
                  value={cluster.assignedComercialId ?? ""}
                  onChange={(e) =>
                    void assignComercial(e.target.value ? e.target.value : null)
                  }
                  disabled={assigning}
                  className="h-10 w-full rounded-md border border-border/80 bg-background px-3 text-sm shadow-sm hover:border-border transition-colors disabled:opacity-50"
                >
                  <option value="">Sin asignar</option>
                  {comerciales.map((c) => (
                    <option key={c.comercialId} value={c.comercialId}>
                      {c.comercialNombre}
                    </option>
                  ))}
                </select>
              </div>
              {assignmentFeedback && (
                <div className="rounded border border-border/40 bg-muted/20 p-2.5 text-xs text-muted-foreground">
                  {assignmentFeedback}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border border-border/40 overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4 border-b border-border/40">
              <CardTitle className="text-sm">Publicante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {cluster.advertiserDisplayName ?? "No identificado"}
                </span>
                {cluster.advertiserType && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {cluster.advertiserType === "particular" ? "Particular" : "Agencia"}
                  </Badge>
                )}
              </div>
              <div className="flex h-10 items-center justify-between rounded-md border border-border/80 bg-background px-3 shadow-sm">
                {cluster.phoneCanonical ? (
                  <a
                    href={`tel:${cluster.phoneCanonical}`}
                    className="inline-flex items-center gap-2 text-sm font-medium hover:underline text-foreground"
                  >
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {formatPhone(cluster.phoneCanonical)}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                     <Phone className="h-4 w-4 opacity-50" />
                     Sin teléfono
                  </span>
                )}
                {cluster.inmovillaContactId && (
                  <Badge variant="secondary" className="text-[10px]">
                    En CRM ({cluster.inmovillaContactId})
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border border-border/40 overflow-hidden bg-primary/5">
            <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
              <CardTitle className="text-sm text-primary flex items-center gap-2">
                Acciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <Button
                className="w-full justify-start"
                size="lg"
                disabled={
                  pushing ||
                  !!cluster.inmovillaContactId ||
                  !cluster.advertiserId ||
                  !cluster.phoneCanonical
                }
                onClick={() => void pushToCrm()}
              >
                {pushing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {cluster.inmovillaContactId ? "Publicante ya en CRM" : "Sincronizar Publicante"}
              </Button>
              {pushFeedback && (
                <p className="text-xs text-muted-foreground p-2 bg-background rounded border border-border/40">{pushFeedback}</p>
              )}

              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full justify-start bg-background"
              >
                <Link
                  href={`/platform/captacion/oportunidades?fromListingId=${encodeURIComponent(cluster.representativeListingId)}&openCaptacion=prospecto`}
                >
                  <Building className="mr-2 h-4 w-4" />
                  Convertir en Prospecto / Alta
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full justify-start bg-background"
              >
                <a
                  href={`/platform/captacion?fromListingId=${encodeURIComponent(cluster.representativeListingId)}`}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Redactar Nota de Encargo
                </a>
              </Button>

              <div className="pt-4 border-t border-primary/10 flex flex-col gap-3">
                <Button
                  asChild
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                >
                  <a
                    href={
                      sortedPortals[0]?.canonicalUrl ?? "#"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir original en portal
                  </a>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                >
                  <Link href="/platform/captacion/oportunidades">
                    <MapPin className="mr-2 h-4 w-4" />
                    Volver a mapa de oportunidades
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[95vh] overflow-hidden border-0 bg-black/95 p-0 shadow-2xl sm:max-w-[95vw]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Visor de fotos</DialogTitle>
            <DialogDescription>
              Usa las flechas del teclado o los botones para navegar. Esc para cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex h-[90vh] w-full items-center justify-center">
            {cluster.imageUrls.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cluster.imageUrls[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[90vh] max-w-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            {cluster.imageUrls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex(
                      (i) =>
                        (i - 1 + cluster.imageUrls.length) %
                        cluster.imageUrls.length,
                    )
                  }
                  className="absolute left-3 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((i) => (i + 1) % cluster.imageUrls.length)
                  }
                  className="absolute right-3 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium tabular-nums text-white">
                  {lightboxIndex + 1} / {cluster.imageUrls.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number | null;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex flex-col p-3 rounded-md bg-muted/20 border border-border/40">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-sm font-medium">{value ?? "—"}</span>
    </div>
  );
}
