"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  ExternalLink,
  FileText,
  Home,
  Loader2,
  MapPin,
  Mic,
  Phone,
  Plus,
  Search,
  Square,
  User,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CrearVisitaDialog } from "@/app/platform/visitas/crear-visita-dialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { VisitPropertyGallery } from "@/app/platform/visitas/visit-property-gallery";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type VisitStatus =
  | "INCOMPLETE"
  | "PENDING_SCHEDULE"
  | "SCHEDULED"
  | "COMPLETED"
  | "DECIDED_GREEN"
  | "DECIDED_YELLOW"
  | "DECIDED_RED"
  | "CANCELLED";

type VisitDecision = "green" | "yellow" | "red";
type VoiceCapturePhase = "idle" | "recording" | "transcribing";
type VisitTab = "ALL" | "TODAY" | "SCHEDULED" | "DONE" | "DOCUMENTED";

type VisitPropertySnapshot = {
  propertyId: string;
  source: "internal" | "external";
  title: string;
  reference: string;
  cadastralReference: string | null;
  address: string;
  city: string | null;
  zone: string | null;
  price: number | null;
  rooms: number | null;
  metersBuilt: number | null;
  portalUrl: string | null;
  interestedAt: string;
};

type VisitContactSnapshot = {
  kind: string;
  name: string | null;
  phones: string[];
  source: string;
  missingContactPhone: boolean;
};

type ParteVisitaTrace = {
  state:
    | "PENDING"
    | "FORMULARIO_ENVIADO"
    | "FORMULARIO_COMPLETADO"
    | "FIRMA_ENVIADA"
    | "FIRMADA"
    | "DOCUMENTO_ENVIADO"
    | "CANCELADA";
  documentUrl: string | null;
  signedDocumentUrl: string | null;
  updatedAt: string;
};

type VisitWorkItemDto = {
  id: string;
  demandId: string;
  draftDemandId: string | null;
  selectionId: string | null;
  propertyId: string;
  draftPropertyId: string | null;
  propertySource: string;
  comercialId: string;
  buyerName: string;
  buyerPhone: string;
  propertySnapshot: VisitPropertySnapshot;
  contactSnapshot: VisitContactSnapshot;
  nluSummary: string;
  status: VisitStatus;
  scheduledSessionId: string | null;
  scheduledSlotStart: string | null;
  scheduledSlotEnd: string | null;
  missingContactPhone: boolean;
  createdAt: string;
  updatedAt: string;
  source: "work_item" | "legacy_interest";
  parteVisita?: ParteVisitaTrace | null;
};

type ApiResponse = {
  ok: boolean;
  workItems: VisitWorkItemDto[];
  legacyFallback?: boolean;
};

type VisitActivityItem = {
  id: string;
  title: string;
  subtitle?: string;
  timestamp?: string | null;
  highlighted?: boolean;
};

const statusLabel: Record<VisitStatus, string> = {
  INCOMPLETE: "Incompleta",
  PENDING_SCHEDULE: "Pendiente de horario",
  SCHEDULED: "Agendada",
  COMPLETED: "Realizada",
  DECIDED_GREEN: "Va a comprar",
  DECIDED_YELLOW: "Busca diferente",
  DECIDED_RED: "Dar de baja",
  CANCELLED: "Cancelada",
};

const parteVisitaStatusLabel: Record<ParteVisitaTrace["state"], string> = {
  PENDING: "Pendiente de envío",
  FORMULARIO_ENVIADO: "Formulario enviado",
  FORMULARIO_COMPLETADO: "Formulario completado",
  FIRMA_ENVIADA: "Firma enviada",
  FIRMADA: "Firmada",
  DOCUMENTO_ENVIADO: "Documento enviado",
  CANCELADA: "Cancelada",
};

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

function formatMadridSlot(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  if (!map.year || !map.month || !map.day || !map.hour || !map.minute) return null;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
}

function formatMoney(value: number | null): string {
  if (value === null) return "Precio no disponible";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function isMadridToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const visitDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return today === visitDay;
}

function formatMadridDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatMadridTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatRelativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "hace menos de 1 min";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

/** IDs internos (cuid, etc.) que no deben mostrarse al comercial en la UI. */
function isOpaqueInternalId(value: string | null | undefined): boolean {
  const id = value?.trim();
  if (!id) return false;
  if (/^c[a-z0-9]{20,}$/i.test(id)) return true;
  if (id.length >= 16 && /[a-z]/i.test(id) && !/^\d+$/.test(id)) return true;
  return false;
}

function visitBuyerDisplayName(
  item: Pick<VisitWorkItemDto, "buyerName" | "demandId" | "draftDemandId">,
): string {
  const name = item.buyerName?.trim();
  if (name) return name;
  if (item.draftDemandId) return "Comprador provisional";
  const ref = item.demandId?.trim();
  if (ref && !isOpaqueInternalId(ref)) return ref;
  return "Comprador";
}

/** Código de demanda legible (p. ej. Inmovilla); null si es un ID interno. */
function visitDemandReference(
  item: Pick<VisitWorkItemDto, "demandId" | "draftDemandId">,
): string | null {
  if (item.draftDemandId) return null;
  const ref = item.demandId?.trim();
  if (!ref || isOpaqueInternalId(ref)) return null;
  return ref;
}

function buildVisitActivity(item: VisitWorkItemDto): VisitActivityItem[] {
  const items: VisitActivityItem[] = [];

  if (item.scheduledSlotStart) {
    const slotLabel = isMadridToday(item.scheduledSlotStart)
      ? `Visita agendada para hoy a las ${formatMadridTime(item.scheduledSlotStart) ?? "--:--"}`
      : `Visita agendada para ${formatMadridDateTime(item.scheduledSlotStart) ?? "sin fecha"}`;
    items.push({
      id: "visit_scheduled",
      title: slotLabel,
      subtitle: visitBuyerDisplayName(item),
      timestamp: item.scheduledSlotStart,
      highlighted: true,
    });
  }

  if (item.parteVisita) {
    const pending = item.parteVisita.state === "PENDING";
    items.push({
      id: "parte_visita",
      title: pending
        ? "Parte de visita pendiente de envío"
        : `Parte de visita: ${parteVisitaStatusLabel[item.parteVisita.state]}`,
      subtitle: pending ? "En espera tras la visita" : "Estado actualizado",
      timestamp: item.parteVisita.updatedAt,
    });
  }

  items.push({
    id: "contacto_inicial",
    title: `Contacto inicial con ${contactLabel(item.contactSnapshot).toLowerCase()}`,
    subtitle: item.contactSnapshot.name ?? "Sin nombre",
    timestamp: item.createdAt,
  });

  items.push({
    id: "demanda_vinculada",
    title: "Demanda vinculada al comprador",
    subtitle: visitBuyerDisplayName(item),
    timestamp: item.createdAt,
  });

  return items;
}

function propertyMeta(property: VisitPropertySnapshot): string {
  return [
    property.rooms !== null ? `${property.rooms} hab.` : null,
    property.metersBuilt !== null ? `${property.metersBuilt} m2` : null,
    formatMoney(property.price),
  ].filter(Boolean).join(" · ");
}

function contactLabel(contact: VisitContactSnapshot): string {
  if (contact.kind === "agencia") return "Agencia";
  if (contact.kind === "propietario") return "Propietario";
  if (contact.kind === "anunciante") return "Anunciante";
  return "Contacto";
}

function statusVariant(status: VisitStatus): StatusBadgeVariant {
  if (status === "INCOMPLETE" || status === "DECIDED_RED") return "danger";
  if (status === "PENDING_SCHEDULE") return "warning";
  if (status === "SCHEDULED" || status === "COMPLETED") return "info";
  if (status === "DECIDED_GREEN") return "success";
  if (status === "DECIDED_YELLOW") return "warning";
  if (status === "CANCELLED") return "neutral";
  return "neutral";
}

function VisitListItem({
  item,
  isSelected,
  onClick,
}: {
  item: VisitWorkItemDto;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-xl border p-5 text-left transition-all duration-200",
        isSelected
          ? "border-primary/40 bg-primary/[0.04] shadow-md ring-1 ring-primary/20"
          : "border-border/40 bg-card hover:border-primary/30 hover:bg-accent/40 hover:shadow-sm",
      )}
    >
      <div className="space-y-2">
        <p className="font-medium leading-snug text-foreground">
          {visitBuyerDisplayName(item)}
        </p>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {item.propertySnapshot.title}
        </p>
        <StatusBadge variant={statusVariant(item.status)} className="w-fit">
          {statusLabel[item.status]}
        </StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{propertyMeta(item.propertySnapshot)}</span>
      </div>
      {item.scheduledSlotStart ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <Clock className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">{formatMadridDateTime(item.scheduledSlotStart)}</span>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.source === "legacy_interest" ? (
          <Badge variant="outline" className="text-[10px]">
            Legacy
          </Badge>
        ) : null}
        {item.draftDemandId ? (
          <Badge variant="outline" className="text-[10px]">
            Demanda provisional
          </Badge>
        ) : null}
        {item.draftPropertyId ? (
          <Badge variant="outline" className="text-[10px]">
            Propiedad provisional
          </Badge>
        ) : null}
        {item.parteVisita ? (
          <Badge variant="secondary" className="text-[10px]">
            {parteVisitaStatusLabel[item.parteVisita.state]}
          </Badge>
        ) : null}
      </div>
      {item.missingContactPhone ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3" />
          <span>Falta teléfono de contacto</span>
        </div>
      ) : null}
    </button>
  );
}

function VisitDetailSection({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function ActivityTimeline({ items }: { items: VisitActivityItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((activity, index) => (
        <div key={activity.id} className="relative pl-6">
          {index !== items.length - 1 ? (
            <span className="absolute left-[7px] top-4 h-[calc(100%+0.5rem)] w-px bg-border" />
          ) : null}
          <span
            className={cn(
              "absolute left-0 top-1.5 size-3.5 rounded-full border-2",
              activity.highlighted
                ? "border-primary bg-primary"
                : "border-muted-foreground/40 bg-background",
            )}
          />
          <div>
            <p className="text-sm font-medium">{activity.title}</p>
            {activity.subtitle ? <p className="text-sm text-muted-foreground">{activity.subtitle}</p> : null}
            {activity.timestamp ? (
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                {formatRelativeAge(activity.timestamp)} · {formatMadridDateTime(activity.timestamp)}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function makeMockItems(): VisitWorkItemDto[] {
  const now = new Date().toISOString();
  const base: VisitWorkItemDto = {
    id: "mock-pending-1",
    demandId: "DEM-MOCK-1",
    draftDemandId: null,
    selectionId: "SEL-MOCK-1",
    propertyId: "PROP-MOCK-1",
    draftPropertyId: null,
    propertySource: "external",
    comercialId: "com-mock",
    buyerName: "Laura Compradora",
    buyerPhone: "34600111222",
    propertySnapshot: {
      propertyId: "PROP-MOCK-1",
      source: "external",
      title: "Piso reformado en Centro",
      reference: "PROP-MOCK-1",
      cadastralReference: null,
      address: "Calle Ejemplo 12, Cordoba",
      city: "Cordoba",
      zone: "Centro",
      price: 245000,
      rooms: 3,
      metersBuilt: 92,
      portalUrl: "https://example.com/prop-mock-1",
      interestedAt: now,
    },
    contactSnapshot: {
      kind: "agencia",
      name: "Agencia Externa",
      phones: ["34666777888"],
      source: "microsite_json",
      missingContactPhone: false,
    },
    nluSummary: "Le encaja por zona y habitaciones; quiere confirmar estado de reforma.",
    status: "PENDING_SCHEDULE",
    scheduledSessionId: null,
    scheduledSlotStart: null,
    scheduledSlotEnd: null,
    missingContactPhone: false,
    createdAt: now,
    updatedAt: now,
    source: "work_item",
  };
  return [
    base,
    { ...base, id: "mock-scheduled-1", status: "SCHEDULED", scheduledSessionId: "visit-session-mock" },
    { ...base, id: "mock-completed-1", status: "COMPLETED", scheduledSessionId: "visit-session-mock-2" },
    { ...base, id: "mock-green-1", status: "DECIDED_GREEN" },
    { ...base, id: "mock-yellow-1", status: "DECIDED_YELLOW" },
    { ...base, id: "mock-red-1", status: "DECIDED_RED" },
    {
      id: "mock-incomplete-1",
      demandId: "DEM-MOCK-2",
      draftDemandId: null,
      selectionId: "SEL-MOCK-2",
      propertyId: "PROP-MOCK-2",
      draftPropertyId: null,
      propertySource: "internal",
      comercialId: "com-mock",
      buyerName: "Carlos Sin Telefono",
      buyerPhone: "34600999888",
      propertySnapshot: {
        propertyId: "PROP-MOCK-2",
        source: "internal",
        title: "Atico con terraza",
        reference: "URUS-MOCK-2",
        cadastralReference: "1234567UG4913S",
        address: "Zona Norte, Cordoba",
        city: "Cordoba",
        zone: "Norte",
        price: 310000,
        rooms: 2,
        metersBuilt: 80,
        portalUrl: null,
        interestedAt: now,
      },
      contactSnapshot: {
        kind: "propietario",
        name: null,
        phones: [],
        source: "property_current",
        missingContactPhone: true,
      },
      nluSummary: "Quiere visitarlo por terraza, pero falta telefono del propietario.",
      status: "INCOMPLETE",
      scheduledSessionId: null,
      scheduledSlotStart: null,
      scheduledSlotEnd: null,
      missingContactPhone: true,
      createdAt: now,
      updatedAt: now,
      source: "work_item",
    },
  ];
}

export function VisitasClient() {
  const searchParams = useSearchParams();
  const useMock = searchParams.get("mock") === "1" || searchParams.get("uiMock") === "1";
  const initialVisitId = searchParams.get("visitId") ?? "";
  const [items, setItems] = useState<VisitWorkItemDto[]>([]);
  const [activeTab, setActiveTab] = useState<VisitTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedId, setSelectedId] = useState(initialVisitId);
  const [fecha, setFecha] = useState(tomorrow());
  const [horaInicio, setHoraInicio] = useState("10:00");
  const [horaFin, setHoraFin] = useState("11:00");
  const [notas, setNotas] = useState("");
  const [postVisitContext, setPostVisitContext] = useState("");
  const [showYellowContext, setShowYellowContext] = useState(false);
  const [postVisitVoicePhase, setPostVisitVoicePhase] = useState<VoiceCapturePhase>("idle");
  const [postVisitVoiceError, setPostVisitVoiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deciding, setDeciding] = useState<VisitDecision | null>(null);
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const postVisitRecorderRef = useRef<MediaRecorder | null>(null);
  const postVisitChunksRef = useRef<BlobPart[]>([]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const selectedActivity = useMemo(
    () => (selected ? buildVisitActivity(selected) : []),
    [selected],
  );
  const filteredItems = useMemo(
    () => (showCancelled ? items : items.filter((item) => item.status !== "CANCELLED")),
    [items, showCancelled],
  );
  const todaysVisits = useMemo(
    () =>
      filteredItems.filter((item) => {
        const slot = item.scheduledSlotStart ?? item.scheduledSlotEnd;
        return isMadridToday(slot);
      }),
    [filteredItems],
  );
  const completedVisits = useMemo(
    () =>
      filteredItems.filter((item) =>
        [
          "COMPLETED",
          "DECIDED_GREEN",
          "DECIDED_YELLOW",
          "DECIDED_RED",
        ].includes(item.status),
      ),
    [filteredItems],
  );
  const documentedVisits = useMemo(
    () =>
      filteredItems.filter(
        (item) =>
          Boolean(item.parteVisita?.documentUrl) ||
          Boolean(item.parteVisita?.signedDocumentUrl) ||
          item.parteVisita?.state === "DOCUMENTO_ENVIADO",
      ),
    [filteredItems],
  );
  const pendingScheduleVisits = useMemo(
    () =>
      filteredItems.filter((item) =>
        ["PENDING_SCHEDULE", "INCOMPLETE"].includes(item.status),
      ),
    [filteredItems],
  );
  const scheduledVisits = useMemo(
    () => filteredItems.filter((item) => item.status === "SCHEDULED"),
    [filteredItems],
  );
  const visibleItems = useMemo(() => {
    let filtered = filteredItems;
    if (activeTab === "TODAY") filtered = todaysVisits;
    else if (activeTab === "SCHEDULED") filtered = scheduledVisits;
    else if (activeTab === "DONE") filtered = completedVisits;
    else if (activeTab === "DOCUMENTED") filtered = documentedVisits;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((item) => 
        (item.buyerName && item.buyerName.toLowerCase().includes(q)) ||
        (item.buyerPhone && item.buyerPhone.includes(q)) ||
        (item.contactSnapshot.name && item.contactSnapshot.name.toLowerCase().includes(q)) ||
        item.contactSnapshot.phones.some((p) => p.includes(q)) ||
        (item.propertySnapshot.title && item.propertySnapshot.title.toLowerCase().includes(q)) ||
        (item.propertySnapshot.reference && item.propertySnapshot.reference.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [
    activeTab,
    todaysVisits,
    scheduledVisits,
    completedVisits,
    documentedVisits,
    filteredItems,
    searchQuery,
  ]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return visibleItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [visibleItems, currentPage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (useMock) {
        const mockItems = makeMockItems();
        setItems(mockItems);
        setSelectedId((current) => {
          if (initialVisitId && mockItems.some((item) => item.id === initialVisitId)) return initialVisitId;
          if (current && mockItems.some((item) => item.id === current)) return current;
          return "";
        });
        return;
      }

      const params = new URLSearchParams({ limit: "100" });
      for (const key of ["visitId", "demandId", "selectionId", "propertyId", "propertyCode"]) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }

      const response = await fetch(`/api/visitas?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.ok) throw new Error("No se pudieron cargar las visitas pendientes");

      setItems(data.workItems);
      setSelectedId((current) => {
        if (initialVisitId && data.workItems.some((item) => item.id === initialVisitId)) return initialVisitId;
        if (current && data.workItems.some((item) => item.id === current)) return current;
        return "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando visitas");
    } finally {
      setLoading(false);
    }
  }, [initialVisitId, searchParams, useMock]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    return () => {
      const rec = postVisitRecorderRef.current;
      if (rec && rec.state === "recording") {
        rec.stop();
      }
      postVisitRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  // Sincroniza los inputs del detalle (fecha/horaInicio/horaFin) con la visita seleccionada.
  // Antes, estos inputs conservaban los valores por defecto (tomorrow() y 10:00�11:00) aunque
  // la visita ya estuviera agendada para otra fecha/hora, lo que daba la sensación de que el
  // sistema "movía" la visita al guardar. Ahora, al cambiar de visita seleccionada, el detalle
  // muestra siempre el slot real de la visita en Europe/Madrid.
  useEffect(() => {
    if (!selected) {
      setFecha(tomorrow());
      setHoraInicio("10:00");
      setHoraFin("11:00");
      return;
    }
    const startSlot = formatMadridSlot(selected.scheduledSlotStart);
    const endSlot = formatMadridSlot(selected.scheduledSlotEnd);
    if (startSlot && endSlot) {
      setFecha(startSlot.date);
      setHoraInicio(startSlot.time);
      setHoraFin(endSlot.time);
    } else {
      setFecha(tomorrow());
      setHoraInicio("10:00");
      setHoraFin("11:00");
    }
  }, [selected]);

  function hasVisitEnded(item: VisitWorkItemDto): boolean {
    if (item.status === "COMPLETED") return true;
    if (!item.scheduledSlotEnd) return false;
    const endMs = Date.parse(item.scheduledSlotEnd);
    return Number.isFinite(endMs) && endMs <= now;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError("Selecciona una visita por programar.");
      return;
    }
    if (horaInicio >= horaFin) {
      setError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }
    if (selected.source === "legacy_interest" && selected.id.startsWith("legacy:")) {
      setError("Esta visita viene de datos legacy. Actualiza la lista o abre una visita pre-creada para agendar por visitId.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/visitas/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: selected.source === "work_item" ? selected.id : undefined,
          demandId: selected.demandId || undefined,
          propertyId: selected.propertyId || undefined,
          fecha,
          horaInicio,
          horaFin,
          notas,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        calendar?: { link?: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo agendar la visita");
      }
      setSuccess(
        data.calendar?.link
          ? `Visita agendada. Calendario: ${data.calendar.link}`
          : "Visita agendada. El Flow de parte de visita quedo programado.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error agendando visita");
    } finally {
      setSubmitting(false);
    }
  };

  const reschedule = async () => {
    if (!selected || selected.source !== "work_item") {
      setError("Selecciona una visita pre-creada para reprogramar.");
      return;
    }
    if (horaInicio >= horaFin) {
      setError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }
    setRescheduling(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/visitas/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: selected.id,
          demandId: selected.demandId || undefined,
          propertyId: selected.propertyId || undefined,
          fecha,
          horaInicio,
          horaFin,
          notas,
          allowReschedule: true,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        calendar?: { link?: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo reprogramar la visita");
      }
      setSuccess(
        data.calendar?.link
          ? `Visita reprogramada. Calendario: ${data.calendar.link}`
          : "Visita reprogramada correctamente.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reprogramando visita");
    } finally {
      setRescheduling(false);
    }
  };

  const cancelVisit = async () => {
    if (!selected || selected.source !== "work_item") {
      setError("Selecciona una visita pre-creada para cancelar.");
      return;
    }

    setCancelling(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/visitas/${selected.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: notas?.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo cancelar la visita");
      }
      setSuccess("Visita cancelada correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cancelando visita");
    } finally {
      setCancelling(false);
    }
  };

  const decide = async (decision: VisitDecision) => {
    if (!selected || selected.source !== "work_item") {
      setError("Selecciona una visita pre-creada para registrar la decision.");
      return;
    }
    setDeciding(decision);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/visitas/${selected.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes: notas,
          reason: notas,
          postVisitContext: decision === "yellow" ? postVisitContext : undefined,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        operacion?: { codigo?: string; existing?: boolean };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo registrar la decision");
      }
      const label =
        decision === "green"
          ? `Va a comprar${data.operacion?.codigo ? `: ${data.operacion.codigo}` : ""}`
          : decision === "yellow"
            ? "Búsqueda reactivada con el nuevo contexto"
            : "Demanda dada de baja";
      setSuccess(`Decision registrada. ${label}.`);
      if (decision === "yellow") {
        setPostVisitContext("");
        setShowYellowContext(false);
        setPostVisitVoiceError(null);
        setPostVisitVoicePhase("idle");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error registrando decision");
    } finally {
      setDeciding(null);
    }
  };

  const selectedVisitHasEnded = selected ? hasVisitEnded(selected) : false;
  const isRecordingPostVisitContext = postVisitVoicePhase === "recording";
  const isTranscribingPostVisitContext = postVisitVoicePhase === "transcribing";

  const stopPostVisitRecording = useCallback(() => {
    const rec = postVisitRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
    }
    postVisitRecorderRef.current = null;
  }, []);

  const startPostVisitRecording = useCallback(async () => {
    setPostVisitVoiceError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPostVisitVoiceError("Tu navegador no soporta grabación de audio.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      postVisitChunksRef.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) postVisitChunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void (async () => {
          const blob = new Blob(postVisitChunksRef.current, { type: mime });
          postVisitChunksRef.current = [];
          if (blob.size === 0) {
            setPostVisitVoiceError("No se capturó audio.");
            setPostVisitVoicePhase("idle");
            return;
          }
          setPostVisitVoicePhase("transcribing");
          try {
            const form = new FormData();
            form.append("audio", blob, "visita-post-context.webm");
            form.append("language", "es");
            const response = await fetch("/api/stt/transcribe", {
              method: "POST",
              body: form,
            });
            const data = (await response.json()) as { text?: string; error?: string };
            if (!response.ok) {
              setPostVisitVoiceError(data.error ?? "Error al transcribir");
              setPostVisitVoicePhase("idle");
              return;
            }
            if (typeof data.text === "string" && data.text.trim()) {
              const transcript = data.text.trim();
              setPostVisitContext((current) => {
                if (!current.trim()) return transcript;
                return `${current.trim()}\n${transcript}`;
              });
            }
            setPostVisitVoicePhase("idle");
          } catch {
            setPostVisitVoiceError("Error de red al transcribir.");
            setPostVisitVoicePhase("idle");
          }
        })();
      };
      postVisitRecorderRef.current = rec;
      rec.start();
      setPostVisitVoicePhase("recording");
    } catch {
      setPostVisitVoiceError("No se pudo acceder al micrófono.");
      setPostVisitVoicePhase("idle");
    }
  }, []);

  const selectedCanSchedule = Boolean(
    selected && (selected.status === "PENDING_SCHEDULE" || selected.status === "INCOMPLETE"),
  );
  const selectedCanManageSchedule = Boolean(
    selected &&
      selected.source === "work_item" &&
      selected.status === "SCHEDULED" &&
      Boolean(selected.scheduledSessionId) &&
      !selectedVisitHasEnded,
  );
  const selectedCanReschedule = selectedCanManageSchedule;
  const selectedCanCancel = selectedCanManageSchedule;
  const selectedCanDecide = Boolean(
    selected &&
    selected.source === "work_item" &&
    (selected.status === "SCHEDULED" || selected.status === "COMPLETED") &&
    selectedVisitHasEnded,
  );
  const selectedIsScheduledButOpen = Boolean(
    selected?.status === "SCHEDULED" && !selectedVisitHasEnded,
  );

  const handleSelectVisit = (item: VisitWorkItemDto) => {
    setSelectedId(item.id);
    setError(null);
    setSuccess(null);
    stopPostVisitRecording();
    setPostVisitVoicePhase("idle");
    setPostVisitVoiceError(null);
    setPostVisitContext("");
    setShowYellowContext(false);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="border-b border-border/60 bg-gradient-to-b from-card to-background">
          <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
            <PageHeader
              title="Visitas"
              description="Gestiona visitas por programar y registra el horario ya coordinado con propietario o agencia."
              breadcrumbs={[{ label: "Inicio", href: "/platform" }, { label: "Visitas" }]}
              actions={
                <Button onClick={() => setManualCreateOpen(true)} disabled={submitting}>
                  <Plus className="mr-2 size-4" />
                  Crear visita manual
                </Button>
              }
            />
          </div>
        </div>

        <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {success ? (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400">
              <CalendarCheck className="size-4 shrink-0" />
              <span>{success}</span>
            </div>
          ) : null}

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Para hoy" value={todaysVisits.length} icon={<Calendar className="size-5" />} />
            <KpiCard
              label="Pendientes de agenda"
              value={pendingScheduleVisits.length}
              icon={<Clock className="size-5" />}
              state={pendingScheduleVisits.length > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="Realizadas / decididas"
              value={completedVisits.length}
              icon={<CalendarCheck className="size-5" />}
            />
            <KpiCard
              label="Con documentación"
              value={documentedVisits.length}
              icon={<FileText className="size-5" />}
              state="default"
            />
          </div>

          <CrearVisitaDialog
            open={manualCreateOpen}
            onOpenChange={setManualCreateOpen}
            useMock={useMock}
            onSuccess={(visitId) => {
              setSuccess("Visita manual creada y agendada correctamente.");
              setSelectedId(visitId);
              void load();
            }}
          />


          <div className="grid gap-6 lg:grid-cols-[minmax(32rem,42%)_minmax(0,1fr)] xl:grid-cols-[minmax(36rem,44%)_minmax(0,1fr)]">
            <Card className="flex min-w-0 flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)]">
              <CardHeader className="shrink-0 space-y-5 px-5 pb-4 pt-5 sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarCheck className="size-5" />
                    Visitas
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCancelled((c) => !c)}
                    className="text-xs"
                  >
                    {showCancelled ? "Ocultar canceladas" : "Ver canceladas"}
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Buscar por nombre, teléfono o referencia..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VisitTab)} className="w-full">
                  <TabsList className="inline-flex h-8 w-full flex-nowrap gap-0.5 p-0.5">
                    <TabsTrigger
                      value="ALL"
                      className="h-7 min-w-0 flex-1 gap-0.5 px-1 py-1 text-[11px] leading-none"
                    >
                      <span className="truncate">Todas</span>
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 shrink-0 px-1 text-[9px] font-semibold leading-none bg-primary/10 text-primary"
                      >
                        {filteredItems.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="TODAY"
                      className="h-7 min-w-0 flex-1 gap-0.5 px-1 py-1 text-[11px] leading-none"
                    >
                      <span className="truncate">Hoy</span>
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 shrink-0 px-1 text-[9px] font-semibold leading-none bg-primary/10 text-primary"
                      >
                        {todaysVisits.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="SCHEDULED"
                      className="h-7 min-w-0 flex-1 gap-0.5 px-1 py-1 text-[11px] leading-none"
                    >
                      <span className="truncate">Agend.</span>
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 shrink-0 px-1 text-[9px] font-semibold leading-none bg-primary/10 text-primary"
                      >
                        {scheduledVisits.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="DONE"
                      className="h-7 min-w-0 flex-1 gap-0.5 px-1 py-1 text-[11px] leading-none"
                    >
                      <span className="truncate">Hechas</span>
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 shrink-0 px-1 text-[9px] font-semibold leading-none bg-primary/10 text-primary"
                      >
                        {completedVisits.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="DOCUMENTED"
                      className="h-7 min-w-0 flex-1 gap-0.5 px-1 py-1 text-[11px] leading-none"
                    >
                      <span className="truncate">Docs</span>
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 shrink-0 px-1 text-[9px] font-semibold leading-none bg-primary/10 text-primary"
                      >
                        {documentedVisits.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full px-5 pb-5 sm:px-6">
                  {loading ? (
                    <div className="space-y-4 pt-2">
                      <Skeleton className="h-32 w-full rounded-xl" />
                      <Skeleton className="h-32 w-full rounded-xl" />
                      <Skeleton className="h-32 w-full rounded-xl" />
                    </div>
                  ) : paginatedItems.length === 0 ? (
                    <EmptyState
                      icon={CalendarCheck}
                      title="Sin visitas"
                      description="No hay visitas para los filtros seleccionados."
                      className="py-12"
                    />
                  ) : (
                    <div className="space-y-4 pt-2">
                      {paginatedItems.map((item) => (
                        <VisitListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedId === item.id}
                          onClick={() => handleSelectVisit(item)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {totalPages > 1 ? (
                  <div className="flex items-center justify-between border-t px-5 py-4 text-sm sm:px-6">
                    <span className="text-muted-foreground">
                      {(currentPage - 1) * ITEMS_PER_PAGE + 1}�
                      {Math.min(currentPage * ITEMS_PER_PAGE, visibleItems.length)} de {visibleItems.length}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalle de visita</CardTitle>
                {selected ? (
                  <CardDescription>
                    {visitBuyerDisplayName(selected)} · {selected.propertySnapshot.title}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>
                {selected ? (
                  <form className="space-y-6" onSubmit={submit}>
                    {selectedCanSchedule || selectedCanReschedule || selectedCanCancel || selectedCanDecide ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                        {selectedCanSchedule ? (
                          <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Agendar y activar Flow
                          </Button>
                        ) : null}
                        {selectedCanReschedule ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={rescheduling || cancelling || submitting}
                            onClick={() => void reschedule()}
                          >
                            {rescheduling ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Reprogramar
                          </Button>
                        ) : null}
                        {selectedCanCancel ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                disabled={cancelling || rescheduling || submitting}
                              >
                                {cancelling ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                Cancelar visita
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Cancelar visita programada?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  ¿Seguro que quieres cancelar esta visita? Esta acción cancela la sesión actual y no se
                                  puede deshacer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Volver</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void cancelVisit()}>Sí, cancelar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                        {selectedCanDecide ? (
                          <>
                            <Separator orientation="vertical" className="h-8" />
                            <span className="text-sm text-muted-foreground">Decisión:</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(deciding)}
                              onClick={() => void decide("green")}
                              className="border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10"
                            >
                              {deciding === "green" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                              Comprará
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(deciding)}
                              onClick={() => {
                                setShowYellowContext(true);
                                setError(null);
                                setSuccess(null);
                                setPostVisitVoiceError(null);
                              }}
                              className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                            >
                              {deciding === "yellow" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                              Busca diferente
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
                                  aria-label="Qué pasará con la demanda si marcas Busca algo diferente"
                                >
                                  <CircleHelp className="size-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                La demanda seguirá activa. El sistema contactará al comprador para entender qué no encajó
                                y qué busca ahora. Con esa información, ajustará la búsqueda y preparará nuevas opciones
                                para revisar.
                              </TooltipContent>
                            </Tooltip>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(deciding)}
                              onClick={() => void decide("red")}
                              className="border-destructive/50 text-destructive hover:bg-destructive/10"
                            >
                              {deciding === "red" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                              Baja
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedCanDecide && showYellowContext ? (
                      <div className="space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="postVisitContext">Contexto para reactivar la búsqueda</Label>
                          {!isRecordingPostVisitContext ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void startPostVisitRecording()}
                              disabled={Boolean(deciding) || isTranscribingPostVisitContext}
                            >
                              {isTranscribingPostVisitContext ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                              ) : (
                                <Mic className="mr-2 size-4" />
                              )}
                              {isTranscribingPostVisitContext ? "Transcribiendo..." : "Dictar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={stopPostVisitRecording}
                              disabled={Boolean(deciding)}
                            >
                              <Square className="mr-2 size-4" />
                              Detener
                            </Button>
                          )}
                        </div>
                        <Textarea
                          id="postVisitContext"
                          value={postVisitContext}
                          onChange={(e) => setPostVisitContext(e.target.value)}
                          placeholder={
                            isRecordingPostVisitContext
                              ? "Grabando... pulsa Detener para transcribir"
                              : isTranscribingPostVisitContext
                                ? "Transcribiendo audio..."
                                : "Ej: Quiere 3 habitaciones, más luz natural y evitar planta baja."
                          }
                          rows={4}
                          maxLength={2000}
                          disabled={isTranscribingPostVisitContext || Boolean(deciding)}
                        />
                        {postVisitVoiceError ? (
                          <p className="text-sm text-destructive">{postVisitVoiceError}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Usa el micrófono para dictar por voz. El texto se usará como contexto para ajustar la búsqueda
                          del comprador.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={Boolean(deciding)}
                            onClick={() => void decide("yellow")}
                          >
                            {deciding === "yellow" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Confirmar y enviar contexto
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={Boolean(deciding)}
                            onClick={() => {
                              stopPostVisitRecording();
                              setPostVisitVoicePhase("idle");
                              setPostVisitVoiceError(null);
                              setShowYellowContext(false);
                              setPostVisitContext("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {selectedIsScheduledButOpen ? (
                      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                        Las acciones post-visita aparecerán cuando termine el horario agendado.
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <VisitDetailSection title="Comprador" icon={User}>
                        <div className="rounded-lg border bg-card p-4">
                          <p className="font-medium">{visitBuyerDisplayName(selected)}</p>
                          {selected.draftDemandId ? (
                            <p className="text-xs text-muted-foreground">Demanda provisional</p>
                          ) : null}
                          <p className="mt-1 text-sm text-muted-foreground">{selected.buyerPhone || "Sin teléfono"}</p>
                          {(() => {
                            const demandRef = visitDemandReference(selected);
                            return demandRef ? (
                              <Badge variant="outline" className="mt-2">
                                Demanda: {demandRef}
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                      </VisitDetailSection>

                      <VisitDetailSection title={contactLabel(selected.contactSnapshot)} icon={Phone}>
                        <div className="rounded-lg border bg-card p-4">
                          <p className="font-medium">{selected.contactSnapshot.name || "Nombre no disponible"}</p>
                          <p
                            className={cn(
                              "mt-1 text-sm",
                              selected.missingContactPhone ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {selected.contactSnapshot.phones.join(", ") || "Teléfono no disponible"}
                          </p>
                        </div>
                      </VisitDetailSection>
                    </div>

                    <VisitDetailSection title="Propiedad" icon={Home}>
                      <div className="rounded-lg border bg-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{selected.propertySnapshot.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Ref: {selected.propertySnapshot.reference}
                              {selected.propertySnapshot.cadastralReference
                                ? ` · Catastral: ${selected.propertySnapshot.cadastralReference}`
                                : null}
                            </p>
                          </div>
                          <Badge variant={selected.propertySnapshot.source === "internal" ? "default" : "secondary"}>
                            {selected.propertySnapshot.source === "internal" ? "Cartera interna" : "Cartera externa"}
                          </Badge>
                        </div>
                        {selected.draftPropertyId ? (
                          <p className="mt-1 text-xs text-muted-foreground">Provisional: {selected.draftPropertyId}</p>
                        ) : null}
                        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-4" />
                          <span>{selected.propertySnapshot.address}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{propertyMeta(selected.propertySnapshot)}</p>
                        {selected.propertySnapshot.portalUrl ? (
                          <a
                            href={selected.propertySnapshot.portalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                          >
                            Ver anuncio
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </VisitDetailSection>

                    {!selected.draftPropertyId ? (
                      <VisitPropertyGallery
                        propertyId={selected.propertyId}
                        propertySource={selected.propertySnapshot.source}
                        selectionId={selected.selectionId}
                        className="rounded-lg border bg-card p-4"
                      />
                    ) : null}

                    <VisitDetailSection title="Motivo de interés" icon={CircleHelp}>
                      <div className="rounded-lg border bg-card p-4">
                        <p className="text-sm text-muted-foreground">
                          {selected.nluSummary || "Sin resumen registrado para esta visita."}
                        </p>
                      </div>
                    </VisitDetailSection>

                    <VisitDetailSection title="Actividad" icon={Clock}>
                      <div className="rounded-lg border bg-card p-4">
                        <ActivityTimeline items={selectedActivity} />
                      </div>
                    </VisitDetailSection>

                    <VisitDetailSection title="Trazabilidad documental" icon={FileText}>
                      <div className="rounded-lg border bg-card p-4">
                        {selected.parteVisita ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Estado:</span>
                              <Badge variant="outline">{parteVisitaStatusLabel[selected.parteVisita.state]}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">�altima actualización:</span>
                              <span>{formatMadridDateTime(selected.parteVisita.updatedAt) ?? "�"}</span>
                            </div>
                            <div className="flex gap-2 pt-2">
                              {selected.parteVisita.documentUrl ? (
                                <a
                                  href={selected.parteVisita.documentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                                >
                                  Ver documento
                                  <ExternalLink className="size-3.5" />
                                </a>
                              ) : null}
                              {selected.parteVisita.signedDocumentUrl ? (
                                <a
                                  href={selected.parteVisita.signedDocumentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                                >
                                  Ver firmado
                                  <ExternalLink className="size-3.5" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Todavía no hay sesión documental asociada a esta visita.
                          </p>
                        )}
                      </div>
                    </VisitDetailSection>

                    <Separator />

                    <div className="space-y-4">
                      <h3 className="font-semibold">Programación</h3>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="fecha">Fecha</Label>
                          <DatePicker
                            id="fecha"
                            value={fecha}
                            onChange={setFecha}
                            placeholder="Elegir fecha"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="horaInicio">Hora inicio</Label>
                          <Input
                            id="horaInicio"
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="horaFin">Hora fin</Label>
                          <Input id="horaFin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notas">Notas internas</Label>
                        <Textarea
                          id="notas"
                          value={notas}
                          onChange={(e) => setNotas(e.target.value)}
                          placeholder="Ej: propietario confirma llaves, agencia externa abre portal..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CalendarCheck className="size-12 text-muted-foreground/30" />
                    <p className="mt-4 text-sm text-muted-foreground">
                      Selecciona una visita de la lista para ver los detalles.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
