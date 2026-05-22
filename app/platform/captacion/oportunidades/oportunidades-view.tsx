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
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Bath,
  BedDouble,
  CheckCircle2,
  Clock3,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  Filter,
  Loader2,
  MapPin,
  MoreHorizontal,
  Phone,
  PhoneCall,
  RefreshCw,
  Ruler,
  Search,
  UserPlus,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { proxiedStatefoxImageUrl } from "@/lib/statefox/image-url";
import type {
  ClusterPortalEntry,
  LngLat,
  ListingOpportunity,
  ListingsApiResponse,
} from "./types";
import { MOCK_LISTINGS } from "./mock";

/**
 * Shape devuelto por `GET/POST /api/market/properties/search`.
 * Lo aplanamos a `ListingOpportunity` con `toListingOpportunity` para mantener
 * la UI existente (que muta acciones por listing) sin reescribirla entera.
 */
interface PropertyClusterApiItem {
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
  portals: ClusterPortalEntry[];
  representativePrice: number | null;
  representativePricePerMeter: number | null;
  minPrice: number | null;
  maxPrice: number | null;
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
  captacionStage: ListingOpportunity["captacionStage"];
  captacionTag: ListingOpportunity["captacionTag"];
  inmovillaProspectRef: string | null;
  inmovillaPropertyCodOfer: number | null;
  captacionLastError: string | null;
  captacionUpdatedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

function toListingOpportunity(c: PropertyClusterApiItem): ListingOpportunity {
  const representativePortal =
    c.portals.find((p) => p.listingId === c.representativeListingId) ??
    c.portals[0]!;
  return {
    id: c.representativeListingId,
    propertyId: c.propertyId,
    clustered: c.clustered,
    portals: c.portals,
    minPrice: c.minPrice,
    maxPrice: c.maxPrice,
    priceSpreadPct: c.priceSpreadPct,
    source: representativePortal.source,
    operation: c.operation,
    housingType: c.housingType,
    status: representativePortal.status,
    canonicalUrl: representativePortal.canonicalUrl,
    addressApprox: c.addressApprox,
    city: c.city,
    zone: c.zone,
    lat: c.lat,
    lng: c.lng,
    builtArea: c.builtArea,
    rooms: c.rooms,
    bathrooms: c.bathrooms,
    floor: c.floor,
    price: c.representativePrice,
    pricePerMeter: c.representativePricePerMeter,
    currency: "EUR",
    mainImageUrl: c.mainImageUrl,
    imageUrls: c.imageUrls,
    description: c.description,
    listingReference: c.listingReference,
    cadastralRef: c.cadastralRef,
    detailFetchedAt: c.detailFetchedAt,
    phoneCanonical: c.phoneCanonical,
    advertiserId: c.advertiserId,
    advertiserDisplayName: c.advertiserDisplayName,
    advertiserType: c.advertiserType,
    inmovillaContactId: c.inmovillaContactId,
    assignedComercialId: c.assignedComercialId,
    assignedComercialNombre: c.assignedComercialNombre,
    assignedAt: c.assignedAt,
    captacionStage: c.captacionStage,
    captacionTag: c.captacionTag ?? null,
    inmovillaProspectRef: c.inmovillaProspectRef,
    inmovillaPropertyCodOfer: c.inmovillaPropertyCodOfer,
    captacionLastError: c.captacionLastError,
    captacionUpdatedAt: c.captacionUpdatedAt,
    firstSeenAt: c.firstSeenAt,
    lastSeenAt: c.lastSeenAt,
  };
}

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

const toolbarBtnClass =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1";

const POLLING_INTERVAL_MS = 90_000;
const DESCRIPTION_COLLAPSE_CHARS = 900;
const VIEW_STATE_STORAGE_KEY_BASE = "captacion:oportunidades:view-state:v2";

interface OportunidadesViewStateSnapshot {
  city: string;
  advertiserType: string;
  hasPhone: boolean;
  sinceHours: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  roomsMin: string;
  portalFilter: PortalFilter;
  operationFilter: OperationFilter;
  filterPanelOpen: boolean;
  polygon: LngLat[] | null;
  mapOpen: boolean;
  items: ListingOpportunity[];
  cursor: string | null;
  meta: ListingsApiResponse["meta"] | null;
  pageInputCursors: (string | null)[];
  currentPage: number;
  autoRefresh: boolean;
  secondsToRefresh: number;
  prospectActorUserId: string | null;
  scrollY: number;
}

function readViewStateSnapshot(
  storageKey: string,
): OportunidadesViewStateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as OportunidadesViewStateSnapshot;
  } catch {
    return null;
  }
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

/**
 * Normaliza una etiqueta de ciudad/zona para comparación tolerante a acentos,
 * separadores (`_`, `-`) y sufijos de portal (`_capital`, `_provincia`...).
 * Espejo cliente de `normalizeCityForCatalog` (lib/inmovilla/rest/catalogs.ts).
 */
const LOCA_SUFFIXES = ["capital", "provincia", "municipio", "ciudad", "pueblo"];
function normalizeLocaLabel(value: string | null | undefined): string {
  if (!value) return "";
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!ascii) return "";
  return ascii
    .split(" ")
    .filter((p) => p && !LOCA_SUFFIXES.includes(p))
    .join(" ")
    .trim();
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

type CaptacionTag = "CONTACTADO" | "EN_ESPERA" | "RECHAZADO" | "CAPTADO";
const CAPTACION_TAG_OPTIONS: Array<{
  value: CaptacionTag;
  label: string;
  icon: typeof PhoneCall;
  variant: "info" | "warning" | "danger" | "success";
}> = [
  { value: "CONTACTADO", label: "Contactado", icon: PhoneCall, variant: "info" },
  { value: "EN_ESPERA", label: "En espera", icon: Clock3, variant: "warning" },
  { value: "RECHAZADO", label: "Rechazado", icon: XCircle, variant: "danger" },
  { value: "CAPTADO", label: "Captado", icon: CheckCircle2, variant: "success" },
];

const CAPTACION_TAG_META: Record<CaptacionTag, (typeof CAPTACION_TAG_OPTIONS)[number]> =
  CAPTACION_TAG_OPTIONS.reduce(
    (acc, option) => ({ ...acc, [option.value]: option }),
    {} as Record<CaptacionTag, (typeof CAPTACION_TAG_OPTIONS)[number]>,
  );

function captacionTagLabel(tag: CaptacionTag): string {
  return CAPTACION_TAG_META[tag].label;
}

function CaptacionTagBadge({ tag }: { tag: CaptacionTag }) {
  const meta = CAPTACION_TAG_META[tag];
  const Icon = meta.icon;
  return (
    <StatusBadge variant={meta.variant} className="w-fit text-[10px]">
      <Icon className="h-3 w-3" />
      {meta.label}
    </StatusBadge>
  );
}

function parseCaptacionTag(value: string): CaptacionTag | null {
  return CAPTACION_TAG_OPTIONS.some((option) => option.value === value)
    ? (value as CaptacionTag)
    : null;
}

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

interface CaptacionTagResponse {
  ok: boolean;
  status?: "TAG_ASSIGNED" | "TAG_CLEARED";
  tag?: CaptacionTag | null;
  error?: { message?: string };
}

/**
 * Estado del formulario de captación (crear prospecto / dar de alta).
 *
 * Decisiones de UX:
 * - `keyLoca` y `keyTipo` (numéricos técnicos) NO se piden al comercial. El
 *   backend ya los resuelve solos desde `listing.city` y `listing.housingType`
 *   (catálogo Inmovilla sincronizado en Neon).
 * - `keyZona` se pide vía un Select humano con nombre de zona; si el comercial
 *   no elige nada, el backend intenta resolverla por `listing.zone`.
 * - Las fotos del portal se envían automáticamente desde el backend (a partir
 *   de `listing.imageUrls`), por lo que no aparece un textarea de URLs.
 */
interface CaptacionFormState {
  keyZona: string;
  calle: string;
  numero: string;
  planta: string;
  precioInmo: string;
  habitaciones: string;
  banyos: string;
  tituloes: string;
  descripciones: string;
}

const EMPTY_CAPTACION_FORM: CaptacionFormState = {
  keyZona: "",
  calle: "",
  numero: "",
  planta: "",
  precioInmo: "",
  habitaciones: "",
  banyos: "",
  tituloes: "",
  descripciones: "",
};

interface ZonaCatalogItem {
  keyZona: number;
  zona: string;
}

interface ProspectScopeConfig {
  enabled: boolean;
  canChooseActor: boolean;
  actorUserId: string | null;
}

interface OportunidadesViewProps {
  mock: boolean;
  mode?: "oportunidades" | "prospectos";
  prospectScope?: ProspectScopeConfig;
}

const PROSPECT_PIPELINE_STAGES: CaptacionStage[] = [
  "PROSPECT_CREATED",
  "ENCARGO_ATTACHED",
  "READY_FOR_PROPERTY",
];

export function OportunidadesView({
  mock,
  mode = "oportunidades",
  prospectScope = { enabled: false, canChooseActor: false, actorUserId: null },
}: OportunidadesViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromListingId = searchParams.get("fromListingId");
  const fromPropertyId = searchParams.get("fromPropertyId");
  const deepLinkAction = searchParams.get("openCaptacion");
  const isProspectView = mode === "prospectos";
  const viewStorageKey = `${VIEW_STATE_STORAGE_KEY_BASE}:${mode}`;
  const [city, setCity] = useState("");
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
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [tagFeedback, setTagFeedback] = useState<Record<string, string>>({});
  const [prospectActorUserId, setProspectActorUserId] = useState<string | null>(
    prospectScope.actorUserId ?? null,
  );
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
  // Catálogo de zonas para la ciudad del listing seleccionado. Se carga
  // bajo demanda al abrir el modal y se usa para que el comercial elija la
  // zona por nombre (lugar humano) en lugar de un key_zona numérico.
  const [zonasCatalog, setZonasCatalog] = useState<ZonaCatalogItem[]>([]);
  const [zonasLoading, setZonasLoading] = useState(false);
  const [zonasError, setZonasError] = useState<string | null>(null);
  const [zonasCity, setZonasCity] = useState<string | null>(null);
  type ReverseGeocodeState =
    | { status: "idle" }
    | { status: "loading"; listingId: string }
    | {
        status: "ready";
        listingId: string;
        street: string | null;
        streetNumber: string | null;
        postalCode: string | null;
        formattedAddress: string | null;
      }
    | { status: "unavailable"; listingId: string; reason: string }
    | { status: "error"; listingId: string; message: string };
  const [geocode, setGeocode] = useState<ReverseGeocodeState>({ status: "idle" });
  const geocodeRequestRef = useRef<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailListingId, setDetailListingId] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false);
  const deepLinkHandledRef = useRef<string | null>(null);
  const skipFirstAutofetchRef = useRef(false);
  const lastFetchRef = useRef<number>(0);

  const persistViewState = useCallback(() => {
    if (typeof window === "undefined") return;
    const snapshot: OportunidadesViewStateSnapshot = {
      city,
      advertiserType,
      hasPhone,
      sinceHours,
      priceMin,
      priceMax,
      areaMin,
      roomsMin,
      portalFilter,
      operationFilter,
      filterPanelOpen,
      polygon,
      mapOpen,
      items,
      cursor,
      meta,
      pageInputCursors,
      currentPage,
      autoRefresh,
      secondsToRefresh,
      prospectActorUserId,
      scrollY: window.scrollY,
    };
    window.sessionStorage.setItem(viewStorageKey, JSON.stringify(snapshot));
  }, [
    city,
    advertiserType,
    hasPhone,
    sinceHours,
    priceMin,
    priceMax,
    areaMin,
    roomsMin,
    portalFilter,
    operationFilter,
    filterPanelOpen,
    polygon,
    mapOpen,
    items,
    cursor,
    meta,
    pageInputCursors,
    currentPage,
    autoRefresh,
    secondsToRefresh,
    prospectActorUserId,
    viewStorageKey,
  ]);

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
        if (isProspectView) body.captacionStages = PROSPECT_PIPELINE_STAGES;
        const effectiveProspectActorUserId = prospectScope.canChooseActor
          ? prospectActorUserId
          : prospectScope.actorUserId;
        if (isProspectView && effectiveProspectActorUserId) {
          body.prospectSentByUserId = effectiveProspectActorUserId;
        }

        const response = await fetch("/api/market/properties/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const raw = (await response.json().catch(() => ({}))) as
          | {
              ok: true;
              items: PropertyClusterApiItem[];
              cursor: string | null;
              meta: ListingsApiResponse["meta"];
            }
          | { ok: false; error?: { message?: string } };
        if (!response.ok || !("ok" in raw) || !raw.ok) {
          const msg =
            "error" in raw && raw.error?.message
              ? raw.error.message
              : `HTTP ${response.status}`;
          setError(msg);
          return;
        }
        const items = raw.items.map(toListingOpportunity);
        setMeta(raw.meta);
        setCursor(raw.cursor);
        setItems((prev) => {
          if (append) return [...prev, ...items];
          // Detectar IDs nuevos para resaltar (cuando es refresco automatico).
          if (autoRefresh && prev.length > 0) {
            const prevIds = new Set(prev.map((p) => p.id));
            const fresh = items.find((i) => !prevIds.has(i.id));
            if (fresh) {
              setHighlightId(fresh.id);
              setTimeout(() => setHighlightId(null), 4_000);
            }
          }
          return items;
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
      isProspectView,
      prospectActorUserId,
      prospectScope.actorUserId,
      prospectScope.canChooseActor,
    ],
  );

  useEffect(() => {
    const snapshot = readViewStateSnapshot(viewStorageKey);
    if (!snapshot) {
      setHydratedFromStorage(true);
      return;
    }
    const hasDeepLinkTarget = Boolean(fromListingId || fromPropertyId);
    const shouldRefetchAfterHydration =
      hasDeepLinkTarget || snapshot.items.length === 0;
    skipFirstAutofetchRef.current = !shouldRefetchAfterHydration;
    setCity(snapshot.city);
    setAdvertiserType(snapshot.advertiserType);
    setHasPhone(snapshot.hasPhone);
    setSinceHours(snapshot.sinceHours);
    setPriceMin(snapshot.priceMin);
    setPriceMax(snapshot.priceMax);
    setAreaMin(snapshot.areaMin);
    setRoomsMin(snapshot.roomsMin);
    setPortalFilter(snapshot.portalFilter);
    setOperationFilter(snapshot.operationFilter);
    setFilterPanelOpen(snapshot.filterPanelOpen);
    setPolygon(snapshot.polygon);
    setMapOpen(snapshot.mapOpen);
    setItems(snapshot.items);
    setCursor(snapshot.cursor);
    setMeta(snapshot.meta);
    setPageInputCursors(snapshot.pageInputCursors);
    setCurrentPage(snapshot.currentPage);
    setAutoRefresh(snapshot.autoRefresh);
    setSecondsToRefresh(snapshot.secondsToRefresh);
    setProspectActorUserId(snapshot.prospectActorUserId ?? null);
    lastFetchRef.current = shouldRefetchAfterHydration ? 0 : Date.now();
    requestAnimationFrame(() => window.scrollTo(0, snapshot.scrollY));
    setHydratedFromStorage(true);
  }, [viewStorageKey, fromListingId, fromPropertyId]);

  useEffect(() => {
    if (!hydratedFromStorage) return;
    if (skipFirstAutofetchRef.current) {
      skipFirstAutofetchRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPageInputCursors([null]);
      setCurrentPage(1);
      void fetchListings(false, null);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydratedFromStorage,
    city,
    portalFilter,
    advertiserType,
    operationFilter,
    hasPhone,
    sinceHours,
    priceMin,
    priceMax,
    areaMin,
    roomsMin,
    polygon,
  ]);

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
    if (!hydratedFromStorage) return;
    persistViewState();
  }, [hydratedFromStorage, persistViewState]);

  useEffect(() => {
    return () => {
      persistViewState();
    };
  }, [persistViewState]);

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
  const prospectActorOptions = useMemo(() => {
    const byUser = new Map<string, string>();
    for (const comercial of comerciales) {
      if (!byUser.has(comercial.userId)) {
        byUser.set(comercial.userId, comercial.userName || comercial.comercialNombre);
      }
    }
    return Array.from(byUser.entries()).map(([userId, userName]) => ({
      userId,
      userName,
    }));
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
    if (city.trim().length > 0) n++;
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

  const clearAllFilters = useCallback(() => {
    setCity("");
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

  async function assignCaptacionTag(
    row: ListingOpportunity,
    nextTag: CaptacionTag | null,
  ) {
    if (row.captacionTag === nextTag) return;

    if (mock) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === row.id ? { ...it, captacionTag: nextTag } : it,
        ),
      );
      setTagFeedback((prev) => ({
        ...prev,
        [row.id]: nextTag
          ? `Etiqueta: ${captacionTagLabel(nextTag)} (mock)`
          : "Etiqueta eliminada (mock)",
      }));
      return;
    }

    const previousTag = row.captacionTag;
    setTaggingId(row.id);
    setTagFeedback((prev) => ({ ...prev, [row.id]: "" }));
    setItems((prev) =>
      prev.map((it) =>
        it.id === row.id ? { ...it, captacionTag: nextTag } : it,
      ),
    );

    try {
      const response = await fetch(`/api/market/listings/${row.id}/captacion-tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: nextTag }),
      });
      const body = (await response.json().catch(() => ({}))) as CaptacionTagResponse;

      if (!response.ok || !body.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === row.id ? { ...it, captacionTag: previousTag } : it,
          ),
        );
        setTagFeedback((prev) => ({
          ...prev,
          [row.id]: body.error?.message ?? `HTTP ${response.status}`,
        }));
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === row.id ? { ...it, captacionTag: body.tag ?? null } : it,
        ),
      );
      const resolvedTag = body.tag ?? null;
      setTagFeedback((prev) => ({
        ...prev,
        [row.id]:
          body.status === "TAG_CLEARED"
            ? "Etiqueta eliminada"
            : resolvedTag
              ? `Etiqueta: ${captacionTagLabel(resolvedTag)}`
              : "Etiqueta actualizada",
      }));
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === row.id ? { ...it, captacionTag: previousTag } : it,
        ),
      );
      setTagFeedback((prev) => ({
        ...prev,
        [row.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setTaggingId(null);
    }
  }

  /**
   * Obtiene la dirección postal estructurada del listing a partir de su
   * (lat, lng) usando Google Geocoding (server-side). Auto-rellena Calle y
   * Número en el form si están vacíos. Si la API no devuelve nada útil,
   * deja el formulario tal cual y muestra el estado en la UI.
   */
  const loadReverseGeocodeForListing = useCallback(
    async (row: ListingOpportunity) => {
      if (row.lat == null || row.lng == null) {
        setGeocode({
          status: "unavailable",
          listingId: row.id,
          reason: "NO_COORDS",
        });
        return;
      }

      geocodeRequestRef.current = row.id;
      setGeocode({ status: "loading", listingId: row.id });

      try {
        const response = await fetch(
          `/api/market/listings/${encodeURIComponent(row.id)}/reverse-geocode`,
        );
        if (geocodeRequestRef.current !== row.id) return;

        if (!response.ok) {
          setGeocode({
            status: "error",
            listingId: row.id,
            message: `HTTP ${response.status}`,
          });
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          result?: {
            street: string | null;
            streetNumber: string | null;
            postalCode: string | null;
            formattedAddress: string | null;
          } | null;
          reason?: string;
          error?: { message?: string };
        };

        if (geocodeRequestRef.current !== row.id) return;

        if (!payload.ok || !payload.result) {
          setGeocode({
            status: "unavailable",
            listingId: row.id,
            reason: payload.reason ?? "NO_RESULT",
          });
          return;
        }

        setGeocode({
          status: "ready",
          listingId: row.id,
          street: payload.result.street,
          streetNumber: payload.result.streetNumber,
          postalCode: payload.result.postalCode,
          formattedAddress: payload.result.formattedAddress,
        });

        setCaptacionForm((prev) => {
          const next = { ...prev };
          if (!prev.calle.trim() && payload.result?.street) {
            next.calle = payload.result.street;
          }
          if (!prev.numero.trim() && payload.result?.streetNumber) {
            next.numero = payload.result.streetNumber;
          }
          return next;
        });
      } catch (error) {
        if (geocodeRequestRef.current !== row.id) return;
        setGeocode({
          status: "error",
          listingId: row.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [],
  );

  function openCaptacionModal(
    row: ListingOpportunity,
    mode: "prospecto" | "promocion",
  ) {
    setDetailModalOpen(false);
    setCaptacionTarget(row);
    setCaptacionModalMode(mode);
    setCaptacionForm({
      keyZona: "",
      calle: row.addressApprox ?? "",
      numero: "",
      planta: row.floor ?? "",
      precioInmo: row.price != null ? String(row.price) : "",
      habitaciones: row.rooms != null ? String(row.rooms) : "",
      banyos: row.bathrooms != null ? String(row.bathrooms) : "",
      tituloes: "",
      descripciones: "",
    });
    setGeocode({ status: "idle" });
    setCaptacionModalOpen(true);
    void loadZonasForCity(row.city);
    void loadReverseGeocodeForListing(row);
  }

  /**
   * Carga el catálogo de zonas de Inmovilla para la ciudad del listing
   * activo. Si la ciudad ya está cargada se reutiliza la cache local. Si la
   * ciudad no existe en el catálogo (404) se deja `zonasCatalog` vacío sin
   * marcar error: el backend resolverá por nombre o, en su defecto, omitirá
   * `key_zona` del payload.
   */
  const loadZonasForCity = useCallback(async (city: string | null | undefined) => {
    const normalizedCity = (city ?? "").trim();
    if (!normalizedCity) {
      setZonasCatalog([]);
      setZonasError(null);
      setZonasCity(null);
      return;
    }
    if (zonasCity && zonasCity === normalizedCity) return;
    setZonasLoading(true);
    setZonasError(null);
    setZonasCity(normalizedCity);
    try {
      const response = await fetch(
        `/api/market/inmovilla-catalogs/zonas?city=${encodeURIComponent(normalizedCity)}`,
      );
      if (response.status === 404) {
        setZonasCatalog([]);
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: ZonaCatalogItem[];
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok || !Array.isArray(payload.items)) {
        setZonasCatalog([]);
        setZonasError(payload.error?.message ?? `HTTP ${response.status}`);
        return;
      }
      setZonasCatalog(payload.items);
    } catch (error) {
      setZonasCatalog([]);
      setZonasError(error instanceof Error ? error.message : String(error));
    } finally {
      setZonasLoading(false);
    }
  }, [zonasCity]);

  const openDetailModal = useCallback((row: ListingOpportunity) => {
    setDetailListingId(row.id);
    setDetailModalOpen(true);
  }, []);

  // Auto-seleccionar la zona del catálogo Inmovilla cuando coincide con la zona
  // detectada por el portal. Solo aplica si el comercial aún no ha elegido una
  // zona explícitamente (`keyZona` vacío = "Auto-detectar desde el portal").
  useEffect(() => {
    if (!captacionModalOpen) return;
    if (!captacionTarget?.zone) return;
    if (captacionForm.keyZona) return;
    if (zonasCatalog.length === 0) return;

    const targetSlug = normalizeLocaLabel(captacionTarget.zone);
    if (!targetSlug) return;

    const exact = zonasCatalog.find(
      (z) => normalizeLocaLabel(z.zona) === targetSlug,
    );
    const partial =
      exact ??
      zonasCatalog.find((z) => {
        const candidate = normalizeLocaLabel(z.zona);
        return (
          candidate.includes(targetSlug) || targetSlug.includes(candidate)
        );
      });
    if (!partial) return;

    setCaptacionForm((prev) =>
      prev.keyZona
        ? prev
        : { ...prev, keyZona: String(partial.keyZona) },
    );
  }, [
    captacionModalOpen,
    captacionTarget,
    captacionForm.keyZona,
    zonasCatalog,
  ]);

  useEffect(() => {
    if (!hydratedFromStorage) return;
    if (!fromListingId && !fromPropertyId) return;

    const target =
      (fromListingId
        ? items.find((item) => item.id === fromListingId)
        : null) ??
      (fromPropertyId
        ? items.find((item) => item.propertyId === fromPropertyId)
        : null) ??
      null;

    if (!target) return;
    if (deepLinkHandledRef.current === target.id) return;

    if (deepLinkAction === "prospecto") {
      setDetailModalOpen(false);
      setCaptacionTarget(target);
      setCaptacionModalMode("prospecto");
      setCaptacionForm({
        keyZona: "",
        calle: target.addressApprox ?? "",
        numero: "",
        planta: target.floor ?? "",
        precioInmo: target.price != null ? String(target.price) : "",
        habitaciones: target.rooms != null ? String(target.rooms) : "",
        banyos: target.bathrooms != null ? String(target.bathrooms) : "",
        tituloes: "",
        descripciones: "",
      });
      setGeocode({ status: "idle" });
      setCaptacionModalOpen(true);
      void loadZonasForCity(target.city);
      void loadReverseGeocodeForListing(target);
    } else {
      openDetailModal(target);
    }
    deepLinkHandledRef.current = target.id;

    const next = new URLSearchParams(searchParams.toString());
    next.delete("fromListingId");
    next.delete("fromPropertyId");
    next.delete("openCaptacion");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [
    deepLinkAction,
    fromListingId,
    fromPropertyId,
    hydratedFromStorage,
    items,
    loadReverseGeocodeForListing,
    loadZonasForCity,
    openDetailModal,
    pathname,
    router,
    searchParams,
  ]);

  async function submitCaptacionAction() {
    if (!captacionTarget || mock) return;
    setCaptacionSubmitting(true);
    setCaptacionFeedback((prev) => ({ ...prev, [captacionTarget.id]: "" }));
    try {
      // Sólo enviamos lo que el comercial ha tocado o lo que sirve para
      // sobrescribir los defaults del listing. `keyLoca`, `keyTipo` y las
      // fotos los resuelve el backend a partir del listing.
      const body: Record<string, unknown> = {};
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Modo mock:</strong> datos estaticos (no se llama a la API).
          Quita <code className="rounded bg-amber-100 px-1">?mock=1</code> de la URL para datos reales.
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
              className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-white"
              aria-label={`${activeFilterCount} filtros activos`}
            >
              {activeFilterCount > 99 ? "99+" : activeFilterCount}
            </span>
          ) : null}
        </div>

        {isProspectView && prospectScope.canChooseActor ? (
          <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
            <span className="text-xs text-slate-500">Comercial:</span>
            <Select
              value={prospectActorUserId ?? "all"}
              onValueChange={(value) =>
                setProspectActorUserId(value === "all" ? null : value)
              }
            >
              <SelectTrigger className="h-7 w-[180px] border-slate-200 bg-white text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos
                </SelectItem>
                {prospectActorOptions.map((actor) => (
                  <SelectItem
                    key={actor.userId}
                    value={actor.userId}
                    className="text-xs"
                  >
                    {actor.userName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

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
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 h-9 min-w-[200px] max-w-[300px] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Buscar por ciudad..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <Select
            value={portalFilter}
            onValueChange={(v) => setPortalFilter(v as PortalFilter)}
          >
            <SelectTrigger className="h-9 w-[160px] bg-white border-slate-200 hover:border-slate-300">
              <SelectValue placeholder="Todos los portales" />
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

          <Select
            value={operationFilter}
            onValueChange={(v) => setOperationFilter(v as OperationFilter)}
          >
            <SelectTrigger className="h-9 w-[120px] bg-white border-slate-200 hover:border-slate-300">
              <SelectValue placeholder="Operación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sale">Venta</SelectItem>
              <SelectItem value="rent">Alquiler</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 gap-2">
                <Filter className="h-4 w-4" />
                Más filtros
                {activeFilterCount > 3 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 py-0">
                    {activeFilterCount - 3}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Filtros avanzados</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Precio mín (€)</Label>
                    <Input
                      type="number"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      placeholder="Ej. 50000"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Precio máx (€)</Label>
                    <Input
                      type="number"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      placeholder="Ej. 500000"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sup. mín (m²)</Label>
                    <Input
                      type="number"
                      value={areaMin}
                      onChange={(e) => setAreaMin(e.target.value)}
                      placeholder="Ej. 60"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Habitaciones mín</Label>
                    <Select value={roomsMin} onValueChange={setRoomsMin}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Cualquiera" />
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
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ventana temporal</Label>
                  <Select value={sinceHours} onValueChange={setSinceHours}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Cualquier momento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Cualquier momento</SelectItem>
                      <SelectItem value="24">Últimas 24h</SelectItem>
                      <SelectItem value="72">Últimas 72h</SelectItem>
                      <SelectItem value="168">Última semana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Publicante</Label>
                  <Select value={advertiserType} onValueChange={setAdvertiserType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="particular">Particular</SelectItem>
                      <SelectItem value="agency">Agencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hasPhone}
                      onChange={(e) => setHasPhone(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary"
                    />
                    Solo con teléfono
                  </label>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-9 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3 w-3" />
              Limpiar
            </Button>
          )}
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200 rounded-xl shadow-sm bg-white">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 pb-3">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/30 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums text-slate-500">
            <button
              type="button"
              onClick={goToPrevPage}
              disabled={currentPage <= 1 || loading}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              aria-label="Página anterior"
              title="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              {currentPage}
            </span>
            <span className="text-xs text-slate-500">
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
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              aria-label="Página siguiente"
              title="Página siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
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
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}
          {comercialesError && (
            <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
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
                <TableHead>Comercial</TableHead>
                <TableHead>Captacion</TableHead>
                <TableHead>Etiqueta</TableHead>
                <TableHead className="text-right">Visto</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="w-[160px]">
                      <Skeleton className="h-24 w-36 rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-4 w-24 rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-7 w-[120px] rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-7 w-[130px] rounded-md" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12">
                    <EmptyState
                      icon={Search}
                      title="Sin oportunidades"
                      description={
                        polygonActive
                          ? "No se encontraron inmuebles en la zona dibujada con los filtros actuales. Prueba ampliando el área o relajando los filtros."
                          : "No hay anuncios que coincidan con los filtros actuales."
                      }
                      action={
                        <Button variant="outline" onClick={clearAllFilters}>
                          Limpiar filtros
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => {
                  const partial = isPartialDataSource(row.source);
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => openDetailModal(row)}
                      className={`cursor-pointer group hover:bg-slate-50/80 transition-colors ${
                        highlightId === row.id
                          ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                          : ""
                      }`}
                    >
                      <TableCell className="w-[160px]" onClick={(e) => e.stopPropagation()}>
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
                            className="group/img relative block h-24 w-36 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                            title="Ver foto a tamaño grande"
                          >
                            <img
                              src={proxiedStatefoxImageUrl(row.mainImageUrl)}
                              alt={`Anuncio ${row.id}`}
                              className="h-full w-full object-cover transition-transform group-hover/img:scale-105"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover/img:bg-black/30 group-hover/img:opacity-100">
                              <ZoomIn className="h-5 w-5" />
                            </span>
                            {row.imageUrls && row.imageUrls.length > 1 ? (
                              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                +{row.imageUrls.length - 1}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">
                            sin foto
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[320px] text-xs">
                        <div className="flex flex-col gap-1.5">
                          <span className="truncate font-medium">
                            {displayLocation(row)}
                          </span>
                          <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Ruler className="h-3 w-3" />
                              {row.builtArea ?? "—"} m²
                            </span>
                            <span className="flex items-center gap-1">
                              <BedDouble className="h-3 w-3" />
                              {row.rooms ?? "—"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Bath className="h-3 w-3" />
                              {row.bathrooms ?? "—"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {row.portals.map((portal) => (
                              <Badge
                                key={portal.listingId}
                                variant="outline"
                                className="text-[9px] font-normal px-1 py-0 h-4"
                                title={
                                  portal.price != null
                                    ? `${SOURCE_LABEL[portal.source] ?? portal.source}: ${formatPrice(portal.price)}`
                                    : SOURCE_LABEL[portal.source] ?? portal.source
                                }
                              >
                                {SOURCE_LABEL[portal.source] ?? portal.source}
                              </Badge>
                            ))}
                            {row.portals.length > 1 && row.priceSpreadPct != null
                              ? (
                                  <span className="text-[9px] font-medium text-amber-600">
                                    Δ {(row.priceSpreadPct * 100).toFixed(1)}%
                                  </span>
                                )
                              : null}
                          </div>
                          {partial && row.portals.length === 1 && (
                            <Badge
                              variant="outline"
                              className="w-fit text-[9px] font-normal px-1 py-0 h-4 mt-0.5"
                            >
                              datos parciales
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{formatPrice(row.price)}</span>
                        <span className="text-[10px] text-slate-500">
                          {formatPpm(row.pricePerMeter)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">{row.advertiserDisplayName ?? "—"}</span>
                        {row.advertiserType && (
                          <span className="text-[10px] text-slate-500">
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
                      <Select
                        value={row.assignedComercialId ?? "unassigned"}
                        disabled={loadingComerciales || assigningId === row.id}
                        onValueChange={(val) => 
                          void assignComercial(row, val === "unassigned" ? null : val)
                        }
                      >
                        <SelectTrigger className="h-7 w-[120px] bg-white border-slate-200 px-2 text-xs hover:border-slate-300">
                          <SelectValue placeholder="Sin asignar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned" className="text-xs text-muted-foreground">Sin asignar</SelectItem>
                          {comerciales.map((c) => (
                            <SelectItem key={c.comercialId} value={c.comercialId} className="text-xs">
                              {c.comercialNombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(assignmentFeedback[row.id]) && (
                        <p className="mt-1 max-w-[120px] truncate text-[9px] text-slate-500" title={assignmentFeedback[row.id]}>
                          {assignmentFeedback[row.id]}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex min-w-[140px] flex-col gap-1">
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
                          <span className="text-[10px] text-slate-500">
                            Ref: {row.inmovillaProspectRef}
                          </span>
                        ) : null}
                        {row.inmovillaPropertyCodOfer != null ? (
                          <span className="text-[10px] text-slate-500">
                            Cod: {row.inmovillaPropertyCodOfer}
                          </span>
                        ) : null}
                        {(captacionFeedback[row.id] ?? row.captacionLastError) ? (
                          <span className="text-[10px] text-slate-500">
                            {captacionFeedback[row.id] ?? row.captacionLastError}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                      <div className="flex min-w-[130px] flex-col gap-1">
                        <Select
                          value={row.captacionTag ?? "sin_etiqueta"}
                          disabled={taggingId === row.id}
                          onValueChange={(value) =>
                            void assignCaptacionTag(
                              row,
                              value === "sin_etiqueta" ? null : parseCaptacionTag(value),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 w-[130px] bg-white border-slate-200 px-2 text-xs hover:border-slate-300">
                            <SelectValue placeholder="Sin etiqueta" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value="sin_etiqueta"
                              className="text-xs text-muted-foreground"
                            >
                              Sin etiqueta
                            </SelectItem>
                            {CAPTACION_TAG_OPTIONS.map((tagOption) => (
                              <SelectItem
                                key={tagOption.value}
                                value={tagOption.value}
                                className="text-xs"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <tagOption.icon className="h-3 w-3" />
                                  {tagOption.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {row.captacionTag ? (
                          <CaptacionTagBadge tag={row.captacionTag} />
                        ) : null}
                        {tagFeedback[row.id] ? (
                          <p
                            className="max-w-[130px] truncate text-[9px] text-slate-500"
                            title={tagFeedback[row.id]}
                          >
                            {tagFeedback[row.id]}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {relativeTime(row.lastSeenAt)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetailModal(row)}>
                            Gestión rápida
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/platform/market/properties/${encodeURIComponent(row.propertyId)}`}>
                              Ficha completa
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <a href={row.canonicalUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Ver en portal
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            </TableBody>
          </Table>
          {(items.length > 0 || currentPage > 1) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
              <span className="text-xs text-slate-500">
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
                  className="border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                >
                  <ChevronLeft className="mr-1 h-3 w-3" />
                  Anterior
                </Button>
                <span className="text-xs tabular-nums text-slate-600 font-medium">
                  Página {currentPage}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={goToNextPage}
                  disabled={!cursor || loading}
                  className="border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                >
                  Siguiente
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <SheetContent side="right" className="flex w-full flex-col overflow-x-hidden overflow-y-auto p-6 sm:max-w-md md:max-w-2xl border-l border-slate-200 shadow-xl bg-white">
          <SheetHeader className="mb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold text-slate-900">Gestión de oportunidad</SheetTitle>
              {selectedListing && (
                <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-slate-500 hover:text-slate-700">
                  <Link href={`/platform/market/properties/${encodeURIComponent(selectedListing.propertyId)}`}>
                    <ExternalLink className="h-3 w-3" />
                    Ficha completa
                  </Link>
                </Button>
              )}
            </div>
            <SheetDescription className="text-slate-500">
              Asigna comercial y ejecuta acciones de CRM sin perder el listado.
            </SheetDescription>
          </SheetHeader>

          {selectedListing ? (
            <div className="min-w-0 flex flex-col gap-6">
              <div className="space-y-4">
                {selectedListing.mainImageUrl ? (
                  <img
                    src={proxiedStatefoxImageUrl(selectedListing.mainImageUrl)}
                    alt={`Anuncio ${selectedListing.id}`}
                    className="h-48 w-full rounded-xl object-cover border border-slate-200 shadow-sm"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400 border border-slate-200">
                    sin foto
                  </div>
                )}
                
                <div className="min-w-0 space-y-1.5 text-sm p-4 bg-slate-50/50 rounded-xl border border-slate-200">
                  <p className="font-semibold text-base mb-1 text-slate-900">{displayLocation(selectedListing)}</p>
                  <p className="text-slate-500">
                    {selectedListing.city} · {selectedListing.zone ?? "Sin zona"}
                  </p>
                  <p className="text-slate-500">
                    {selectedListing.builtArea ?? "—"} m² ·{" "}
                    {selectedListing.rooms ?? "—"} hab ·{" "}
                    {selectedListing.bathrooms ?? "—"} baños
                  </p>
                  <p className="font-semibold text-base mt-2 text-slate-800">
                    {formatPrice(selectedListing.price)} ·{" "}
                    {formatPpm(selectedListing.pricePerMeter)}
                  </p>
                </div>
              </div>
              
              <div className="min-w-0 space-y-6">
                <div>
                  <Label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Estado e Identificadores</Label>
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
                      <Badge variant="outline">{SOURCE_LABEL[selectedListing.source] ?? selectedListing.source}</Badge>
                      {selectedListing.listingReference ? (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          Ref: {selectedListing.listingReference}
                        </Badge>
                      ) : null}
                      {selectedListing.inmovillaPropertyCodOfer != null ? (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          Cod: {selectedListing.inmovillaPropertyCodOfer}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                <div className="space-y-2">
                  <Label className="block text-xs uppercase tracking-wide text-slate-500">
                    Etiquetas
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={selectedListing.captacionTag ?? "sin_etiqueta"}
                      disabled={taggingId === selectedListing.id}
                      onValueChange={(value) =>
                        void assignCaptacionTag(
                          selectedListing,
                          value === "sin_etiqueta"
                            ? null
                            : parseCaptacionTag(value),
                        )
                      }
                    >
                    <SelectTrigger className="h-9 w-[220px] bg-white border-slate-200 hover:border-slate-300">
                        <SelectValue placeholder="Sin etiqueta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="sin_etiqueta"
                          className="text-xs text-muted-foreground"
                        >
                          Sin etiqueta
                        </SelectItem>
                        {CAPTACION_TAG_OPTIONS.map((tagOption) => (
                          <SelectItem
                            key={tagOption.value}
                            value={tagOption.value}
                            className="text-xs"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <tagOption.icon className="h-3 w-3" />
                              {tagOption.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedListing.captacionTag ? (
                      <CaptacionTagBadge tag={selectedListing.captacionTag} />
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">
                    {tagFeedback[selectedListing.id] || "Marca el estado comercial del contacto para priorizar el seguimiento."}
                  </p>
                </div>

              {/* Galeria de fotos del inmueble (URLs originales del portal). */}
              {selectedListing.imageUrls && selectedListing.imageUrls.length > 1 ? (
                <div>
                  <Label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                    Galeria ({selectedListing.imageUrls.length} fotos)
                  </Label>
                  <div className="flex gap-2 overflow-x-auto rounded-xl bg-slate-50/50 border border-slate-200 p-2.5">
                    {selectedListing.imageUrls.slice(0, 24).map((url, idx) => (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        onClick={() =>
                          openLightbox(selectedListing.imageUrls!, idx)
                        }
                        className="group relative block h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-transparent transition-all hover:border-primary/50 hover:shadow-md"
                        title="Ver foto a tamaño grande"
                      >
                        <img
                          src={proxiedStatefoxImageUrl(url)}
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5 p-4 bg-slate-50/50 rounded-xl border border-slate-200">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Comercial responsable</Label>
                  <select
                    value={selectedListing.assignedComercialId ?? ""}
                    disabled={loadingComerciales || assigningId === selectedListing.id}
                    onChange={(e) =>
                      void assignComercial(
                        selectedListing,
                        e.target.value ? e.target.value : null,
                      )
                    }
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm hover:border-slate-300 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {assignmentFeedback[selectedListing.id] ??
                        selectedListing.assignedComercialNombre}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 p-4 bg-slate-50/50 rounded-xl border border-slate-200">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Contacto publicante</Label>
                  <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm">
                    {selectedListing.phoneCanonical ? (
                      <a
                        href={`tel:${selectedListing.phoneCanonical}`}
                        className="inline-flex items-center gap-2 hover:underline font-medium text-slate-700"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {formatPhone(selectedListing.phoneCanonical)}
                      </a>
                    ) : (
                      <span className="text-slate-400">Sin teléfono</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-slate-500 truncate max-w-[140px]">
                      {selectedListing.advertiserDisplayName ?? "No identificado"}
                    </p>
                    {selectedListing.advertiserType && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 uppercase">
                        {selectedListing.advertiserType === "particular" ? "Particular" : "Agencia"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Descripcion completa de la ficha (extraida via fetch-detail). */}
              {selectedListing.description ? (
                <div>
                  <Label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                    Descripcion original
                  </Label>
                  <div className="relative">
                    <p className="whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm leading-relaxed break-words [overflow-wrap:anywhere] text-slate-600">
                      {visibleDescription}
                    </p>
                    {hasLongDescription && !descriptionExpanded && (
                      <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-slate-50/50 to-transparent pointer-events-none rounded-b-xl" />
                    )}
                  </div>
                  {hasLongDescription ? (
                    <div className="mt-2 text-right">
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
                          ? "Mostrar menos"
                          : "Leer completa"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : selectedListing.detailFetchedAt ? (
                <p className="text-xs text-slate-500 p-3 bg-slate-50/50 rounded-xl border border-slate-200">
                  La ficha en el portal no contenía descripción.
                </p>
              ) : (
                <p className="text-xs text-slate-500 p-3 bg-slate-50/50 rounded-xl border border-slate-200">
                  Cargando descripción detallada en los próximos minutos...
                </p>
              )}
            </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-200">
                {!isProspectView &&
                (selectedListing.captacionStage === "NEW" ||
                  selectedListing.captacionStage === "FAILED") ? (
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={mock}
                    onClick={() => openCaptacionModal(selectedListing, "prospecto")}
                  >
                    Crear Prospecto
                  </Button>
                ) : selectedListing.captacionStage === "PROSPECT_CREATED" || selectedListing.captacionStage === "ENCARGO_ATTACHED" || selectedListing.captacionStage === "READY_FOR_PROPERTY" ? (
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={mock}
                    onClick={() => openCaptacionModal(selectedListing, "promocion")}
                  >
                    Dar de Alta en CRM
                  </Button>
                ) : selectedListing.captacionStage === "PROPERTY_CREATED" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled
                  >
                    Propiedad Activa
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled
                  >
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </Button>
                )}
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-auto sm:ml-0">
                      Más acciones
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem 
                      disabled={
                        pushingId === selectedListing.id ||
                        !!selectedListing.inmovillaContactId ||
                        !selectedListing.advertiserId ||
                        !selectedListing.phoneCanonical
                      }
                      onClick={() => void pushToInmovilla(selectedListing)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      {selectedListing.inmovillaContactId
                        ? "Publicante ya sincronizado"
                        : "Sincronizar publicante en CRM"}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`/platform/captacion?fromListingId=${encodeURIComponent(selectedListing.id)}`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Añadir nota de encargo
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href={selectedListing.canonicalUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Abrir original en portal
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {(pushFeedback[selectedListing.id] ??
                captacionFeedback[selectedListing.id] ??
                selectedListing.captacionLastError) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 mt-4">
                  {pushFeedback[selectedListing.id] ??
                    captacionFeedback[selectedListing.id] ??
                    selectedListing.captacionLastError}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Selecciona una propiedad.</p>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={captacionModalOpen} onOpenChange={setCaptacionModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {captacionModalMode === "prospecto"
                ? "Crear prospecto en Inmovilla"
                : "Dar de alta propiedad en Inmovilla"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Inmovilla recibe los datos ya capturados del portal. Ajusta solo lo
              que quieras sobrescribir antes de enviar.
            </DialogDescription>
          </DialogHeader>

          {captacionTarget && (
            <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <div className="mb-2 font-medium text-slate-800">
                Datos detectados automáticamente
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                <div>
                  <span className="text-slate-500">Ciudad: </span>
                  <span className="font-medium text-slate-800">
                    {captacionTarget.city || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Tipología: </span>
                  <span className="font-medium text-slate-800">
                    {captacionTarget.housingType || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Operación: </span>
                  <span className="font-medium text-slate-800">
                    {captacionTarget.operation || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Zona detectada: </span>
                  <span className="font-medium text-slate-800">
                    {captacionTarget.zone || "—"}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Fotos del portal: </span>
                  <span className="font-medium text-slate-800">
                    {captacionTarget.imageUrls?.length
                      ? `${captacionTarget.imageUrls.length} se enviarán automáticamente`
                      : "sin fotos en el portal"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-slate-700">Zona</Label>
              <Select
                value={captacionForm.keyZona || "__auto__"}
                onValueChange={(v) =>
                  setCaptacionForm((prev) => ({
                    ...prev,
                    keyZona: v === "__auto__" ? "" : v,
                  }))
                }
                disabled={zonasLoading}
              >
                <SelectTrigger className="h-9 bg-white border-slate-200 hover:border-slate-300">
                  <SelectValue
                    placeholder={
                      zonasLoading
                        ? "Cargando zonas..."
                        : "Auto-detectar desde el portal"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">
                    Auto-detectar desde el portal
                  </SelectItem>
                  {zonasCatalog.map((z) => (
                    <SelectItem key={z.keyZona} value={String(z.keyZona)}>
                      {z.zona}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {zonasError ? (
                <p className="text-xs text-red-600">{zonasError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  {zonasLoading
                    ? "Consultando catálogo Inmovilla..."
                    : zonasCatalog.length === 0
                      ? "No hay zonas en el catálogo para esta ciudad; se enviará sin zona."
                      : "Si dejas 'Auto-detectar', se usará la zona del portal cuando coincida con el catálogo."}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Precio inmobiliaria</Label>
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
            <div className="space-y-2">
              <Label className="text-slate-700">Habitaciones</Label>
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
            <div className="space-y-2">
              <Label className="text-slate-700">Baños</Label>
              <Input
                value={captacionForm.banyos}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, banyos: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-slate-700">Calle</Label>
              <Input
                value={captacionForm.calle}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, calle: e.target.value }))
                }
              />
              {geocode.status === "loading" ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Detectando dirección desde la ubicación del mapa…
                </p>
              ) : geocode.status === "ready" && geocode.formattedAddress ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <MapPin className="h-3 w-3 text-primary" />
                  <span className="font-medium text-slate-700">
                    Dirección detectada:
                  </span>
                  <span>{geocode.formattedAddress}</span>
                  {(geocode.street || geocode.streetNumber) && (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() =>
                        setCaptacionForm((prev) => ({
                          ...prev,
                          calle: geocode.street ?? prev.calle,
                          numero: geocode.streetNumber ?? prev.numero,
                        }))
                      }
                    >
                      Usar
                    </button>
                  )}
                </p>
              ) : geocode.status === "unavailable" &&
                geocode.reason === "NO_API_KEY" ? (
                <p className="text-xs text-slate-500">
                  Geocoding no configurado. Define <code className="rounded bg-slate-100 px-1">GOOGLE_MAPS_API_KEY</code>
                  {" "}para autocompletar desde el mapa.
                </p>
              ) : geocode.status === "unavailable" &&
                geocode.reason === "NO_COORDS" ? (
                <p className="text-xs text-slate-500">
                  Este listing no tiene coordenadas en el portal; introduce la
                  calle manualmente.
                </p>
              ) : geocode.status === "error" ? (
                <p className="text-xs text-red-600">
                  No se pudo detectar la dirección ({geocode.message}).
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Número</Label>
              <Input
                value={captacionForm.numero}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, numero: e.target.value }))
                }
              />
              {geocode.status === "ready" && geocode.postalCode ? (
                <p className="text-xs text-slate-500">
                  CP detectado: {geocode.postalCode}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Planta</Label>
              <Input
                value={captacionForm.planta}
                onChange={(e) =>
                  setCaptacionForm((prev) => ({ ...prev, planta: e.target.value }))
                }
              />
            </div>
            {captacionModalMode === "promocion" && (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-700">Título (opcional)</Label>
                  <Input
                    value={captacionForm.tituloes}
                    onChange={(e) =>
                      setCaptacionForm((prev) => ({
                        ...prev,
                        tituloes: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-700">Descripción (opcional)</Label>
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
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCaptacionModalOpen(false)}
              disabled={captacionSubmitting}
              className="border-slate-200 hover:bg-slate-50 hover:border-slate-300"
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
                src={proxiedStatefoxImageUrl(lightboxImages[lightboxIndex] ?? "")}
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
