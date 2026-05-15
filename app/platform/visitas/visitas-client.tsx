"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  CircleHelp,
  ExternalLink,
  Loader2,
  MapPin,
  Mic,
  Phone,
  Plus,
  RefreshCw,
  Square,
  UserRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GlobalPropertySelector, type GlobalPropertyOption } from "@/components/properties/global-property-selector";
import { GlobalDemandSelector, type GlobalDemandOption } from "@/components/demands/global-demand-selector";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

type ManualDemandOption = GlobalDemandOption;

type ManualPropertyOption = GlobalPropertyOption;
type ComercialOption = {
  id: string;
  nombre: string;
  ciudad: string;
  inmovillaAgentId: number | null;
};
type DemandPropertyTypeOption = {
  valor: number;
  nombre: string;
};
type LocalidadOption = {
  key_loca: number;
  ciudad: string;
  provincia: string;
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

function normalizePhoneForInmovillaClientUpdate(phone: string): { telefono1: number; prefijotel1?: number } | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("34")) {
    return { telefono1: Number(digits.slice(2)), prefijotel1: 34 };
  }
  if (digits.length === 9) {
    return { telefono1: Number(digits), prefijotel1: 34 };
  }
  return { telefono1: Number(digits) };
}

function statusVariant(status: VisitStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "INCOMPLETE" || status === "DECIDED_RED") return "destructive";
  if (status === "PENDING_SCHEDULE") return "default";
  if (status === "SCHEDULED" || status === "COMPLETED") return "secondary";
  return "outline";
}

function InlineHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Más información"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-sm text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
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
  const [selectedId, setSelectedId] = useState(initialVisitId);
  const [fecha, setFecha] = useState(tomorrow());
  const [horaInicio, setHoraInicio] = useState("10:00");
  const [horaFin, setHoraFin] = useState("11:00");
  const [manualFecha, setManualFecha] = useState(tomorrow());
  const [manualHoraInicio, setManualHoraInicio] = useState("10:00");
  const [manualHoraFin, setManualHoraFin] = useState("11:00");
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
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualDemands, setManualDemands] = useState<ManualDemandOption[]>([]);
  const [manualProperties, setManualProperties] = useState<ManualPropertyOption[]>([]);
  const [manualComerciales, setManualComerciales] = useState<ComercialOption[]>([]);
  const [manualDemandPropertyTypes, setManualDemandPropertyTypes] = useState<DemandPropertyTypeOption[]>([]);
  const [manualLocalidades, setManualLocalidades] = useState<LocalidadOption[]>([]);
  const [manualDemandMode, setManualDemandMode] = useState<"existing" | "draft">("existing");
  const [manualPropertyMode, setManualPropertyMode] = useState<"existing" | "draft">("existing");
  const [manualDemandAdvancedOpen, setManualDemandAdvancedOpen] = useState(false);
  const [manualPropertyAdvancedOpen, setManualPropertyAdvancedOpen] = useState(false);
  const [manualComercialId, setManualComercialId] = useState("");
  const [manualDemandId, setManualDemandId] = useState("");
  const [manualPropertyId, setManualPropertyId] = useState("");
  const [manualBuyerPhone, setManualBuyerPhone] = useState("");
  const [manualDraftBuyerName, setManualDraftBuyerName] = useState("");
  const [manualDraftBuyerPhone, setManualDraftBuyerPhone] = useState("");
  const [manualDraftDemandPropertyType, setManualDraftDemandPropertyType] = useState("");
  const [manualDraftDemandBudgetMax, setManualDraftDemandBudgetMax] = useState("9999999");
  const [manualDraftOwnerPhone, setManualDraftOwnerPhone] = useState("");
  const [manualDraftCadastralRef, setManualDraftCadastralRef] = useState("");
  const [manualDraftPropertyKeyTipo, setManualDraftPropertyKeyTipo] = useState("");
  const [manualDraftPropertyKeyLoca, setManualDraftPropertyKeyLoca] = useState("");
  const [manualDraftPropertyOperationType, setManualDraftPropertyOperationType] = useState<"VENTA" | "ALQUILER">("VENTA");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const postVisitRecorderRef = useRef<MediaRecorder | null>(null);
  const postVisitChunksRef = useRef<BlobPart[]>([]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const todaysVisits = useMemo(
    () =>
      items.filter((item) => {
        const slot = item.scheduledSlotStart ?? item.scheduledSlotEnd;
        return isMadridToday(slot);
      }),
    [items],
  );
  const completedVisits = useMemo(
    () =>
      items.filter((item) =>
        [
          "COMPLETED",
          "DECIDED_GREEN",
          "DECIDED_YELLOW",
          "DECIDED_RED",
        ].includes(item.status),
      ),
    [items],
  );
  const documentedVisits = useMemo(
    () =>
      items.filter(
        (item) =>
          Boolean(item.parteVisita?.documentUrl) ||
          Boolean(item.parteVisita?.signedDocumentUrl) ||
          item.parteVisita?.state === "DOCUMENTO_ENVIADO",
      ),
    [items],
  );
  const pendingScheduleVisits = useMemo(
    () =>
      items.filter((item) =>
        ["PENDING_SCHEDULE", "INCOMPLETE"].includes(item.status),
      ),
    [items],
  );
  const scheduledVisits = useMemo(
    () => items.filter((item) => item.status === "SCHEDULED"),
    [items],
  );
  const visibleItems = useMemo(() => {
    if (activeTab === "TODAY") return todaysVisits;
    if (activeTab === "SCHEDULED") return scheduledVisits;
    if (activeTab === "DONE") return completedVisits;
    if (activeTab === "DOCUMENTED") return documentedVisits;
    return items;
  }, [
    activeTab,
    todaysVisits,
    scheduledVisits,
    completedVisits,
    documentedVisits,
    items,
  ]);
  const selectedManualDemand = useMemo(
    () => manualDemands.find((demand) => demand.codigo === manualDemandId) ?? null,
    [manualDemands, manualDemandId],
  );
  const selectedManualDemandNeedsPhone = Boolean(
    showManualCreate &&
      manualDemandMode === "existing" &&
      selectedManualDemand &&
      !selectedManualDemand.telefono?.trim(),
  );

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

  // Sincroniza los inputs del detalle (fecha/horaInicio/horaFin) con la visita seleccionada.
  // Antes, estos inputs conservaban los valores por defecto (tomorrow() y 10:00–11:00) aunque
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

  const loadManualOptions = async () => {
    setManualLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/visitas/manual-options?limit=50", { cache: "no-store" });
      const data = (await response.json()) as {
        ok?: boolean;
        demands?: ManualDemandOption[];
        properties?: ManualPropertyOption[];
        comerciales?: ComercialOption[];
        demandPropertyTypes?: DemandPropertyTypeOption[];
        localidades?: LocalidadOption[];
        currentComercialId?: string | null;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No se pudieron cargar demandas/propiedades");
      setManualDemands(data.demands ?? []);
      setManualProperties(data.properties ?? []);
      setManualComerciales(data.comerciales ?? []);
      setManualDemandPropertyTypes(data.demandPropertyTypes ?? []);
      setManualLocalidades(data.localidades ?? []);
      setManualComercialId((current) =>
        current ||
        data.currentComercialId ||
        data.comerciales?.[0]?.id ||
        "",
      );
      setManualDraftDemandPropertyType((current) =>
        current || String(data.demandPropertyTypes?.[0]?.valor ?? "2799"),
      );
      setManualDraftPropertyKeyTipo((current) =>
        current || String(data.demandPropertyTypes?.[0]?.valor ?? ""),
      );
      setManualDraftPropertyKeyLoca((current) =>
        current || String(data.localidades?.[0]?.key_loca ?? ""),
      );
      setManualDemandId((current) =>
        current && data.demands?.some((demand) => demand.codigo === current) ? current : "",
      );
      setManualBuyerPhone((current) => {
        const selectedDemand = data.demands?.find((demand) => demand.codigo === manualDemandId);
        return selectedDemand?.telefono ?? current;
      });
      setManualPropertyId((current) =>
        current && data.properties?.some((property) => property.codigo === current) ? current : "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando opciones manuales");
    } finally {
      setManualLoading(false);
    }
  };

  const searchManualProperties = async (query: string) => {
    if (useMock) return;
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query) params.set("q", query);
      const response = await fetch(`/api/visitas/manual-options?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as {
        ok?: boolean;
        properties?: ManualPropertyOption[];
      };
      if (response.ok && data.ok) {
        setManualProperties(data.properties ?? []);
        setManualPropertyId((current) => {
          if (current && data.properties?.some((property) => property.codigo === current)) return current;
          return "";
        });
      }
    } catch {
      /* keep previous options while the user keeps typing */
    }
  };

  const searchManualDemands = async (query: string) => {
    if (useMock) return;
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query) params.set("q", query);
      const response = await fetch(`/api/visitas/manual-options?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as {
        ok?: boolean;
        demands?: ManualDemandOption[];
      };
      if (response.ok && data.ok) {
        setManualDemands(data.demands ?? []);
        setManualDemandId((current) => {
          if (current && data.demands?.some((demand) => demand.codigo === current)) return current;
          return "";
        });
      }
    } catch {
      /* keep previous options while the user keeps typing */
    }
  };

  const openManualCreate = () => {
    setShowManualCreate((current) => !current);
    if (!showManualCreate && manualDemands.length === 0 && !useMock) {
      void loadManualOptions();
    }
    if (!showManualCreate && useMock) {
      setManualDemands([
        { codigo: "DEM-MOCK-MANUAL", nombre: "Comprador manual", telefono: "34600123456", leadStatus: "NUEVO" },
      ]);
      setManualProperties([
        {
          codigo: "PROP-MOCK-MANUAL",
          ref: "URUS-MANUAL",
          refCatastral: "MOCK-CATASTRAL",
          titulo: "Piso manual mock",
          ciudad: "Cordoba",
          zona: "Centro",
          precio: 220000,
          habitaciones: 3,
          metrosConstruidos: 88,
          mainPhotoUrl: null,
          portalUrl: null,
          propietarioNombre: "Propietaria Mock",
          propietarioPhone: "34666777888",
        },
      ]);
      setManualComerciales([{ id: "com-mock", nombre: "Comercial Mock", ciudad: "Cordoba", inmovillaAgentId: 1 }]);
      setManualDemandPropertyTypes([{ valor: 2799, nombre: "Piso" }]);
      setManualLocalidades([{ key_loca: 1, ciudad: "Cordoba", provincia: "Cordoba" }]);
      setManualDemandId("");
      setManualBuyerPhone("");
      setManualPropertyId("");
      setManualDemandMode("existing");
      setManualPropertyMode("existing");
      setManualDemandAdvancedOpen(false);
      setManualPropertyAdvancedOpen(false);
      setManualComercialId("com-mock");
      setManualDraftBuyerName("");
      setManualDraftBuyerPhone("");
      setManualDraftDemandPropertyType("2799");
      setManualDraftDemandBudgetMax("9999999");
      setManualDraftOwnerPhone("");
      setManualDraftCadastralRef("");
      setManualDraftPropertyKeyTipo("2799");
      setManualDraftPropertyKeyLoca("1");
      setManualDraftPropertyOperationType("VENTA");
    }
  };

  function isValidManualPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  }

  function hasVisitEnded(item: VisitWorkItemDto): boolean {
    if (item.status === "COMPLETED") return true;
    if (!item.scheduledSlotEnd) return false;
    const endMs = Date.parse(item.scheduledSlotEnd);
    return Number.isFinite(endMs) && endMs <= now;
  }

  async function ensureManualDemandPhone(): Promise<void> {
    if (manualDemandMode !== "existing") return;
    if (!selectedManualDemandNeedsPhone) return;
    if (!isValidManualPhone(manualBuyerPhone)) {
      throw new Error("Introduce un teléfono válido para el comprador antes de crear la visita.");
    }
    const phonePatch = normalizePhoneForInmovillaClientUpdate(manualBuyerPhone);
    if (!phonePatch) {
      throw new Error("Introduce un teléfono válido para el comprador antes de crear la visita.");
    }
    const response = await fetch(`/api/demands/${encodeURIComponent(manualDemandId)}/update-client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phonePatch),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      message?: string;
    };
    if (!response.ok || !data.ok) {
      throw new Error(data.message ?? data.error ?? "No se pudo actualizar el teléfono del comprador");
    }
    setManualDemands((prev) =>
      prev.map((demand) =>
        demand.codigo === manualDemandId
          ? { ...demand, telefono: `34${phonePatch.telefono1}` }
          : demand,
      ),
    );
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
    const confirmed = window.confirm(
      "¿Seguro que quieres cancelar esta visita? Esta acción cancela la sesión actual.",
    );
    if (!confirmed) return;

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

  const createManualAndSchedule = async () => {
    const isExistingDemand = manualDemandMode === "existing";
    const isExistingProperty = manualPropertyMode === "existing";
    const hasDemandSelection = isExistingDemand
      ? Boolean(manualDemandId)
      : isValidManualPhone(manualDraftBuyerPhone);
    const hasPropertySelection = isExistingProperty
      ? Boolean(manualPropertyId)
      : isValidManualPhone(manualDraftOwnerPhone) && Boolean(manualDraftCadastralRef.trim());
    if (!hasDemandSelection || !hasPropertySelection || !manualComercialId) {
      setError("Completa demanda y propiedad (existentes o provisionales) para crear la visita manual.");
      return;
    }
    if (manualDemandMode === "draft" && !manualDraftDemandPropertyType) {
      setError("Selecciona tipo de propiedad para la demanda provisional.");
      return;
    }
    if (manualPropertyMode === "draft" && (!manualDraftPropertyKeyTipo || !manualDraftPropertyKeyLoca)) {
      setError("Selecciona tipo y localidad para la propiedad provisional.");
      return;
    }
    if (manualHoraInicio >= manualHoraFin) {
      setError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await ensureManualDemandPhone();
      const createResponse = await fetch("/api/visitas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demandMode: manualDemandMode,
          propertyMode: manualPropertyMode,
          comercialId: manualComercialId,
          demandId: isExistingDemand ? manualDemandId : undefined,
          propertyId: isExistingProperty ? manualPropertyId : undefined,
          buyerName: isExistingDemand ? undefined : manualDraftBuyerName,
          buyerPhone: isExistingDemand ? undefined : manualDraftBuyerPhone,
          demandPropertyType: isExistingDemand ? undefined : manualDraftDemandPropertyType,
          demandBudgetMax: isExistingDemand ? undefined : Number(manualDraftDemandBudgetMax || "0"),
          ownerPhone: isExistingProperty ? undefined : manualDraftOwnerPhone,
          cadastralRef: isExistingProperty ? undefined : manualDraftCadastralRef,
          draftPropertyKeyTipo: isExistingProperty ? undefined : Number(manualDraftPropertyKeyTipo),
          draftPropertyKeyLoca: isExistingProperty ? undefined : Number(manualDraftPropertyKeyLoca),
          draftPropertyOperationType: isExistingProperty ? undefined : manualDraftPropertyOperationType,
          nluSummary: notas || "Visita inicial creada manualmente antes de intervención NLU.",
        }),
      });
      const createData = (await createResponse.json()) as {
        ok?: boolean;
        error?: string;
        workItem?: VisitWorkItemDto;
      };
      if (!createResponse.ok || !createData.ok || !createData.workItem) {
        throw new Error(createData.error ?? "No se pudo crear la visita manual");
      }

      const scheduleResponse = await fetch("/api/visitas/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: createData.workItem.id,
          demandId: createData.workItem.demandId || undefined,
          propertyId: createData.workItem.propertyId || undefined,
          fecha: manualFecha,
          horaInicio: manualHoraInicio,
          horaFin: manualHoraFin,
          notas,
        }),
      });
      const scheduleData = (await scheduleResponse.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!scheduleResponse.ok || !scheduleData.ok) {
        throw new Error(scheduleData.error ?? "Visita creada, pero no se pudo agendar");
      }

      setSuccess("Visita manual creada y agendada correctamente.");
      setShowManualCreate(false);
      setSelectedId(createData.workItem.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando visita manual");
    } finally {
      setSubmitting(false);
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
            ? "Busca algo diferente: NLU reactivado"
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitas</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona visitas por programar y registra el horario ya coordinado con propietario o agencia.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </Button>
        <Button onClick={openManualCreate} disabled={submitting || manualLoading}>
          <Plus className="mr-2 h-4 w-4" />
          Crear visita manual
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-urus-danger/30 bg-urus-danger/10 p-3 text-sm text-urus-danger">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-urus-success/30 bg-urus-success/10 p-3 text-sm text-urus-success">
          {success}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/25 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Para hoy</p>
            <p className="mt-1 text-2xl font-semibold">{todaysVisits.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/25 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendientes de agenda</p>
            <p className="mt-1 text-2xl font-semibold">{pendingScheduleVisits.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/25 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Realizadas / decididas</p>
            <p className="mt-1 text-2xl font-semibold">{completedVisits.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/25 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Con documentación</p>
            <p className="mt-1 text-2xl font-semibold">{documentedVisits.length}</p>
          </CardContent>
        </Card>
      </div>

      {showManualCreate ? (
        <Card className="border-border/25 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Crear visita manualmente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <TooltipProvider>
              <div className="rounded-lg border border-border/50 bg-muted/5 p-4 space-y-2">
                <Label htmlFor="manualComercial">Comercial asignado</Label>
                <select
                  id="manualComercial"
                  className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
                  value={manualComercialId}
                  onChange={(event) => setManualComercialId(event.target.value)}
                  disabled={manualLoading}
                >
                  <option value="">Selecciona comercial</option>
                  {manualComerciales.map((comercial) => (
                    <option key={comercial.id} value={comercial.id}>
                      {comercial.nombre} ({comercial.ciudad})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Se usará este comercial para asignación y promoción en Inmovilla.
                </p>
              </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
              <div className="space-y-4 rounded-xl bg-muted/10 p-4 shadow-inner shadow-background/20">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Modo demanda</Label>
                    <InlineHelp text="Existente: usa una demanda ya creada en Inmovilla. Provisional: arranca la visita solo con teléfono y completa la demanda al enviar firma del Parte de Visita." />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={manualDemandMode === "existing" ? "default" : "outline"}
                      onClick={() => {
                        setManualDemandMode("existing");
                        setManualDemandAdvancedOpen(false);
                      }}
                    >
                      Existente
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={manualDemandMode === "draft" ? "default" : "outline"}
                      onClick={() => {
                        setManualDemandMode("draft");
                        setManualDemandAdvancedOpen(true);
                      }}
                    >
                      Provisional
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Elige si trabajas con una demanda ya existente o una demanda provisional.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Demanda</Label>
                  {manualDemandMode === "existing" ? (
                    <GlobalDemandSelector
                      demands={manualDemands}
                      value={manualDemandId}
                      onChange={(demandId) => {
                        const demand = manualDemands.find((item) => item.codigo === demandId);
                        setManualDemandId(demandId);
                        setManualBuyerPhone(demand?.telefono ?? "");
                      }}
                      onSearch={searchManualDemands}
                      disabled={manualLoading}
                    />
                  ) : (
                    <div className="space-y-2">
                      <Input
                        value={manualDraftBuyerPhone}
                        onChange={(event) => setManualDraftBuyerPhone(event.target.value)}
                        placeholder="Teléfono comprador (obligatorio)"
                      />
                      <Input
                        value={manualDraftBuyerName}
                        onChange={(event) => setManualDraftBuyerName(event.target.value)}
                        placeholder="Nombre comprador (opcional)"
                      />
                      <details
                        className="rounded-md border border-border/50 bg-background"
                        open={manualDemandAdvancedOpen}
                        onToggle={(event) =>
                          setManualDemandAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)
                        }
                      >
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                          Configuración avanzada de demanda
                        </summary>
                        <div className="space-y-2 border-t border-border/40 p-3">
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={manualDraftDemandPropertyType}
                            onChange={(event) => setManualDraftDemandPropertyType(event.target.value)}
                          >
                            <option value="">Tipo de inmueble buscado (obligatorio)</option>
                            {manualDemandPropertyTypes.map((tipo) => (
                              <option key={tipo.valor} value={String(tipo.valor)}>
                                {tipo.nombre}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">
                            Tipo de inmueble que busca el comprador para crear la demanda en Inmovilla.
                          </p>
                          <Input
                            type="number"
                            value={manualDraftDemandBudgetMax}
                            onChange={(event) => setManualDraftDemandBudgetMax(event.target.value)}
                            placeholder="Presupuesto máximo comprador (EUR)"
                          />
                          <p className="text-xs text-muted-foreground">
                            Presupuesto máximo de la demanda provisional. Ejemplo: 250000.
                          </p>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
                {selectedManualDemandNeedsPhone ? (
                  <div className="space-y-2">
                    <Label htmlFor="manualBuyerPhone">Teléfono comprador</Label>
                    <Input
                      id="manualBuyerPhone"
                      value={manualBuyerPhone}
                      onChange={(event) => setManualBuyerPhone(event.target.value)}
                      placeholder="Ej: 600111222"
                    />
                    <p className="text-xs text-urus-warning">
                      Esta demanda no tiene teléfono. Se actualizará en Inmovilla y en Urus antes de crear la visita.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 rounded-xl bg-muted/10 p-4 shadow-inner shadow-background/20">
                <div className="flex items-center gap-2">
                  <Label>Modo propiedad</Label>
                  <InlineHelp text="Existente: selecciona una propiedad ya cargada. Provisional: crea una propiedad prospecto con referencia catastral y se promociona automáticamente en FIRMA_ENVIADA de Nota de Encargo." />
                </div>
                <div className="flex gap-2 pb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={manualPropertyMode === "existing" ? "default" : "outline"}
                    onClick={() => {
                      setManualPropertyMode("existing");
                      setManualPropertyAdvancedOpen(false);
                    }}
                  >
                    Existente
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={manualPropertyMode === "draft" ? "default" : "outline"}
                    onClick={() => {
                      setManualPropertyMode("draft");
                      setManualPropertyAdvancedOpen(true);
                    }}
                  >
                    Provisional
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Elige si la propiedad ya existe o se registrará como prospecto provisional.
                </p>
                {manualPropertyMode === "existing" ? (
                  <GlobalPropertySelector
                    properties={manualProperties}
                    value={manualPropertyId}
                    onChange={setManualPropertyId}
                    onSearch={searchManualProperties}
                    disabled={manualLoading}
                  />
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={manualDraftOwnerPhone}
                      onChange={(event) => setManualDraftOwnerPhone(event.target.value)}
                      placeholder="Teléfono propietario (obligatorio)"
                    />
                    <Input
                      value={manualDraftCadastralRef}
                      onChange={(event) => setManualDraftCadastralRef(event.target.value)}
                      placeholder="Referencia catastral (obligatoria)"
                    />
                    <details
                      className="rounded-md border border-border/50 bg-background"
                      open={manualPropertyAdvancedOpen}
                      onToggle={(event) =>
                        setManualPropertyAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)
                      }
                    >
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                        Configuración avanzada de propiedad
                      </summary>
                      <div className="space-y-2 border-t border-border/40 p-3">
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={manualDraftPropertyOperationType}
                          onChange={(event) => setManualDraftPropertyOperationType(event.target.value as "VENTA" | "ALQUILER")}
                        >
                          <option value="VENTA">Venta</option>
                          <option value="ALQUILER">Alquiler</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Operación del prospecto a crear: venta o alquiler.
                        </p>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={manualDraftPropertyKeyTipo}
                          onChange={(event) => setManualDraftPropertyKeyTipo(event.target.value)}
                        >
                          <option value="">Tipo de inmueble del prospecto (obligatorio)</option>
                          {manualDemandPropertyTypes.map((tipo) => (
                            <option key={tipo.valor} value={String(tipo.valor)}>
                              {tipo.nombre}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Tipo inmobiliario en catálogo Inmovilla (`key_tipo`).
                        </p>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={manualDraftPropertyKeyLoca}
                          onChange={(event) => setManualDraftPropertyKeyLoca(event.target.value)}
                        >
                          <option value="">Localidad del prospecto (obligatoria)</option>
                          {manualLocalidades.map((localidad) => (
                            <option key={localidad.key_loca} value={String(localidad.key_loca)}>
                              {localidad.ciudad} ({localidad.provincia})
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Ciudad/localidad de publicación en Inmovilla (`key_loca`).
                        </p>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[160px_130px_130px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <Label htmlFor="manualFecha">Dia</Label>
                <Input id="manualFecha" type="date" value={manualFecha} onChange={(e) => setManualFecha(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualInicio">Inicio</Label>
                <Input id="manualInicio" type="time" value={manualHoraInicio} onChange={(e) => setManualHoraInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualFin">Fin</Label>
                <Input id="manualFin" type="time" value={manualHoraFin} onChange={(e) => setManualHoraFin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualNotas">Notas</Label>
                <Input id="manualNotas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Contexto interno de la visita" />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => void createManualAndSchedule()}
                  disabled={
                    submitting ||
                    manualLoading ||
                    !manualComercialId ||
                    (manualDemandMode === "existing" && !manualDemandId) ||
                    (manualDemandMode === "draft" && !isValidManualPhone(manualDraftBuyerPhone)) ||
                    (manualDemandMode === "draft" && !manualDraftDemandPropertyType) ||
                    (manualDemandMode === "draft" && Number(manualDraftDemandBudgetMax || "0") <= 0) ||
                    (manualPropertyMode === "existing" && !manualPropertyId) ||
                    (manualPropertyMode === "draft" &&
                      (!isValidManualPhone(manualDraftOwnerPhone) ||
                        !manualDraftCadastralRef.trim() ||
                        !manualDraftPropertyKeyTipo ||
                        !manualDraftPropertyKeyLoca)) ||
                    (selectedManualDemandNeedsPhone && !isValidManualPhone(manualBuyerPhone))
                  }
                >
                  {submitting || manualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Crear y agendar
                </Button>
              </div>
            </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-border/25 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              Visitas organizadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeTab === "ALL" ? "default" : "outline"}
                onClick={() => setActiveTab("ALL")}
              >
                Todas ({items.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === "TODAY" ? "default" : "outline"}
                onClick={() => setActiveTab("TODAY")}
              >
                Hoy ({todaysVisits.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === "SCHEDULED" ? "default" : "outline"}
                onClick={() => setActiveTab("SCHEDULED")}
              >
                Programadas ({scheduledVisits.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === "DONE" ? "default" : "outline"}
                onClick={() => setActiveTab("DONE")}
              >
                Hechas ({completedVisits.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === "DOCUMENTED" ? "default" : "outline"}
                onClick={() => setActiveTab("DOCUMENTED")}
              >
                Documentadas ({documentedVisits.length})
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando...
              </div>
            ) : visibleItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay visitas por programar para los filtros actuales.
              </p>
            ) : (
              visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setError(null);
                    setSuccess(null);
                    stopPostVisitRecording();
                    setPostVisitVoicePhase("idle");
                    setPostVisitVoiceError(null);
                    setPostVisitContext("");
                    setShowYellowContext(false);
                  }}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedId === item.id
                      ? "border-primary/35 bg-primary/5"
                      : "border-transparent hover:bg-muted/30",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.buyerName || item.demandId || item.draftDemandId}</span>
                    <Badge variant={statusVariant(item.status)}>{statusLabel[item.status]}</Badge>
                    {item.source === "legacy_interest" ? <Badge variant="outline">Legacy</Badge> : null}
                    {item.draftDemandId ? <Badge variant="outline">Demanda provisional</Badge> : null}
                    {item.draftPropertyId ? <Badge variant="outline">Propiedad provisional</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.propertySnapshot.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {propertyMeta(item.propertySnapshot)}
                  </p>
                  {item.scheduledSlotStart ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Agenda: {formatMadridDateTime(item.scheduledSlotStart) ?? "sin fecha"}
                    </p>
                  ) : null}
                  {item.parteVisita ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Parte de visita: {parteVisitaStatusLabel[item.parteVisita.state]}
                    </p>
                  ) : null}
                  {item.parteVisita?.signedDocumentUrl ? (
                    <p className="mt-1 text-xs text-urus-success">Documento firmado enviado</p>
                  ) : null}
                  {item.missingContactPhone ? (
                    <p className="mt-2 flex items-center gap-1 text-xs text-urus-danger">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Falta telefono de propietario/agencia.
                    </p>
                  ) : null}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/25 bg-card/90">
          <CardHeader>
            <CardTitle>Detalle de visita</CardTitle>
          </CardHeader>
          <CardContent>
            {selected ? (
              <form className="space-y-5" onSubmit={submit}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg bg-muted/20 p-4">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <UserRound className="h-4 w-4" />
                      Comprador
                    </div>
                    <p>{selected.buyerName || selected.demandId}</p>
                    {selected.draftDemandId ? (
                      <p className="mt-1 text-xs text-muted-foreground">Demanda provisional: {selected.draftDemandId}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted-foreground">{selected.buyerPhone || "Sin telefono"}</p>
                    {selected.demandId ? (
                      <p className="mt-1 text-xs text-muted-foreground">Demanda: {selected.demandId}</p>
                    ) : null}
                  </div>

                  <div className="rounded-lg bg-muted/20 p-4">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <Phone className="h-4 w-4" />
                      {contactLabel(selected.contactSnapshot)}
                    </div>
                    <p>{selected.contactSnapshot.name || "Nombre no disponible"}</p>
                    <p className={cn("mt-1 text-sm", selected.missingContactPhone && "text-urus-danger")}>
                      {selected.contactSnapshot.phones.join(", ") || "Telefono no disponible"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/20 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{selected.propertySnapshot.title}</p>
                    <Badge variant={selected.propertySnapshot.source === "internal" ? "default" : "secondary"}>
                      {selected.propertySnapshot.source === "internal" ? "Cartera interna" : "Cartera externa"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Ref: {selected.propertySnapshot.reference} · Ref. catastral: {selected.propertySnapshot.cadastralReference ?? "no disponible"}
                  </p>
                  {selected.draftPropertyId ? (
                    <p className="mt-1 text-xs text-muted-foreground">Propiedad provisional: {selected.draftPropertyId}</p>
                  ) : null}
                  <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {selected.propertySnapshot.address}
                  </p>
                  <p className="mt-1 text-muted-foreground">{propertyMeta(selected.propertySnapshot)}</p>
                  {selected.propertySnapshot.portalUrl ? (
                    <a
                      href={selected.propertySnapshot.portalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-primary underline"
                    >
                      Ver anuncio <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>

                <div className="rounded-lg bg-muted/15 p-4">
                  <p className="font-medium">Resumen NLU / motivo de interes</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selected.nluSummary || "Sin resumen NLU registrado para esta visita."}
                  </p>
                </div>

                <div className="rounded-lg bg-muted/15 p-4 text-sm">
                  <p className="font-medium">Trazabilidad documental</p>
                  {selected.parteVisita ? (
                    <div className="mt-2 space-y-1 text-muted-foreground">
                      <p>
                        Estado parte de visita:{" "}
                        {parteVisitaStatusLabel[selected.parteVisita.state]}
                      </p>
                      <p>
                        Última actualización:{" "}
                        {formatMadridDateTime(selected.parteVisita.updatedAt) ?? "sin dato"}
                      </p>
                      {selected.parteVisita.documentUrl ? (
                        <a
                          href={selected.parteVisita.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline"
                        >
                          Ver documento generado <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {selected.parteVisita.signedDocumentUrl ? (
                        <a
                          href={selected.parteVisita.signedDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline"
                        >
                          Ver documento firmado <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-muted-foreground">
                      Todavía no hay sesión documental asociada a esta visita.
                    </p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="fecha">Dia</Label>
                    <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaInicio">Inicio</Label>
                    <Input id="horaInicio" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaFin">Fin</Label>
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
                    rows={4}
                  />
                </div>

                {selectedIsScheduledButOpen ? (
                  <p className="rounded-lg bg-muted/15 p-3 text-sm text-muted-foreground">
                    Las acciones post-visita aparecerán cuando termine el horario agendado.
                  </p>
                ) : null}

                {selectedCanSchedule || selectedCanReschedule || selectedCanCancel || selectedCanDecide ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {selectedCanSchedule ? (
                      <Button type="submit" disabled={submitting}>
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                        {rescheduling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Reprogramar visita
                      </Button>
                    ) : null}
                    {selectedCanCancel ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={cancelling || rescheduling || submitting}
                        onClick={() => void cancelVisit()}
                      >
                        {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Cancelar visita
                      </Button>
                    ) : null}
                    {selectedCanDecide ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={Boolean(deciding)}
                          onClick={() => void decide("green")}
                        >
                          {deciding === "green" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Verde: Va a comprar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={Boolean(deciding)}
                          onClick={() => {
                            setShowYellowContext(true);
                            setError(null);
                            setSuccess(null);
                            setPostVisitVoiceError(null);
                          }}
                        >
                          {deciding === "yellow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Amarillo: Busca algo diferente
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Qué pasará con la demanda si marcas Busca algo diferente"
                              >
                                <CircleHelp className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-sm leading-relaxed">
                              La demanda seguirá activa. El sistema contactará al comprador para entender qué no encajó y qué busca ahora. Con esa información, ajustará la búsqueda y preparará nuevas opciones para revisar.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={Boolean(deciding)}
                          onClick={() => void decide("red")}
                        >
                          {deciding === "red" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Rojo: Dar de baja
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {selectedCanDecide && showYellowContext ? (
                  <div className="space-y-3 rounded-lg border border-border/40 bg-muted/15 p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="postVisitContext">
                          Contexto para reactivar la busqueda
                        </Label>
                        {!isRecordingPostVisitContext ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void startPostVisitRecording()}
                            disabled={Boolean(deciding) || isTranscribingPostVisitContext}
                          >
                            {isTranscribingPostVisitContext ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Mic className="mr-2 h-4 w-4" />
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
                            <Square className="mr-2 h-4 w-4" />
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
                              : "Ej: Quiere 3 habitaciones, mas luz natural y evitar planta baja."
                        }
                        rows={4}
                        maxLength={2000}
                        disabled={isTranscribingPostVisitContext || Boolean(deciding)}
                      />
                      {postVisitVoiceError ? (
                        <p className="text-xs text-urus-danger">{postVisitVoiceError}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Usa el icono de micrófono para dictar por voz. La transcripción se enviará al agente NLU como contexto explícito.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(deciding)}
                        onClick={() => void decide("yellow")}
                      >
                        {deciding === "yellow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirmar amarillo y enviar contexto
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
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona una visita por programar para ver comprador, propiedad, contacto y acciones.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
