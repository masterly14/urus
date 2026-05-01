"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GlobalPropertySelector, type GlobalPropertyOption } from "@/components/properties/global-property-selector";
import { cn } from "@/lib/utils";

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

type VisitWorkItemDto = {
  id: string;
  demandId: string;
  selectionId: string | null;
  propertyId: string;
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
};

type ApiResponse = {
  ok: boolean;
  workItems: VisitWorkItemDto[];
  legacyFallback?: boolean;
};

type ManualDemandOption = {
  codigo: string;
  nombre: string;
  telefono: string;
  leadStatus: string;
};

type ManualPropertyOption = GlobalPropertyOption;

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

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

function formatMoney(value: number | null): string {
  if (value === null) return "Precio no disponible";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
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

function makeMockItems(): VisitWorkItemDto[] {
  const now = new Date().toISOString();
  const base: VisitWorkItemDto = {
    id: "mock-pending-1",
    demandId: "DEM-MOCK-1",
    selectionId: "SEL-MOCK-1",
    propertyId: "PROP-MOCK-1",
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
      selectionId: "SEL-MOCK-2",
      propertyId: "PROP-MOCK-2",
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
  const [selectedId, setSelectedId] = useState(initialVisitId);
  const [fecha, setFecha] = useState(tomorrow());
  const [horaInicio, setHoraInicio] = useState("10:00");
  const [horaFin, setHoraFin] = useState("11:00");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState<VisitDecision | null>(null);
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualDemands, setManualDemands] = useState<ManualDemandOption[]>([]);
  const [manualProperties, setManualProperties] = useState<ManualPropertyOption[]>([]);
  const [manualDemandId, setManualDemandId] = useState("");
  const [manualPropertyId, setManualPropertyId] = useState("");
  const [manualBuyerPhone, setManualBuyerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const selectedManualDemand = useMemo(
    () => manualDemands.find((demand) => demand.codigo === manualDemandId) ?? null,
    [manualDemands, manualDemandId],
  );
  const selectedManualDemandNeedsPhone = Boolean(
    showManualCreate && selectedManualDemand && !selectedManualDemand.telefono?.trim(),
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

  const loadManualOptions = async () => {
    setManualLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/visitas/manual-options?limit=50", { cache: "no-store" });
      const data = (await response.json()) as {
        ok?: boolean;
        demands?: ManualDemandOption[];
        properties?: ManualPropertyOption[];
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No se pudieron cargar demandas/propiedades");
      setManualDemands(data.demands ?? []);
      setManualProperties(data.properties ?? []);
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
      setManualDemandId("");
      setManualBuyerPhone("");
      setManualPropertyId("");
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
          demandId: selected.demandId,
          propertyId: selected.propertyId,
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

  const createManualAndSchedule = async () => {
    if (!manualDemandId || !manualPropertyId) {
      setError("Selecciona demanda y propiedad para crear la visita manual.");
      return;
    }
    if (horaInicio >= horaFin) {
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
          demandId: manualDemandId,
          propertyId: manualPropertyId,
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
          demandId: manualDemandId,
          propertyId: manualPropertyId,
          fecha,
          horaInicio,
          horaFin,
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error registrando decision");
    } finally {
      setDeciding(null);
    }
  };

  const selectedVisitHasEnded = selected ? hasVisitEnded(selected) : false;
  const selectedCanSchedule = Boolean(
    selected && (selected.status === "PENDING_SCHEDULE" || selected.status === "INCOMPLETE"),
  );
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

      {showManualCreate ? (
        <Card className="border-border/25 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Crear visita manualmente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
              <div className="space-y-4 rounded-xl bg-muted/10 p-4 shadow-inner shadow-background/20">
                <div className="space-y-2">
                  <Label htmlFor="manualDemand">Demanda</Label>
                  <select
                    id="manualDemand"
                    value={manualDemandId}
                    onChange={(event) => {
                      const demandId = event.target.value;
                      const demand = manualDemands.find((item) => item.codigo === demandId);
                      setManualDemandId(demandId);
                      setManualBuyerPhone(demand?.telefono ?? "");
                    }}
                    className="h-10 w-full rounded-md border border-border/55 bg-background/70 px-3 text-sm outline-none transition-colors focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                    disabled={manualLoading}
                  >
                    <option value="">Selecciona una demanda...</option>
                    {manualDemands.map((demand) => (
                      <option key={demand.codigo} value={demand.codigo}>
                        {demand.nombre || demand.codigo} · {demand.telefono || "sin telefono"}
                      </option>
                    ))}
                  </select>
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

              <div className="space-y-2">
                <Label>Propiedad</Label>
                <GlobalPropertySelector
                  properties={manualProperties}
                  value={manualPropertyId}
                  onChange={setManualPropertyId}
                  onSearch={searchManualProperties}
                  disabled={manualLoading}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[160px_130px_130px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <Label htmlFor="manualFecha">Dia</Label>
                <Input id="manualFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualInicio">Inicio</Label>
                <Input id="manualInicio" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualFin">Fin</Label>
                <Input id="manualFin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
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
                    !manualDemandId ||
                    !manualPropertyId ||
                    (selectedManualDemandNeedsPhone && !isValidManualPhone(manualBuyerPhone))
                  }
                >
                  {submitting || manualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Crear y agendar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-border/25 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              Visitas por programar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando...
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay visitas por programar para los filtros actuales.
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setError(null);
                    setSuccess(null);
                  }}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedId === item.id
                      ? "border-primary/35 bg-primary/5"
                      : "border-transparent hover:bg-muted/30",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.buyerName || item.demandId}</span>
                    <Badge variant={statusVariant(item.status)}>{statusLabel[item.status]}</Badge>
                    {item.source === "legacy_interest" ? <Badge variant="outline">Legacy</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.propertySnapshot.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {propertyMeta(item.propertySnapshot)}
                  </p>
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
                    <p className="mt-1 text-sm text-muted-foreground">{selected.buyerPhone || "Sin telefono"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Demanda: {selected.demandId}</p>
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

                {selectedCanSchedule || selectedCanDecide ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {selectedCanSchedule ? (
                      <Button type="submit" disabled={submitting}>
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Agendar y activar Flow
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
                          onClick={() => void decide("yellow")}
                        >
                          {deciding === "yellow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Amarillo: Busca algo diferente
                        </Button>
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
