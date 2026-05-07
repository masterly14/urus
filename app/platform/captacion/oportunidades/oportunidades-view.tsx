"use client";

/**
 * OportunidadesView
 *
 * Vista flat de anuncios para captacion. Esta es la pantalla unica que ve
 * el comercial: una tabla con anuncios externos de Cordoba ordenados por
 * mas reciente, con accion "Anadir a Inmovilla CRM" en cada fila.
 *
 * Tres pilares:
 *  1. **Lista clara**: tabla flat, una fila = un anuncio, con foto,
 *     direccion/zona, m2, €/m2, hab, telefono, publicante, portal y
 *     CTA al CRM. Filtros simples arriba.
 *  2. **Mapa opt-in**: el mapa NO se muestra por defecto. El comercial
 *     pulsa "Filtrar por zona" y se abre un Sheet lateral con el mapa
 *     para dibujar el poligono. Al cerrar, la lista se filtra.
 *  3. **Refresco automatico**: toggle (OFF por defecto) que recarga la
 *     lista cada 90s para que el comercial vea oportunidades nuevas
 *     sin tener que pulsar nada. Boton de refresco manual siempre
 *     disponible.
 *
 * Decisiones de producto:
 *  - Fotocasa (`source_a`) NO expone foto, direccion, lat/lng en listado
 *    (limitacion del portal). Sus filas se marcan con badge "datos
 *    parciales". El comercial puede ocultarlas con un toggle.
 *  - Anadir a CRM solo esta disponible cuando el anuncio tiene publicante
 *    detectado (advertiserId) Y telefono canonico. En otros casos el
 *    boton aparece deshabilitado con tooltip explicativo.
 *
 * Mock: `?mock=1` activa fixtures locales sin red.
 */

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  UserPlus,
  X,
  ZoomIn,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MOCK_LISTINGS } from "./mock";
import type { LngLat, ListingOpportunity, ListingsApiResponse } from "./types";

const ZoneMap = dynamic(() => import("./zone-map").then((m) => m.ZoneMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Cargando mapa…
    </div>
  ),
});

const SOURCE_LABEL: Record<string, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

type PortalFilter =
  | "all"
  | "exclude_a"
  | "source_a"
  | "source_b"
  | "source_c"
  | "source_d";

type OperationFilter = "all" | "sale" | "rent";

const PORTAL_CHIP_LABEL: Record<PortalFilter, string> = {
  all: "Todos",
  exclude_a: "Sin Fotocasa",
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "idealista",
};

const toolbarBtnClass =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded border border-neutral-300 bg-[#f4f4f4] px-3 text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-200/90 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";

const filterChipClass =
  "inline-flex max-w-[240px] items-start gap-1.5 rounded border border-emerald-600/65 bg-emerald-50 px-2.5 py-1.5 text-left text-emerald-950 shadow-sm outline-none transition-colors hover:bg-emerald-100/90 focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-50 dark:hover:bg-emerald-950/55";

const POLLING_INTERVAL_MS = 90_000;
const DESCRIPTION_COLLAPSE_CHARS = 900;

function MarketFilterChip({
  label,
  value,
  singleLineValue,
  children,
}: {
  label: string;
  value?: string;
  /** Una sola linea en negrita (p. ej. PRECIO MIN.) */
  singleLineValue?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={filterChipClass}>
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          {singleLineValue != null ? (
            <span className="text-sm font-bold leading-tight">{singleLineValue}</span>
          ) : (
            <span className="flex min-w-0 flex-col gap-0 leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/90 dark:text-emerald-300/90">
                {label}
              </span>
              <span className="truncate text-sm font-bold">{value ?? "—"}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function escapeCsvCell(raw: string): string {
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return `${Math.round(diff / 86_400_000)}d`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  if (phone.startsWith("+34")) {
    const local = phone.slice(3);
    return `+34 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return phone;
}

function displayLocation(row: ListingOpportunity): string {
  if (row.addressApprox && row.addressApprox.trim()) return row.addressApprox;
  if (row.zone && row.zone.trim()) return row.zone;
  if (row.city) return row.city;
  return "Ubicacion no disponible";
}

function isPartialDataSource(source: string): boolean {
  // Fotocasa no expone foto/direccion/lat-lng en HTML del listado.
  return source === "source_a";
}

function captacionStageLabel(stage: CaptacionStage): string {
  switch (stage) {
    case "NEW":
      return "Nuevo";
    case "PROSPECT_CREATING":
      return "Creando prospecto";
    case "PROSPECT_CREATED":
      return "Prospecto creado";
    case "ENCARGO_ATTACHED":
      return "Con nota de encargo";
    case "READY_FOR_PROPERTY":
      return "Listo para alta";
    case "PROPERTY_CREATING":
      return "Dando alta";
    case "PROPERTY_CREATED":
      return "Propiedad activa";
    case "FAILED":
      return "Error";
    default:
      return stage;
  }
}

function parseFotosInput(
  raw: string,
): Record<string, { url: string; posicion?: number }> | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  const out: Record<string, { url: string; posicion?: number }> = {};
  for (let i = 0; i < lines.length; i += 1) {
    const url = lines[i]!;
    out[String(i + 1)] = { url, posicion: i + 1 };
  }
  return out;
}

interface PushResponse {
  ok: boolean;
  status?: "ENQUEUED" | "ALREADY_LINKED";
  inmovillaContactId?: string | null;
  error?: string;
}

interface ComercialOption {
  userId: string;
  userName: string;
  userEmail: string;
  comercialId: string;
  comercialNombre: string;
  ciudad: string;
}

interface AssignmentResponse {
  ok: boolean;
  status?: "ASSIGNED" | "UNASSIGNED" | "UNCHANGED";
  assignment?: {
    comercialId: string | null;
    comercialNombre: string | null;
    assignedAt: string | null;
  };
  error?: { message?: string };
}

type CaptacionStage =
  | "NEW"
  | "PROSPECT_CREATING"
  | "PROSPECT_CREATED"
  | "ENCARGO_ATTACHED"
  | "READY_FOR_PROPERTY"
  | "PROPERTY_CREATING"
  | "PROPERTY_CREATED"
  | "FAILED";

interface CaptacionActionResult {
  ok: true;
  status: "CREATED" | "UPDATED" | "ALREADY_DONE";
  stage: CaptacionStage;
  ref: string | null;
  codOfer: number | null;
}

interface CaptacionActionResponse {
  ok: boolean;
  result?: CaptacionActionResult;
  error?: { message?: string };
}

interface CaptacionFormState {
  keyLoca: string;
  keyTipo: string;
  keyZona: string;
  calle: string;
  numero: string;
  planta: string;
  precioInmo: string;
  habitaciones: string;
  banyos: string;
  tituloes: string;
  descripciones: string;
  fotosText: string;
}

const EMPTY_CAPTACION_FORM: CaptacionFormState = {
  keyLoca: "",
  keyTipo: "",
  keyZona: "",
  calle: "",
  numero: "",
  planta: "",
  precioInmo: "",
  habitaciones: "",
  banyos: "",
  tituloes: "",
  descripciones: "",
  fotosText: "",
};

export function OportunidadesView({ mock }: { mock: boolean }) {
  const [city, setCity] = useState("cordoba");
  const [advertiserType, setAdvertiserType] = useState<string>("all");
  const [hasPhone, setHasPhone] = useState<boolean>(false);
  const [sinceHours, setSinceHours] = useState<string>("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [areaMin, setAreaMin] = useState<string>("");
  const [roomsMin, setRoomsMin] = useState<string>("any");
  const [portalFilter, setPortalFilter] = useState<PortalFilter>("all");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);

  const [polygon, setPolygon] = useState<LngLat[] | null>(null);
  const [mapOpen, setMapOpen] = useState<boolean>(false);

  const [items, setItems] = useState<ListingOpportunity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [meta, setMeta] = useState<ListingsApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Paginación cursor-based: guardamos el cursor de entrada por página para
  // poder retroceder. pageInputCursors[N-1] es el cursor enviado para
  // obtener la página N. La página 1 siempre tiene cursor null.
  const PAGE_SIZE = 50;
  const [pageInputCursors, setPageInputCursors] = useState<(string | null)[]>([
    null,
  ]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // Lightbox de fotos a tamaño grande.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [secondsToRefresh, setSecondsToRefresh] = useState<number>(
    POLLING_INTERVAL_MS / 1000,
  );
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushFeedback, setPushFeedback] = useState<Record<string, string>>({});
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [loadingComerciales, setLoadingComerciales] = useState<boolean>(false);
  const [comercialesError, setComercialesError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<
    Record<string, string>
  >({});
  const [captacionModalOpen, setCaptacionModalOpen] = useState(false);
  const [captacionModalMode, setCaptacionModalMode] = useState<
    "prospecto" | "promocion"
  >("prospecto");
  const [captacionTarget, setCaptacionTarget] = useState<ListingOpportunity | null>(
    null,
  );
  const [captacionForm, setCaptacionForm] = useState<CaptacionFormState>(
    EMPTY_CAPTACION_FORM,
  );
  const [captacionSubmitting, setCaptacionSubmitting] = useState(false);
  const [captacionFeedback, setCaptacionFeedback] = useState<
    Record<string, string>
  >({});
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailListingId, setDetailListingId] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const sources = useMemo<string[] | undefined>(() => {
    switch (portalFilter) {
      case "all":
        return undefined;
      case "exclude_a":
        return ["source_b", "source_c", "source_d"];
      case "source_a":
        return ["source_a"];
      case "source_b":
        return ["source_b"];
      case "source_c":
        return ["source_c"];
      case "source_d":
        return ["source_d"];
      default:
        return undefined;
    }
  }, [portalFilter]);

  const fetchListings = useCallback(
    async (append: boolean, nextCursor: string | null) => {
      if (mock) {
        setItems(MOCK_LISTINGS);
        setMeta({
          totalEstimated: MOCK_LISTINGS.length,
          polygonApplied: polygon != null && polygon.length >= 3,
          sourcesWithoutCoords: ["source_a"],
          freshAt: new Date().toISOString(),
        });
        setCursor(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = { limit: 50 };
        if (city.trim()) body.city = city.trim();
        if (sources !== undefined) body.sources = sources;
        if (advertiserType !== "all") body.advertiserType = advertiserType;
        if (operationFilter !== "all") body.operation = operationFilter;
        if (hasPhone) body.hasPhone = true;
        if (sinceHours !== "all") body.sinceHours = Number(sinceHours);
        if (priceMin) body.priceMin = Number(priceMin);
        if (priceMax) body.priceMax = Number(priceMax);
        if (areaMin) body.areaMin = Number(areaMin);
        if (roomsMin !== "any") body.roomsMin = Number(roomsMin);
        if (polygon) body.polygon = polygon;
        if (nextCursor) body.cursor = nextCursor;

        const response = await fetch("/api/market/listings/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await response.json().catch(() => ({}))) as
          | ListingsApiResponse
          | { ok: false; error?: { message?: string } };
        if (!response.ok || !("ok" in json) || !json.ok) {
          const msg =
            "error" in json && json.error?.message
              ? json.error.message
              : `HTTP ${response.status}`;
          setError(msg);
          return;
        }
        setMeta(json.meta);
        setCursor(json.cursor);
        setItems((prev) => {
          if (append) return [...prev, ...json.items];
          // Detectar IDs nuevos para resaltar (cuando es refresco automatico).
          if (autoRefresh && prev.length > 0) {
            const prevIds = new Set(prev.map((p) => p.id));
            const fresh = json.items.find((i) => !prevIds.has(i.id));
            if (fresh) {
              setHighlightId(fresh.id);
              setTimeout(() => setHighlightId(null), 4_000);
            }
          }
          return json.items;
        });
        lastFetchRef.current = Date.now();
        setSecondsToRefresh(POLLING_INTERVAL_MS / 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [
      mock,
      city,
      sources,
      advertiserType,
      operationFilter,
      hasPhone,
      sinceHours,
      priceMin,
      priceMax,
      areaMin,
      roomsMin,
      polygon,
      autoRefresh,
    ],
  );

  useEffect(() => {
    void fetchListings(false, null);
  }, [fetchListings]);

  // Atajos de teclado para el lightbox.
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        lightboxNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        lightboxPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, lightboxImages.length]);

  // Polling.
  useEffect(() => {
    if (!autoRefresh || mock) return;
    const tick = setInterval(() => {
      const elapsed = Date.now() - lastFetchRef.current;
      const remaining = Math.max(
        0,
        Math.round((POLLING_INTERVAL_MS - elapsed) / 1000),
      );
      setSecondsToRefresh(remaining);
      if (remaining === 0) {
        void fetchListings(false, null);
      }
    }, 1_000);
    return () => clearInterval(tick);
  }, [autoRefresh, mock, fetchListings]);

  useEffect(() => {
    if (mock) return;
    let cancelled = false;
    async function loadComerciales() {
      setLoadingComerciales(true);
      setComercialesError(null);
      try {
        const response = await fetch("/api/market/comerciales");
        const body = (await response.json().catch(() => ({}))) as
          | { ok: true; items: ComercialOption[] }
          | { ok: false; error?: string };
        if (!response.ok || !("ok" in body) || !body.ok) {
          const message =
            "error" in body && body.error
              ? body.error
              : `HTTP ${response.status}`;
          if (!cancelled) setComercialesError(message);
          return;
        }
        if (!cancelled) setComerciales(body.items);
      } catch (err) {
        if (!cancelled) {
          setComercialesError(
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        if (!cancelled) setLoadingComerciales(false);
      }
    }
    void loadComerciales();
    return () => {
      cancelled = true;
    };
  }, [mock]);

  const markers = useMemo<LngLat[]>(() => {
    return items
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => [i.lng!, i.lat!] as LngLat);
  }, [items]);

  const polygonActive = polygon != null && polygon.length >= 3;
  const selectedListing = useMemo(
    () => items.find((item) => item.id === detailListingId) ?? null,
    [items, detailListingId],
  );
  const hasLongDescription =
    !!selectedListing?.description &&
    selectedListing.description.length > DESCRIPTION_COLLAPSE_CHARS;
  const visibleDescription =
    selectedListing?.description && !descriptionExpanded && hasLongDescription
      ? `${selectedListing.description
          .slice(0, DESCRIPTION_COLLAPSE_CHARS)
          .trimEnd()}…`
      : selectedListing?.description ?? null;
  const comercialNameById = useMemo(() => {
    return Object.fromEntries(
      comerciales.map((c) => [c.comercialId, c.comercialNombre]),
    ) as Record<string, string>;
  }, [comerciales]);

  useEffect(() => {
    if (!detailModalOpen) {
      setDescriptionExpanded(false);
    }
  }, [detailModalOpen, detailListingId]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (portalFilter !== "all") n++;
    if (sinceHours !== "all") n++;
    if (operationFilter !== "all") n++;
    if (advertiserType !== "all") n++;
    if (hasPhone) n++;
    if (priceMin.trim()) n++;
    if (priceMax.trim()) n++;
    if (areaMin.trim()) n++;
    if (roomsMin !== "any") n++;
    if (city.trim().toLowerCase() !== "cordoba") n++;
    if (polygonActive) n++;
    return n;
  }, [
    portalFilter,
    sinceHours,
    operationFilter,
    advertiserType,
    hasPhone,
    priceMin,
    priceMax,
    areaMin,
    roomsMin,
    city,
    polygonActive,
  ]);

  const alertaChipValue = useMemo(() => {
    switch (sinceHours) {
      case "24":
        return "Últimas 24 h";
      case "72":
        return "Últimas 72 h";
      case "168":
        return "Última semana";
      default:
        return "Cualquier momento";
    }
  }, [sinceHours]);

  const tipoChipValue = useMemo(() => {
    switch (operationFilter) {
      case "sale":
        return "Venta";
      case "rent":
        return "Alquiler";
      default:
        return "Todos";
    }
  }, [operationFilter]);

  const anuncioChipValue = useMemo(() => {
    switch (advertiserType) {
      case "particular":
        return "Particular";
      case "agency":
        return "Agencia";
      default:
        return "Todos";
    }
  }, [advertiserType]);

  const clearAllFilters = useCallback(() => {
    setCity("cordoba");
    setAdvertiserType("all");
    setHasPhone(false);
    setSinceHours("all");
    setPriceMin("");
    setPriceMax("");
    setAreaMin("");
    setRoomsMin("any");
    setPortalFilter("all");
    setOperationFilter("all");
    setPolygon(null);
  }, []);

  const exportCsv = useCallback(() => {
    const headers = [
      "Direccion_Zona",
      "Ciudad",
      "m2",
      "Precio",
      "Euro_m2",
      "Hab",
      "Banos",
      "Telefono",
      "Publicante",
      "Tipo_publicante",
      "Portal",
      "URL",
      "CRM",
      "Ultimo_visto",
    ];
    const lines = [
      headers.map(escapeCsvCell).join(","),
      ...items.map((row) =>
        [
          displayLocation(row),
          row.city,
          row.builtArea ?? "",
          row.price ?? "",
          row.pricePerMeter ?? "",
          row.rooms ?? "",
          row.bathrooms ?? "",
          row.phoneCanonical ?? "",
          row.advertiserDisplayName ?? "",
          row.advertiserType ?? "",
          SOURCE_LABEL[row.source] ?? row.source,
          row.canonicalUrl,
          row.inmovillaContactId ?? "",
          row.lastSeenAt,
        ]
          .map((c) => escapeCsvCell(String(c)))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oportunidades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items]);

  function applyFilters() {
    setPageInputCursors([null]);
    setCurrentPage(1);
    void fetchListings(false, null);
  }

  function goToNextPage() {
    if (!cursor || loading) return;
    const nextPage = currentPage + 1;
    setPageInputCursors((prev) => {
      if (prev.length >= nextPage) {
        const copy = [...prev];
        copy[nextPage - 1] = cursor;
        return copy;
      }
      return [...prev, cursor];
    });
    setCurrentPage(nextPage);
    void fetchListings(false, cursor);
  }

  function goToPrevPage() {
    if (currentPage <= 1 || loading) return;
    const prevPage = currentPage - 1;
    const prevCursor = pageInputCursors[prevPage - 1] ?? null;
    setCurrentPage(prevPage);
    void fetchListings(false, prevCursor);
  }

  function openLightbox(images: string[], startIdx: number = 0) {
    if (!images || images.length === 0) return;
    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(startIdx, images.length - 1)));
    setLightboxOpen(true);
  }

  function lightboxNext() {
    setLightboxIndex((idx) =>
      lightboxImages.length > 0 ? (idx + 1) % lightboxImages.length : 0,
    );
  }

  function lightboxPrev() {
    setLightboxIndex((idx) =>
      lightboxImages.length > 0
        ? (idx - 1 + lightboxImages.length) % lightboxImages.length
        : 0,
    );
  }

  async function pushToInmovilla(row: ListingOpportunity) {
    if (!row.advertiserId || !row.phoneCanonical) return;
    if (mock) {
      setPushFeedback((p) => ({ ...p, [row.id]: "Encolado (mock)" }));
      setItems((prev) =>
        prev.map((it) =>
          it.advertiserId === row.advertiserId
            ? { ...it, inmovillaContactId: "MOCK-12345" }
            : it,
        ),
      );
      return;
    }
    setPushingId(row.id);
    setPushFeedback((p) => ({ ...p, [row.id]: "" }));
    try {
      const response = await fetch(
        `/api/market/advertisers/${row.advertiserId}/inmovilla-contact`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as PushResponse;
      if (!response.ok || !body.ok) {
        setPushFeedback((p) => ({
          ...p,
          [row.id]: body.error ?? `HTTP ${response.status}`,
        }));
        return;
      }
      const contactId = body.inmovillaContactId ?? "pendiente";
      setItems((prev) =>
        prev.map((it) =>
          it.advertiserId === row.advertiserId
            ? { ...it, inmovillaContactId: contactId }
            : it,
        ),
      );
      setPushFeedback((p) => ({
        ...p,
        [row.id]:
          body.status === "ALREADY_LINKED"
            ? "Ya estaba en CRM"
            : "Encolado · revisa CRM en unos minutos",
      }));
    } catch (err) {
      setPushFeedback((p) => ({
        ...p,
        [row.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setPushingId(null);
    }
  }

  async function assignComercial(
    row: ListingOpportunity,
    nextComercialId: string | null,
  ) {
    if (row.assignedComercialId === nextComercialId) return;
    if (mock) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === row.id
            ? {
                ...it,
                assignedComercialId: nextComercialId,
                assignedComercialNombre: nextComercialId
                  ? (comercialNameById[nextComercialId] ?? null)
                  : null,
                assignedAt: nextComercialId ? new Date().toISOString() : null,
              }
            : it,
        ),
      );
      setAssignmentFeedback((p) => ({
        ...p,
        [row.id]: nextComercialId ? "Asignado (mock)" : "Sin asignar (mock)",
      }));
      return;
    }

    const previous = {
      assignedComercialId: row.assignedComercialId,
      assignedComercialNombre: row.assignedComercialNombre,
      assignedAt: row.assignedAt,
    };

    setAssigningId(row.id);
    setAssignmentFeedback((p) => ({ ...p, [row.id]: "" }));
    setItems((prev) =>
      prev.map((it) =>
        it.id === row.id
          ? {
              ...it,
              assignedComercialId: nextComercialId,
              assignedComercialNombre: nextComercialId
                ? (comercialNameById[nextComercialId] ??
                  row.assignedComercialNombre)
                : null,
              assignedAt: nextComercialId ? new Date().toISOString() : null,
            }
          : it,
      ),
    );

    try {
      const response = await fetch(`/api/market/listings/${row.id}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comercialId: nextComercialId }),
      });
      const body = (await response.json().catch(() => ({}))) as AssignmentResponse;
      if (!response.ok || !body.ok || !body.assignment) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === row.id
              ? {
                  ...it,
                  assignedComercialId: previous.assignedComercialId,
                  assignedComercialNombre: previous.assignedComercialNombre,
                  assignedAt: previous.assignedAt,
                }
              : it,
          ),
        );
        setAssignmentFeedback((p) => ({
          ...p,
          [row.id]: body.error?.message ?? `HTTP ${response.status}`,
        }));
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === row.id
            ? {
                ...it,
                assignedComercialId: body.assignment!.comercialId,
                assignedComercialNombre: body.assignment!.comercialNombre,
                assignedAt: body.assignment!.assignedAt,
              }
            : it,
        ),
      );
      setAssignmentFeedback((p) => ({
        ...p,
        [row.id]:
          body.status === "UNASSIGNED" ? "Sin asignar" : "Comercial asignado",
      }));
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === row.id
            ? {
                ...it,
                assignedComercialId: previous.assignedComercialId,
                assignedComercialNombre: previous.assignedComercialNombre,
                assignedAt: previous.assignedAt,
              }
            : it,
        ),
      );
      setAssignmentFeedback((p) => ({
        ...p,
        [row.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setAssigningId(null);
    }
  }

  function openCaptacionModal(
    row: ListingOpportunity,
    mode: "prospecto" | "promocion",
  ) {
    setDetailModalOpen(false);
    setCaptacionTarget(row);
    setCaptacionModalMode(mode);
    setCaptacionForm({
      keyLoca: "",
      keyTipo: "",
      keyZona: "",
      calle: row.addressApprox ?? "",
      numero: "",
      planta: row.floor ?? "",
      precioInmo: row.price != null ? String(row.price) : "",
      habitaciones: row.rooms != null ? String(row.rooms) : "",
      banyos: row.bathrooms != null ? String(row.bathrooms) : "",
      tituloes: "",
      descripciones: "",
      fotosText: "",
    });
    setCaptacionModalOpen(true);
  }

  function openDetailModal(row: ListingOpportunity) {
    setDetailListingId(row.id);
    setDetailModalOpen(true);
  }

  async function submitCaptacionAction() {
    if (!captacionTarget || mock) return;
    setCaptacionSubmitting(true);
    setCaptacionFeedback((prev) => ({ ...prev, [captacionTarget.id]: "" }));
    try {
      const body: Record<string, unknown> = {};
      if (captacionForm.keyLoca.trim()) body.keyLoca = Number(captacionForm.keyLoca);
      if (captacionForm.keyTipo.trim()) body.keyTipo = Number(captacionForm.keyTipo);
      if (captacionForm.keyZona.trim()) body.keyZona = Number(captacionForm.keyZona);
      if (captacionForm.calle.trim()) body.calle = captacionForm.calle.trim();
      if (captacionForm.numero.trim()) body.numero = Number(captacionForm.numero);
      if (captacionForm.planta.trim()) body.planta = captacionForm.planta.trim();
      if (captacionForm.precioInmo.trim()) {
        body.precioInmo = Number(captacionForm.precioInmo);
      }
      if (captacionForm.habitaciones.trim()) {
        body.habitaciones = Number(captacionForm.habitaciones);
      }
      if (captacionForm.banyos.trim()) {
        body.banyos = Number(captacionForm.banyos);
      }
      if (captacionForm.tituloes.trim()) body.tituloes = captacionForm.tituloes.trim();
      if (captacionForm.descripciones.trim()) {
        body.descripciones = captacionForm.descripciones.trim();
      }
      const fotos = parseFotosInput(captacionForm.fotosText);
      if (fotos) body.fotos = fotos;

      const endpoint =
        captacionModalMode === "prospecto"
          ? `/api/market/listings/${captacionTarget.id}/inmovilla-prospect`
          : `/api/market/listings/${captacionTarget.id}/promote-property`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as CaptacionActionResponse;
      if (!response.ok || !payload.ok || !payload.result) {
        const message =
          payload.error?.message ??
          `HTTP ${response.status} en acción de captación`;
        setCaptacionFeedback((prev) => ({
          ...prev,
          [captacionTarget.id]: message,
        }));
        return;
      }

      setItems((prev) =>
        prev.map((item) =>
          item.id === captacionTarget.id
            ? {
                ...item,
                captacionStage: payload.result!.stage,
                inmovillaProspectRef: payload.result!.ref,
                inmovillaPropertyCodOfer: payload.result!.codOfer,
                captacionLastError: null,
                captacionUpdatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      setCaptacionFeedback((prev) => ({
        ...prev,
        [captacionTarget.id]:
          captacionModalMode === "prospecto"
            ? "Prospecto sincronizado en Inmovilla"
            : "Propiedad dada de alta en Inmovilla",
      }));
      setCaptacionModalOpen(false);
    } catch (error) {
      setCaptacionFeedback((prev) => ({
        ...prev,
        [captacionTarget.id]:
          error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setCaptacionSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {mock && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Modo mock:</strong> datos estaticos (no se llama a la API).
          Quita <code>?mock=1</code> de la URL para datos reales.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={toolbarBtnClass} title="Ayuda de uso">
              <CircleHelp className="h-4 w-4 opacity-80" />
              Ayuda
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="start">
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-foreground">Como funciona captacion</p>
              <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>Filtra oportunidades y asigna comercial responsable.</li>
                <li>
                  Usa <strong>Prospecto</strong> para crear la ficha inicial en
                  Inmovilla.
                </li>
                <li>
                  Opcionalmente adjunta <strong>Nota de encargo</strong> desde el
                  icono de documento.
                </li>
                <li>
                  Cuando tengas datos completos (fotos, direccion, catalogos), usa
                  <strong> Alta</strong> para promover a propiedad activa.
                </li>
              </ol>
              <p className="text-muted-foreground">
                La columna <strong>Captacion</strong> te muestra estado, referencias y
                errores de sincronizacion.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger className={toolbarBtnClass}>
            <ChevronDown className="h-4 w-4 opacity-80" />
            Acciones
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Mapa y zona</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => setMapOpen(true)}
              className="gap-2"
            >
              <MapPin className="h-4 w-4 shrink-0" />
              {polygonActive ? "Cambiar zona en mapa" : "Filtrar por zona en mapa"}
            </DropdownMenuItem>
            {polygonActive ? (
              <DropdownMenuItem
                onClick={() => setPolygon(null)}
                className="gap-2"
              >
                <X className="h-4 w-4 shrink-0" />
                Quitar filtro de zona
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={autoRefresh}
              onCheckedChange={(v) => setAutoRefresh(!!v)}
              disabled={mock}
            >
              Auto-refresco (90s)
              {autoRefresh && !mock ? (
                <span className="text-muted-foreground"> · {secondsToRefresh}s</span>
              ) : null}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => clearAllFilters()}>
              Limpiar filtros
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={toolbarBtnClass}>
          <Switch
            size="sm"
            checked={filterPanelOpen}
            onCheckedChange={setFilterPanelOpen}
            id="filtro-panel"
          />
          <label htmlFor="filtro-panel" className="cursor-pointer select-none">
            Filtro
          </label>
          {activeFilterCount > 0 ? (
            <span
              className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-semibold tabular-nums text-white"
              aria-label={`${activeFilterCount} filtros activos`}
            >
              {activeFilterCount > 99 ? "99+" : activeFilterCount}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className={toolbarBtnClass}
          onClick={() => exportCsv()}
          disabled={items.length === 0}
        >
          <FileDown className="h-4 w-4 opacity-80" />
          Exportar
        </button>

        <button
          type="button"
          className={toolbarBtnClass}
          onClick={() => void fetchListings(false, null)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin opacity-80" />
          ) : (
            <RefreshCw className="h-4 w-4 opacity-80" />
          )}
          Actualizar
        </button>

        <div className={`${toolbarBtnClass} ml-auto`}>
          <Switch
            size="sm"
            checked={mapOpen}
            onCheckedChange={setMapOpen}
            id="mostrar-mapa"
          />
          <label htmlFor="mostrar-mapa" className="cursor-pointer select-none">
            Mostrar mapa
          </label>
        </div>
      </div>

      {polygonActive && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1 px-2 py-1"
            onClick={() => setPolygon(null)}
          >
            Area activa · {polygon!.length} puntos
            <X className="h-3 w-3" />
          </Badge>
        </div>
      )}

      {filterPanelOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <MarketFilterChip label="PORTAL" value={PORTAL_CHIP_LABEL[portalFilter]}>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Portal</Label>
              <Select
                value={portalFilter}
                onValueChange={(v) => setPortalFilter(v as PortalFilter)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los portales</SelectItem>
                  <SelectItem value="source_d">Idealista</SelectItem>
                  <SelectItem value="source_a">Fotocasa</SelectItem>
                  <SelectItem value="source_b">Pisos.com</SelectItem>
                  <SelectItem value="source_c">Milanuncios</SelectItem>
                  <SelectItem value="exclude_a">Todos menos Fotocasa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </MarketFilterChip>

          <MarketFilterChip
            label="ALERTA"
            value={sinceHours === "all" ? "Filtros" : alertaChipValue}
          >
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Ventana temporal</Label>
              <Select value={sinceHours} onValueChange={setSinceHours}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cualquier momento</SelectItem>
                  <SelectItem value="24">Ultimas 24h</SelectItem>
                  <SelectItem value="72">Ultimas 72h</SelectItem>
                  <SelectItem value="168">Ultima semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </MarketFilterChip>

          <MarketFilterChip label="TIPO" value={tipoChipValue}>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Operacion</Label>
              <Select
                value={operationFilter}
                onValueChange={(v) => setOperationFilter(v as OperationFilter)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sale">Venta</SelectItem>
                  <SelectItem value="rent">Alquiler</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </MarketFilterChip>

          <MarketFilterChip label="ANUNCIO" value={anuncioChipValue}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Publicante</Label>
                <Select value={advertiserType} onValueChange={setAdvertiserType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="particular">Particular</SelectItem>
                    <SelectItem value="agency">Agencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={hasPhone}
                  onChange={(e) => setHasPhone(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border"
                />
                Solo con telefono
              </label>
            </div>
          </MarketFilterChip>

          <MarketFilterChip
            label="PRECIO MIN."
            singleLineValue={
              priceMin.trim()
                ? `${Number(priceMin).toLocaleString("es-ES")} €`
                : "PRECIO MIN."
            }
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="chip-price-min">Precio minimo (€)</Label>
              <Input
                id="chip-price-min"
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="Ej. 50000"
              />
            </div>
          </MarketFilterChip>

          <MarketFilterChip
            label="PRECIO MAX."
            singleLineValue={
              priceMax.trim()
                ? `${Number(priceMax).toLocaleString("es-ES")} €`
                : "PRECIO MAX."
            }
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="chip-price-max">Precio maximo (€)</Label>
              <Input
                id="chip-price-max"
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="Ej. 500000"
              />
            </div>
          </MarketFilterChip>

          <MarketFilterChip label="CIUDAD" value={city.trim() || "—"}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chip-city">Ciudad</Label>
              <Input
                id="chip-city"
                value={city}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setCity(e.target.value)
                }
                placeholder="cordoba"
              />
            </div>
          </MarketFilterChip>

          <MarketFilterChip
            label="M² MIN."
            singleLineValue={areaMin.trim() ? `${areaMin} m²` : "M² MIN."}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="chip-area-min">Superficie minima (m²)</Label>
              <Input
                id="chip-area-min"
                type="number"
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
                placeholder="Ej. 60"
              />
            </div>
          </MarketFilterChip>

          <MarketFilterChip
            label="HABS."
            value={
              roomsMin === "any"
                ? "Cualquiera"
                : `${roomsMin}+`
            }
          >
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Habitaciones minimas</Label>
              <Select value={roomsMin} onValueChange={setRoomsMin}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Cualquiera</SelectItem>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                  <SelectItem value="4">4+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </MarketFilterChip>

          <Button
            size="sm"
            variant="secondary"
            className="h-9 border border-neutral-300 bg-[#f4f4f4] hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            onClick={() => applyFilters()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Aplicar filtros
          </Button>
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-neutral-300 shadow-sm dark:border-neutral-700">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b bg-muted/20 pb-3 dark:bg-muted/10">
          <CardTitle className="text-sm font-semibold">
            Listado{" "}
            {meta && (
              <span className="text-xs font-normal text-muted-foreground">
                · {items.length} de ~{meta.totalEstimated}
              </span>
            )}
          </CardTitle>
          {polygonActive && meta?.sourcesWithoutCoords?.length ? (
            <span className="text-xs text-amber-600">
              Sin coords (excluidas con area):{" "}
              {meta.sourcesWithoutCoords
                .map((s) => SOURCE_LABEL[s] ?? s)
                .join(", ")}
            </span>
          ) : null}
        </CardHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-neutral-100/80 px-3 py-2 dark:bg-neutral-900/50">
          <div className="flex flex-wrap items-center gap-1 text-sm tabular-nums text-muted-foreground">
            <button
              type="button"
              onClick={goToPrevPage}
              disabled={currentPage <= 1 || loading}
              className="inline-flex items-center justify-center rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-950 dark:hover:bg-neutral-900"
              aria-label="Página anterior"
              title="Página anterior"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="rounded border border-neutral-300 bg-neutral-200 px-2 py-0.5 text-xs font-medium text-foreground dark:border-neutral-600 dark:bg-neutral-800">
              {currentPage}
            </span>
            <span className="text-xs text-muted-foreground">
              {items.length > 0
                ? `· ${items.length} filas${
                    meta?.totalEstimated
                      ? ` (de ~${meta.totalEstimated} totales)`
                      : ""
                  }`
                : "· sin filas"}
            </span>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={!cursor || loading}
              className="inline-flex items-center justify-center rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-950 dark:hover:bg-neutral-900"
              aria-label="Página siguiente"
              title="Página siguiente"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline">
              Columnas
              <ChevronDown className="h-4 w-4 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">
                Columnas de la tabla
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked disabled>
                Foto
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked disabled>
                Direccion / Zona
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked disabled>
                Precio y m²
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked disabled>
                Accion CRM
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {error && (
            <div className="m-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
              {error}
            </div>
          )}
          {comercialesError && (
            <div className="mx-3 mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              No se pudo cargar la lista de comerciales: {comercialesError}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Foto</TableHead>
                <TableHead>Inmueble</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Publicante</TableHead>
                <TableHead>Captacion</TableHead>
                <TableHead className="text-right">Visto</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-xs text-muted-foreground"
                  >
                    Sin anuncios para los filtros actuales.
                    {polygonActive && (
                      <>
                        {" "}
                        Prueba a ampliar el area dibujada o pulsa{" "}
                        <button
                          type="button"
                          onClick={() => setPolygon(null)}
                          className="underline"
                        >
                          Limpiar zona
                        </button>
                        .
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {items.map((row) => {
                const partial = isPartialDataSource(row.source);
                return (
                  <TableRow
                    key={row.id}
                    className={
                      highlightId === row.id
                        ? "bg-emerald-50 transition-colors dark:bg-emerald-950/30"
                        : undefined
                    }
                  >
                    <TableCell className="w-[160px]">
                      {row.mainImageUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            const imgs =
                              row.imageUrls && row.imageUrls.length > 0
                                ? row.imageUrls
                                : [row.mainImageUrl!];
                            openLightbox(imgs, 0);
                          }}
                          className="group relative block h-24 w-36 overflow-hidden rounded border border-neutral-200 bg-muted shadow-sm transition-all hover:border-emerald-400 hover:shadow-md dark:border-neutral-700"
                          title="Ver foto a tamaño grande"
                        >
                          <img
                            src={row.mainImageUrl}
                            alt={`Anuncio ${row.id}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                            <ZoomIn className="h-5 w-5" />
                          </span>
                          {row.imageUrls && row.imageUrls.length > 1 ? (
                            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              +{row.imageUrls.length - 1}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <div className="flex h-24 w-36 items-center justify-center rounded border border-dashed border-neutral-300 bg-muted text-[10px] text-muted-foreground dark:border-neutral-700">
                          sin foto
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[320px] text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="truncate">
                          {displayLocation(row)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {row.builtArea ?? "—"} m² · {row.rooms ?? "—"} hab ·{" "}
                          {row.bathrooms ?? "—"} baños ·{" "}
                          {SOURCE_LABEL[row.source] ?? row.source}
                        </span>
                        {partial && (
                          <Badge
                            variant="outline"
                            className="w-fit text-[9px] font-normal"
                          >
                            datos parciales
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{formatPrice(row.price)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatPpm(row.pricePerMeter)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col">
                        <span>{row.advertiserDisplayName ?? "—"}</span>
                        {row.advertiserType && (
                          <span className="text-[10px] text-muted-foreground">
                            {row.advertiserType === "particular"
                              ? "Particular"
                              : "Agencia"}
                          </span>
                        )}
                        {row.inmovillaContactId && (
                          <Badge
                            variant="secondary"
                            className="mt-0.5 w-fit text-[9px]"
                          >
                            En CRM
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex min-w-[160px] flex-col gap-1">
                        <Badge
                          variant={
                            row.captacionStage === "FAILED"
                              ? "destructive"
                              : row.captacionStage === "PROPERTY_CREATED"
                                ? "secondary"
                                : "outline"
                          }
                          className="w-fit text-[10px]"
                        >
                          {captacionStageLabel(row.captacionStage)}
                        </Badge>
                        {row.inmovillaProspectRef ? (
                          <span className="text-[10px] text-muted-foreground">
                            Ref: {row.inmovillaProspectRef}
                          </span>
                        ) : null}
                        {row.inmovillaPropertyCodOfer != null ? (
                          <span className="text-[10px] text-muted-foreground">
                            Cod: {row.inmovillaPropertyCodOfer}
                          </span>
                        ) : null}
                        {(captacionFeedback[row.id] ?? row.captacionLastError) ? (
                          <span className="text-[10px] text-muted-foreground">
                            {captacionFeedback[row.id] ?? row.captacionLastError}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {relativeTime(row.lastSeenAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          title="Ver anuncio en el portal"
                        >
                          <a
                            href={row.canonicalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => openDetailModal(row)}
                          title="Abrir modal de gestión"
                        >
                          Gestionar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(items.length > 0 || currentPage > 1) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-neutral-50/80 px-3 py-2 dark:bg-neutral-900/40">
              <span className="text-xs text-muted-foreground">
                Mostrando {items.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
                {items.length > 0
                  ? `–${(currentPage - 1) * PAGE_SIZE + items.length}`
                  : ""}
                {meta?.totalEstimated ? ` de ~${meta.totalEstimated}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1 || loading}
                >
                  <ChevronLeft className="mr-1 h-3 w-3" />
                  Anterior
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Página {currentPage}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={goToNextPage}
                  disabled={!cursor || loading}
                >
                  Siguiente
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Detalle y gestión de oportunidad</DialogTitle>
            <DialogDescription>
              Asigna comercial y ejecuta acciones de CRM/captación sin saturar la
              tabla.
            </DialogDescription>
          </DialogHeader>

          {selectedListing ? (
            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
                <div>
                  {selectedListing.mainImageUrl ? (
                    <img
                      src={selectedListing.mainImageUrl}
                      alt={`Anuncio ${selectedListing.id}`}
                      className="h-40 w-full rounded object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                      sin foto
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-2 text-sm">
                  <p className="font-medium">{displayLocation(selectedListing)}</p>
                  <p className="text-muted-foreground">
                    {selectedListing.city} · {selectedListing.zone ?? "Sin zona"} ·{" "}
                    {SOURCE_LABEL[selectedListing.source] ?? selectedListing.source}
                  </p>
                  <p className="text-muted-foreground">
                    {selectedListing.builtArea ?? "—"} m² ·{" "}
                    {selectedListing.rooms ?? "—"} hab ·{" "}
                    {selectedListing.bathrooms ?? "—"} baños
                  </p>
                  <p className="font-medium">
                    {formatPrice(selectedListing.price)} ·{" "}
                    {formatPpm(selectedListing.pricePerMeter)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={
                        selectedListing.captacionStage === "FAILED"
                          ? "destructive"
                          : selectedListing.captacionStage === "PROPERTY_CREATED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {captacionStageLabel(selectedListing.captacionStage)}
                    </Badge>
                    {selectedListing.listingReference ? (
                      <Badge variant="outline">
                        Ref. anuncio: {selectedListing.listingReference}
                      </Badge>
                    ) : null}
                    {selectedListing.cadastralRef ? (
                      <Badge variant="outline">
                        Catastral: {selectedListing.cadastralRef}
                      </Badge>
                    ) : null}
                    {selectedListing.inmovillaProspectRef ? (
                      <Badge variant="outline">
                        Inmovilla ref: {selectedListing.inmovillaProspectRef}
                      </Badge>
                    ) : null}
                    {selectedListing.inmovillaPropertyCodOfer != null ? (
                      <Badge variant="outline">
                        Cod: {selectedListing.inmovillaPropertyCodOfer}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Galeria de fotos del inmueble (URLs originales del portal). */}
              {selectedListing.imageUrls && selectedListing.imageUrls.length > 1 ? (
                <div>
                  <Label className="mb-2 block text-xs uppercase text-muted-foreground">
                    Galeria ({selectedListing.imageUrls.length} fotos)
                  </Label>
                  <div className="flex gap-2 overflow-x-auto rounded-lg bg-muted/25 p-2">
                    {selectedListing.imageUrls.slice(0, 24).map((url, idx) => (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        onClick={() =>
                          openLightbox(selectedListing.imageUrls!, idx)
                        }
                        className="group relative block h-24 w-32 flex-shrink-0 overflow-hidden rounded border border-transparent transition-all hover:border-emerald-400 hover:shadow-md"
                        title="Ver foto a tamaño grande"
                      >
                        <img
                          src={url}
                          alt={`Foto ${idx + 1}`}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                          <ZoomIn className="h-4 w-4" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Descripcion completa de la ficha (extraida via fetch-detail). */}
              {selectedListing.description ? (
                <div>
                  <Label className="mb-1 block text-xs uppercase text-muted-foreground">
                    Descripcion
                  </Label>
                  <p className="whitespace-pre-line rounded-lg bg-muted/25 p-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
                    {visibleDescription}
                  </p>
                  {hasLongDescription ? (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setDescriptionExpanded((prev) => !prev)
                        }
                      >
                        {descriptionExpanded
                          ? "Ver menos"
                          : "Ver descripcion completa"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : selectedListing.detailFetchedAt ? (
                <p className="text-xs text-muted-foreground">
                  Sin descripcion disponible (la ficha del portal no la expone).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aun no se ha enriquecido el detalle. Se hara automaticamente
                  en proximos minutos.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted/25 p-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Comercial responsable</Label>
                  <select
                    value={selectedListing.assignedComercialId ?? ""}
                    disabled={loadingComerciales || assigningId === selectedListing.id}
                    onChange={(e) =>
                      void assignComercial(
                        selectedListing,
                        e.target.value ? e.target.value : null,
                      )
                    }
                    className="h-9 w-full rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm shadow-sm dark:border-neutral-700/70"
                    title="Asignar comercial responsable"
                  >
                    <option value="">Sin asignar</option>
                    {comerciales.map((comercial) => (
                      <option key={comercial.comercialId} value={comercial.comercialId}>
                        {comercial.comercialNombre}
                      </option>
                    ))}
                  </select>
                  {(assignmentFeedback[selectedListing.id] ??
                    selectedListing.assignedComercialNombre) && (
                    <p className="text-xs text-muted-foreground">
                      {assignmentFeedback[selectedListing.id] ??
                        selectedListing.assignedComercialNombre}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Contacto publicante</Label>
                  <div className="flex h-9 items-center rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm shadow-sm dark:border-neutral-700/70">
                    {selectedListing.phoneCanonical ? (
                      <a
                        href={`tel:${selectedListing.phoneCanonical}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {formatPhone(selectedListing.phoneCanonical)}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Sin teléfono</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedListing.advertiserDisplayName ?? "Publicante no identificado"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  title="Ver anuncio en el portal"
                >
                  <a
                    href={selectedListing.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Ver portal
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant={
                    selectedListing.inmovillaContactId ? "secondary" : "default"
                  }
                  disabled={
                    pushingId === selectedListing.id ||
                    !!selectedListing.inmovillaContactId ||
                    !selectedListing.advertiserId ||
                    !selectedListing.phoneCanonical
                  }
                  onClick={() => void pushToInmovilla(selectedListing)}
                >
                  {pushingId === selectedListing.id ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-3 w-3" />
                  )}
                  {selectedListing.inmovillaContactId ? "En CRM" : "Enviar a CRM"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    selectedListing.captacionStage === "PROSPECT_CREATING" ||
                    selectedListing.captacionStage === "PROPERTY_CREATING" ||
                    mock
                  }
                  onClick={() => openCaptacionModal(selectedListing, "prospecto")}
                >
                  Prospecto
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !(
                      selectedListing.captacionStage === "PROSPECT_CREATED" ||
                      selectedListing.captacionStage === "READY_FOR_PROPERTY" ||
                      selectedListing.captacionStage === "ENCARGO_ATTACHED"
                    ) || mock
                  }
                  onClick={() => openCaptacionModal(selectedListing, "promocion")}
                >
                  Alta propiedad
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={`/platform/captacion?fromListingId=${encodeURIComponent(
                      selectedListing.id,
                    )}`}
                  >
                    <FileText className="mr-2 h-3 w-3" />
                    Nota de encargo
                  </a>
                </Button>
              </div>

              {(pushFeedback[selectedListing.id] ??
                captacionFeedback[selectedListing.id] ??
                selectedListing.captacionLastError) && (
                <div className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground">
                  {pushFeedback[selectedListing.id] ??
                    captacionFeedback[selectedListing.id] ??
                    selectedListing.captacionLastError}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Selecciona una propiedad.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={captacionModalOpen} onOpenChange={setCaptacionModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {captacionModalMode === "prospecto"
                ? "Crear prospecto en Inmovilla"
                : "Dar de alta propiedad en Inmovilla"}
            </DialogTitle>
            <DialogDescription>
              Completa solo los campos faltantes. Si dejas un campo vacío, se
              intentará usar el dato ya capturado en la oportunidad.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>key_loca (ciudad)</Label>
              <Input
                value={captacionForm.keyLoca}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, keyLoca: e.target.value }))
                }
                placeholder="Ej. 368799"
              />
            </div>
            <div className="space-y-1">
              <Label>key_tipo</Label>
              <Input
                value={captacionForm.keyTipo}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, keyTipo: e.target.value }))
                }
                placeholder="Ej. 3399"
              />
            </div>
            <div className="space-y-1">
              <Label>key_zona (opcional)</Label>
              <Input
                value={captacionForm.keyZona}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, keyZona: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Precio inmobiliaria</Label>
              <Input
                value={captacionForm.precioInmo}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({
                    ...prev,
                    precioInmo: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Habitaciones</Label>
              <Input
                value={captacionForm.habitaciones}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({
                    ...prev,
                    habitaciones: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Baños</Label>
              <Input
                value={captacionForm.banyos}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, banyos: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Calle</Label>
              <Input
                value={captacionForm.calle}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, calle: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Número</Label>
              <Input
                value={captacionForm.numero}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, numero: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Planta</Label>
              <Input
                value={captacionForm.planta}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, planta: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Título (opcional en alta)</Label>
              <Input
                value={captacionForm.tituloes}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, tituloes: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Descripción (opcional en alta)</Label>
              <Textarea
                value={captacionForm.descripciones}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({
                    ...prev,
                    descripciones: e.target.value,
                  }))
                }
                rows={4}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Fotos (una URL por línea)</Label>
              <Textarea
                value={captacionForm.fotosText}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, fotosText: e.target.value }))
                }
                rows={4}
                placeholder="https://.../foto1.jpg&#10;https://.../foto2.jpg"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCaptacionModalOpen(false)}
              disabled={captacionSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={() => void submitCaptacionAction()} disabled={captacionSubmitting}>
              {captacionSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ejecutando...
                </>
              ) : captacionModalMode === "prospecto" ? (
                "Crear prospecto"
              ) : (
                "Dar de alta propiedad"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[95vh] overflow-hidden border-0 bg-black/95 p-0 shadow-2xl sm:max-w-[95vw]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Visor de fotos</DialogTitle>
            <DialogDescription>
              Usa las flechas del teclado o los botones para navegar. Pulsa Esc
              para cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex h-[90vh] w-full items-center justify-center">
            {lightboxImages.length > 0 ? (
              <img
                src={lightboxImages[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1} de ${lightboxImages.length}`}
                className="max-h-[90vh] max-w-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : null}

            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              <X className="h-5 w-5" />
            </button>

            {lightboxImages.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={lightboxPrev}
                  className="absolute left-3 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80"
                  aria-label="Foto anterior"
                  title="Anterior (←)"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={lightboxNext}
                  className="absolute right-3 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80"
                  aria-label="Foto siguiente"
                  title="Siguiente (→)"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium tabular-nums text-white">
                  {lightboxIndex + 1} / {lightboxImages.length}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={mapOpen} onOpenChange={setMapOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-2 border-l-0 p-0 sm:max-w-[820px]"
        >
          <SheetHeader className="border-b p-4">
            <SheetTitle>Filtrar por zona</SheetTitle>
            <SheetDescription>
              Haz clic en el mapa para ir anadiendo puntos. Cuando tengas al
              menos 3, pulsa <strong>Cerrar area</strong> (o doble clic) y la
              lista se filtrara solo con anuncios dentro de esa zona.
            </SheetDescription>
          </SheetHeader>
          <div className="relative flex-1">
            {mapOpen && (
              <ZoneMap
                polygon={polygon}
                onPolygonChange={(p) => {
                  setPolygon(p);
                  if (p && p.length >= 3) {
                    // Cerramos el sheet automaticamente al confirmar el area.
                    setTimeout(() => setMapOpen(false), 250);
                  }
                }}
                markers={markers}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
