"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users2,
  Search,
  RefreshCw,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowLeftRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UserRoundPen,
  UserCog,
  Ban,
  FileSignature,
  MessageCircle,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDemands, type DemandsFilters, type DemandRow } from "@/lib/hooks/use-demands";
import { LeadStatus } from "@prisma/client";
import { DeactivateConfirmDialog } from "./deactivate-confirm-dialog";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// LeadStatus metadata
// ---------------------------------------------------------------------------

interface StatusMeta {
  label: string;
  color: string;
}

const STATUS_META: Record<LeadStatus, StatusMeta> = {
  NUEVO: { label: "Nuevo", color: "var(--muted-foreground)" },
  CONTACTADO: { label: "Contactado", color: "#3b82f6" },
  EN_SELECCION: { label: "En Selección", color: "#0ea5e9" },
  VISITA_PENDIENTE: { label: "Visita Pendiente", color: "#f97316" },
  VISITA_CONFIRMADA: { label: "Visita Confirmada", color: "#84cc16" },
  VISITA_REALIZADA: { label: "Visita Realizada", color: "#14b8a6" },
  EN_NEGOCIACION: { label: "En Negociación", color: "#a855f7" },
  EN_FIRMA: { label: "En Firma", color: "var(--urus-warning)" },
  CERRADO: { label: "Cerrado", color: "var(--urus-success)" },
  PERDIDO: { label: "Perdido", color: "var(--urus-danger)" },
};

const ALL_STATUSES: LeadStatus[] = [
  "NUEVO",
  "CONTACTADO",
  "EN_SELECCION",
  "VISITA_PENDIENTE",
  "VISITA_CONFIRMADA",
  "VISITA_REALIZADA",
  "EN_NEGOCIACION",
  "EN_FIRMA",
  "CERRADO",
  "PERDIDO",
];

// ---------------------------------------------------------------------------
// Stats buckets
// ---------------------------------------------------------------------------

const STAT_GROUPS = [
  {
    label: "Nuevos / Contactados",
    statuses: ["NUEVO", "CONTACTADO"] as LeadStatus[],
    colorClass: "text-blue-500",
    icon: Users2,
  },
  {
    label: "En Proceso",
    statuses: [
      "EN_SELECCION",
      "VISITA_PENDIENTE",
      "VISITA_CONFIRMADA",
      "VISITA_REALIZADA",
    ] as LeadStatus[],
    colorClass: "text-orange-500",
    icon: Calendar,
  },
  {
    label: "Negociación / Firma",
    statuses: ["EN_NEGOCIACION", "EN_FIRMA"] as LeadStatus[],
    colorClass: "text-purple-500",
    icon: FileSignature,
  },
  {
    label: "Cerrados / Perdidos",
    statuses: ["CERRADO", "PERDIDO"] as LeadStatus[],
    colorClass: "text-[var(--urus-success)]",
    icon: CheckCircle2,
  },
];

// ---------------------------------------------------------------------------
// Helper formatters
// ---------------------------------------------------------------------------

function formatBudget(min: number, max: number): string {
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toLocaleString("es-ES", { maximumFractionDigits: 0 })}k` : n.toLocaleString("es-ES");
  if (min > 0 && max > 0) return `${fmt(min)} – ${fmt(max)}`;
  if (max > 0) return `hasta ${fmt(max)}`;
  if (min > 0) return `desde ${fmt(min)}`;
  return "—";
}

function displayBuyerName(nombre: string): string {
  const t = nombre?.trim() ?? "";
  if (!t) return "Sin nombre";
  if (/^null$/i.test(t) || /^undefined$/i.test(t)) return "Sin nombre";
  return t;
}

function formatRelativeDate(isoStr: string): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 30) return `hace ${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `hace ${diffMonths}m`;
  return `hace ${Math.floor(diffMonths / 12)}a`;
}

// ---------------------------------------------------------------------------
// Force-match per demand
// ---------------------------------------------------------------------------

type RematchState = "idle" | "loading" | "success" | "error";

interface RematchResult {
  matchesEmitted: number;
  matchesSkipped: number;
  executionMs: number;
  firstEmittedMatchId?: string | null;
}

type NluContactState = "idle" | "loading" | "success" | "skipped" | "error";

type NluSkippedReason =
  | "demand_not_found"
  | "missing_phone"
  | "terminal_status"
  | "opt_out"
  | "recent_session";

interface NluContactResult {
  sent: boolean;
  skippedReason?: NluSkippedReason | null;
  waId?: string | null;
  messageId?: string | null;
  eventId?: string;
}

const SKIPPED_REASON_LABELS: Record<NluSkippedReason, string> = {
  demand_not_found: "Demanda no encontrada",
  missing_phone: "Falta teléfono",
  terminal_status: "Demanda en estado terminal",
  opt_out: "Comprador marcado como no contactar",
  recent_session: "Ya hay conversación activa (<24h)",
};

function ForceMatchButton({
  demandCodigo,
  state,
  result,
  errorMsg,
  onTrigger,
  blocked = false,
  blockedReason,
}: {
  demandCodigo: string;
  state: RematchState;
  result: RematchResult | null;
  errorMsg: string | null;
  onTrigger: (codigo: string) => void;
  blocked?: boolean;
  blockedReason?: string;
}) {
  if (blocked && state === "idle") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onTrigger(demandCodigo);
        }}
        className="gap-1.5 text-xs h-7 px-2 border-[var(--urus-warning)]/40 text-[var(--urus-warning)] hover:text-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/10 whitespace-nowrap"
        title={blockedReason ?? "Faltan datos para cruzar"}
      >
        <AlertTriangle className="h-3 w-3" />
        <span>Completar</span>
      </Button>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
        <span>Cruzando...</span>
      </div>
    );
  }

  if (state === "success" && result) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5 text-xs text-[var(--urus-success)] font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {result.matchesEmitted} cruce{result.matchesEmitted !== 1 ? "s" : ""}
        </div>
        {result.matchesSkipped > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {result.matchesSkipped} sin cambio
          </span>
        )}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 text-xs text-[var(--urus-danger)]">
          <AlertTriangle className="h-3 w-3" />
          <span className="max-w-[120px] truncate">{errorMsg ?? "Error"}</span>
        </div>
        <button
          type="button"
          onClick={() => onTrigger(demandCodigo)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onTrigger(demandCodigo);
      }}
      className="gap-1.5 text-xs h-7 px-2 border-border shadow-sm whitespace-nowrap hover:bg-accent"
    >
      <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
      <span>Forzar cruce</span>
    </Button>
  );
}

function NluContactButton({
  demandCodigo,
  state,
  result,
  errorMsg,
  onTrigger,
  blocked = false,
  blockedReason,
}: {
  demandCodigo: string;
  state: NluContactState;
  result: NluContactResult | null;
  errorMsg: string | null;
  onTrigger: (codigo: string) => void;
  blocked?: boolean;
  blockedReason?: string;
}) {
  if (blocked && state === "idle") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onTrigger(demandCodigo);
        }}
        className="gap-1.5 text-xs h-7 px-2 border-[var(--urus-warning)]/40 text-[var(--urus-warning)] hover:text-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/10 whitespace-nowrap"
        title={blockedReason ?? "Falta teléfono para iniciar contacto NLU"}
      >
        <AlertTriangle className="h-3 w-3" />
        <span>Completar teléfono</span>
      </Button>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
        <span>Contactando...</span>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="flex items-center justify-end gap-1.5 text-xs text-[var(--urus-success)] font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Mensaje enviado
      </div>
    );
  }

  if (state === "skipped" && result?.skippedReason) {
    return (
      <div className="flex items-center justify-end gap-1.5 text-xs text-[var(--urus-warning)]">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="max-w-[150px] text-right leading-tight">
          {SKIPPED_REASON_LABELS[result.skippedReason]}
        </span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 text-xs text-[var(--urus-danger)]">
          <AlertTriangle className="h-3 w-3" />
          <span className="max-w-[120px] truncate">{errorMsg ?? "Error"}</span>
        </div>
        <button
          type="button"
          onClick={() => onTrigger(demandCodigo)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onTrigger(demandCodigo);
      }}
      className="gap-1.5 text-xs h-7 px-2 border-border shadow-sm whitespace-nowrap hover:bg-accent"
      title="Iniciar conversación NLU de preferencias con este comprador"
    >
      <MessageCircle className="h-3 w-3 text-muted-foreground" />
      <span>Poner en contacto</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Edit buyer modal
// ---------------------------------------------------------------------------

function EditBuyerModal({
  open,
  onOpenChange,
  demandCodigo,
  currentNombre,
  currentTelefono,
  contextMessage,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demandCodigo: string;
  currentNombre: string;
  currentTelefono: string;
  contextMessage?: string;
  onSuccess: () => void;
}) {
  const displayName = displayBuyerName(currentNombre);
  const hasName = displayName !== "Sin nombre";

  const [nombre, setNombre] = useState(hasName ? currentNombre.split(" ")[0] ?? "" : "");
  const [apellidos, setApellidos] = useState(hasName ? currentNombre.split(" ").slice(1).join(" ") : "");
  const [telefono, setTelefono] = useState(currentTelefono ?? "");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | "duplicate" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [duplicateInfo, setDuplicateInfo] = useState<string>("");

  const hasChanges = nombre.trim() || apellidos.trim() || telefono.trim() || email.trim();

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

  function buildBody(force = false): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (nombre.trim()) body.nombre = nombre.trim();
    if (apellidos.trim()) body.apellidos = apellidos.trim();
    if (telefono.trim()) {
      const phonePatch = normalizePhoneForInmovillaClientUpdate(telefono);
      if (phonePatch) Object.assign(body, phonePatch);
    }
    if (email.trim()) body.email = email.trim();
    if (force) body.force = true;
    return body;
  }

  async function handleSubmit(force = false) {
    if (!hasChanges) return;
    setSubmitting(true);
    if (!force) {
      setResult(null);
      setErrorMsg("");
      setDuplicateInfo("");
    }

    try {
      const res = await fetch(`/api/demands/${encodeURIComponent(demandCodigo)}/update-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(force)),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === "duplicate") {
        setResult("duplicate");
        setDuplicateInfo(data.message ?? "Ya existe un cliente con este dato");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult("success");
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundPen className="h-5 w-5 text-secondary" />
            Completar datos del comprador
          </DialogTitle>
          <DialogDescription>
            {contextMessage ?? `Demanda ${demandCodigo} — los cambios se guardan directamente en Inmovilla.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nombre</label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Apellidos</label>
              <Input
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder="Apellidos"
                disabled={submitting}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Teléfono</label>
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 612345678"
              type="tel"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="comprador@email.com"
              type="email"
              disabled={submitting}
            />
          </div>

          {result === "success" && (
            <div className="flex items-center gap-2 text-xs text-[var(--urus-success)] bg-[var(--urus-success)]/10 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Datos actualizados en Inmovilla. Se reflejarán en la plataforma en los próximos minutos.
            </div>
          )}

          {result === "duplicate" && (
            <div className="rounded-lg bg-[var(--urus-warning)]/10 border border-[var(--urus-warning)]/20 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[var(--urus-warning)] font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Posible duplicado
              </div>
              <p className="text-[10px] text-muted-foreground">{duplicateInfo}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={submitting}
                className="text-xs h-7 border-[var(--urus-warning)]/30 text-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/10"
              >
                {submitting ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
                ) : (
                  "Guardar de todas formas"
                )}
              </Button>
            </div>
          )}

          {result === "error" && (
            <div className="flex items-center gap-2 text-xs text-[var(--urus-danger)] bg-[var(--urus-danger)]/10 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => handleSubmit()}
              disabled={submitting || !hasChanges || result === "success" || result === "duplicate"}
              className="gap-2"
            >
              {submitting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...</>
              ) : (
                "Guardar en Inmovilla"
              )}
            </Button>
          </div>

          <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
            Los datos se actualizan directamente en Inmovilla vía API REST (PUT /clientes/).
            Inmovilla establece un límite de 20 peticiones por minuto.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reassign agent popover (CEO/Admin only)
// ---------------------------------------------------------------------------

interface ComercialOption {
  id: string;
  nombre: string;
  ciudad: string;
}

function ReassignPopover({
  demandCodigo,
  currentAgente,
  onSuccess,
}: {
  demandCodigo: string;
  currentAgente: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch("/api/comerciales/activos")
      .then((r) => r.json())
      .then((data) => setComerciales(data.comerciales ?? []))
      .catch(() => setError("No se pudieron cargar los comerciales"))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelect = async (comercialId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/demands/${encodeURIComponent(demandCodigo)}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comercialId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setOpen(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full max-w-[160px] justify-start gap-2 px-2 text-left font-normal border-border shadow-sm hover:bg-accent"
          title="Cambiar comercial asignado"
        >
          <UserCog className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-xs text-foreground">
            {currentAgente || "Sin asignar"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="px-3 py-2 border-b border-border/50">
          <p className="text-xs font-medium">Reasignar comercial</p>
        </div>
        <div className="max-h-48 overflow-y-auto py-1">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive px-3 py-2">{error}</p>
          )}
          {!loading && comerciales.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={submitting}
              onClick={() => handleSelect(c.id)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors disabled:opacity-50 flex items-center justify-between"
            >
              <span className="truncate font-medium">{c.nombre}</span>
              <span className="text-muted-foreground text-[10px] shrink-0 ml-2">{c.ciudad}</span>
            </button>
          ))}
          {!loading && !error && comerciales.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-2">No hay comerciales activos</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge 
      variant="secondary" 
      className="font-normal bg-accent text-foreground hover:bg-accent border border-transparent"
      style={{
        backgroundColor: `color-mix(in oklch, ${meta.color} 10%, transparent)`,
        color: meta.color,
      }}
    >
      {meta.label}
    </Badge>
  );
}

function StatsBar({
  stats,
  onGroupClick,
  activeStatuses,
}: {
  stats: Record<LeadStatus, number>;
  onGroupClick: (statuses: LeadStatus[]) => void;
  activeStatuses: LeadStatus[];
}) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {STAT_GROUPS.map((group) => {
        const count = group.statuses.reduce((a, s) => a + (stats[s] ?? 0), 0);
        const isActive = group.statuses.every((s) => activeStatuses.includes(s));
        const Icon = group.icon;
        
        return (
          <Card 
            key={group.label}
            className={cn(
              "shadow-sm border-border/60 cursor-pointer transition-all hover:border-border",
              isActive && "ring-1 ring-primary border-primary"
            )}
            onClick={() => onGroupClick(group.statuses)}
          >
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{group.label}</span>
                <Icon className="h-4 w-4" style={{ color: group.colorClass.replace('text-', '') }} />
              </div>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold text-foreground">{count}</p>
                {total > 0 && (
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {Math.round((count / total) * 100)}%
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FilterChips({
  activeStatuses,
  onToggle,
  onClearAll,
  stats,
}: {
  activeStatuses: LeadStatus[];
  onToggle: (status: LeadStatus) => void;
  onClearAll: () => void;
  stats: Record<LeadStatus, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {ALL_STATUSES.map((status) => {
        const meta = STATUS_META[status];
        const active = activeStatuses.includes(status);
        const count = stats[status] ?? 0;
        return (
          <button
            key={status}
            type="button"
            onClick={() => onToggle(status)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all border",
              active
                ? "bg-accent border-border text-foreground shadow-sm"
                : "bg-transparent border-transparent text-muted-foreground hover:bg-accent/50",
              count === 0 && !active && "opacity-50"
            )}
          >
            {meta.label}
            <span className="text-[10px] text-muted-foreground ml-0.5">
              {count}
            </span>
          </button>
        );
      })}
      {activeStatuses.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-2"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      )}
    </div>
  );
}

function DemandTableRow({
  demand,
  showComercial,
  showForceMatch,
  isCeoOrAdmin,
  rematchState,
  rematchResult,
  rematchError,
  nluContactState,
  nluContactResult,
  nluContactError,
  onForceMatch,
  onContactNlu,
  onRefresh,
}: {
  demand: DemandRow;
  showComercial: boolean;
  showForceMatch: boolean;
  isCeoOrAdmin: boolean;
  rematchState: RematchState;
  rematchResult: RematchResult | null;
  rematchError: string | null;
  nluContactState: NluContactState;
  nluContactResult: NluContactResult | null;
  nluContactError: string | null;
  onForceMatch: (codigo: string) => void;
  onContactNlu: (codigo: string) => void;
  onRefresh: () => void;
}) {
  const budgetLabel = formatBudget(demand.presupuestoMin, demand.presupuestoMax);
  const hasBudgetRange = demand.presupuestoMin > 0 || demand.presupuestoMax > 0;
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [guardModalOpen, setGuardModalOpen] = useState(false);
  const [guardContext, setGuardContext] = useState<string | undefined>(undefined);
  const [nluConfirmOpen, setNluConfirmOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const isTerminal = demand.leadStatus === "CERRADO" || demand.leadStatus === "PERDIDO";
  const needsNluContactConfirmation =
    demand.leadStatus !== "NUEVO" && demand.leadStatus !== "CONTACTADO";

  const handleForceMatchGuarded = useCallback(() => {
    if (!demand.telefono?.trim()) {
      setGuardContext("Esta demanda no tiene teléfono de contacto. Completa los datos del comprador antes de forzar el cruce — sin teléfono, el sistema no puede enviar WhatsApp al comprador.");
      setGuardModalOpen(true);
      return;
    }
    onForceMatch(demand.codigo);
  }, [demand.telefono, demand.codigo, onForceMatch]);

  const handleNluContactGuarded = useCallback(() => {
    if (!demand.telefono?.trim()) {
      setGuardContext("Esta demanda no tiene teléfono de contacto. Añade un teléfono antes de iniciar el contacto NLU de preferencias por WhatsApp.");
      setGuardModalOpen(true);
      return;
    }
    if (needsNluContactConfirmation) {
      setNluConfirmOpen(true);
      return;
    }
    onContactNlu(demand.codigo);
  }, [demand.telefono, demand.codigo, needsNluContactConfirmation, onContactNlu]);

  return (
    <>
    <tr className="hover:bg-accent/30 transition-colors group/row border-b border-border/40 last:border-0">
      <td className="px-5 py-4 align-top">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-foreground leading-snug truncate max-w-[200px]">
              {displayBuyerName(demand.nombre)}
            </span>
          </div>
          {demand.telefono ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{demand.telefono}</span>
            </div>
          ) : (
            <span className="text-xs text-[var(--urus-warning)] flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> Sin teléfono
            </span>
          )}
          <button
            onClick={() => setEditModalOpen(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground underline w-fit mt-1"
          >
            Editar datos
          </button>
        </div>
      </td>

      <td className="px-5 py-4 align-top">
        <div className="flex flex-col gap-1.5">
          {demand.zonas ? (
            <span className="text-xs text-foreground line-clamp-2 max-w-[180px]">
              {demand.zonas}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {demand.tipos && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
              {demand.tipos}
            </span>
          )}
        </div>
      </td>

      <td className="px-5 py-4 align-top">
        <div className="flex flex-col gap-1">
          <span className={`text-sm ${!hasBudgetRange ? "text-muted-foreground" : "text-foreground font-medium"}`}>
            {hasBudgetRange && "€ "}{budgetLabel}
          </span>
          {demand.habitacionesMin > 0 && (
            <span className="text-xs text-muted-foreground">
              {demand.habitacionesMin}+ hab.
            </span>
          )}
        </div>
      </td>

      <td className="px-5 py-4 align-top">
        <div className="flex items-center gap-2">
          <StatusBadge status={demand.leadStatus} />
          {!isTerminal && (
            <button
              type="button"
              onClick={() => setDeactivateOpen(true)}
              className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
              title="Dar de baja esta demanda"
            >
              <Ban className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
            </button>
          )}
        </div>
      </td>

      {showComercial && (
        <td className="px-5 py-4 align-top">
          {isCeoOrAdmin ? (
            <ReassignPopover
              demandCodigo={demand.codigo}
              currentAgente={demand.agente}
              onSuccess={onRefresh}
            />
          ) : (
            <span className="text-sm text-muted-foreground max-w-[140px] truncate block">
              {demand.agente || "—"}
            </span>
          )}
        </td>
      )}

      <td className="px-5 py-4 align-top">
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(demand.updatedAt)}
        </span>
      </td>

      <td className="px-5 py-4 align-top text-right">
        {isTerminal ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <NluContactButton
            demandCodigo={demand.codigo}
            state={nluContactState}
            result={nluContactResult}
            errorMsg={nluContactError}
            onTrigger={handleNluContactGuarded}
            blocked={!demand.telefono?.trim()}
            blockedReason="El comprador no tiene teléfono — completa los datos para iniciar contacto NLU por WhatsApp."
          />
        )}
      </td>

      {showForceMatch && (
        <td className="px-5 py-4 align-top text-right">
          <ForceMatchButton
            demandCodigo={demand.codigo}
            state={rematchState}
            result={rematchResult}
            errorMsg={rematchError}
            onTrigger={handleForceMatchGuarded}
            blocked={!demand.telefono?.trim()}
            blockedReason="El comprador no tiene teléfono — completa los datos para poder enviar ofertas por WhatsApp."
          />
        </td>
      )}
    </tr>

    <EditBuyerModal
      open={editModalOpen}
      onOpenChange={setEditModalOpen}
      demandCodigo={demand.codigo}
      currentNombre={demand.nombre}
      currentTelefono={demand.telefono}
      onSuccess={onRefresh}
    />

    <EditBuyerModal
      open={guardModalOpen}
      onOpenChange={setGuardModalOpen}
      demandCodigo={demand.codigo}
      currentNombre={demand.nombre}
      currentTelefono={demand.telefono}
      contextMessage={guardContext}
      onSuccess={onRefresh}
    />

    <Dialog open={nluConfirmOpen} onOpenChange={setNluConfirmOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-secondary" />
            Poner en contacto
          </DialogTitle>
          <DialogDescription>
            La demanda de <strong>{displayBuyerName(demand.nombre)}</strong> está en estado{" "}
            <strong>{STATUS_META[demand.leadStatus].label}</strong>. ¿Quieres iniciar el contacto NLU de preferencias?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se usará la plantilla actual de primer contacto. Si ya hay una conversación reciente, el sistema no reenviará el mensaje y mostrará el motivo.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setNluConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setNluConfirmOpen(false);
                onContactNlu(demand.codigo);
              }}
              className="gap-1.5"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Contactar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <DeactivateConfirmDialog
      open={deactivateOpen}
      onOpenChange={setDeactivateOpen}
      demandCodigo={demand.codigo}
      buyerName={demand.nombre}
      onSuccess={onRefresh}
    />
    </>
  );
}

function TableSkeleton({ rows = 8, showComercial, showForceMatch }: { rows?: number; showComercial: boolean; showForceMatch: boolean }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border/40">
          <td className="px-5 py-4"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-3 w-24" /></td>
          <td className="px-5 py-4"><Skeleton className="h-4 w-28 mb-2" /><Skeleton className="h-3 w-20" /></td>
          <td className="px-5 py-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-3 w-16" /></td>
          <td className="px-5 py-4"><Skeleton className="h-5 w-24 rounded-full" /></td>
          {showComercial && <td className="px-5 py-4"><Skeleton className="h-6 w-28 rounded-md" /></td>}
          <td className="px-5 py-4"><Skeleton className="h-4 w-14" /></td>
          <td className="px-5 py-4 text-right"><Skeleton className="h-7 w-32 rounded-md ml-auto" /></td>
          {showForceMatch && <td className="px-5 py-4 text-right"><Skeleton className="h-7 w-24 rounded-md ml-auto" /></td>}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 25;

export default function DemandasPage() {
  const router = useRouter();
  const { isCeoOrAdmin } = useSession();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  // Per-demand rematch state
  const [rematchStates, setRematchStates] = useState<Record<string, RematchState>>({});
  const [rematchResults, setRematchResults] = useState<Record<string, RematchResult>>({});
  const [rematchErrors, setRematchErrors] = useState<Record<string, string>>({});

  // Per-demand manual NLU initial contact state
  const [nluContactStates, setNluContactStates] = useState<Record<string, NluContactState>>({});
  const [nluContactResults, setNluContactResults] = useState<Record<string, NluContactResult>>({});
  const [nluContactErrors, setNluContactErrors] = useState<Record<string, string>>({});

  // Debounce search input
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimer) clearTimeout(searchTimer);
      const t = setTimeout(() => {
        setDebouncedQuery(value);
        setPage(1);
      }, 350);
      setSearchTimer(t);
    },
    [searchTimer],
  );

  const filters = useMemo<DemandsFilters>(
    () => ({
      leadStatus: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      q: debouncedQuery || undefined,
      page,
      limit: PAGE_LIMIT,
    }),
    [selectedStatuses, debouncedQuery, page],
  );

  const { demands, total, stats, isLoading, error, refetch } = useDemands(filters);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const toggleStatus = useCallback((status: LeadStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
    setPage(1);
  }, []);

  const toggleGroupStatuses = useCallback((statuses: LeadStatus[]) => {
    setSelectedStatuses((prev) => {
      const allActive = statuses.every((s) => prev.includes(s));
      if (allActive) {
        return prev.filter((s) => !statuses.includes(s));
      }
      const merged = new Set([...prev, ...statuses]);
      return Array.from(merged);
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedStatuses([]);
    setPage(1);
  }, []);

  const handleForceMatch = useCallback(async (codigo: string) => {
    setRematchStates((prev) => ({ ...prev, [codigo]: "loading" }));
    setRematchErrors((prev) => {
      const next = { ...prev };
      delete next[codigo];
      return next;
    });

    try {
      const res = await fetch(`/api/demands/${encodeURIComponent(codigo)}/rematch`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setRematchStates((prev) => ({ ...prev, [codigo]: "error" }));
        setRematchErrors((prev) => ({ ...prev, [codigo]: data.error ?? `Error ${res.status}` }));
        return;
      }

      setRematchStates((prev) => ({ ...prev, [codigo]: "success" }));
      setRematchResults((prev) => ({
        ...prev,
        [codigo]: {
          matchesEmitted: data.matchesEmitted,
          matchesSkipped: data.matchesSkipped,
          executionMs: data.executionMs,
          firstEmittedMatchId: data.firstEmittedMatchId ?? null,
        },
      }));

      if (data.matchesEmitted > 0 && typeof data.firstEmittedMatchId === "string") {
        router.push(
          `/platform/matching/cruces?matchId=${encodeURIComponent(data.firstEmittedMatchId)}`,
        );
      }

      setTimeout(() => {
        setRematchStates((prev) => {
          if (prev[codigo] !== "success") return prev;
          const next = { ...prev };
          delete next[codigo];
          return next;
        });
      }, 8_000);
    } catch (err) {
      setRematchStates((prev) => ({ ...prev, [codigo]: "error" }));
      setRematchErrors((prev) => ({
        ...prev,
        [codigo]: err instanceof Error ? err.message : "Error de red",
      }));
    }
  }, [router]);

  const handleContactNlu = useCallback(async (codigo: string) => {
    setNluContactStates((prev) => ({ ...prev, [codigo]: "loading" }));
    setNluContactErrors((prev) => {
      const next = { ...prev };
      delete next[codigo];
      return next;
    });

    try {
      const res = await fetch(`/api/demands/${encodeURIComponent(codigo)}/nlu-initial-contact`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setNluContactStates((prev) => ({ ...prev, [codigo]: "error" }));
        setNluContactErrors((prev) => ({ ...prev, [codigo]: data.error ?? `Error ${res.status}` }));
        return;
      }

      const result: NluContactResult = {
        sent: Boolean(data.sent),
        skippedReason: data.skippedReason ?? null,
        waId: data.waId ?? null,
        messageId: data.messageId ?? null,
        eventId: data.eventId,
      };

      setNluContactResults((prev) => ({ ...prev, [codigo]: result }));
      setNluContactStates((prev) => ({
        ...prev,
        [codigo]: result.sent ? "success" : "skipped",
      }));

      setTimeout(() => {
        setNluContactStates((prev) => {
          const current = prev[codigo];
          if (current !== "success" && current !== "skipped") return prev;
          const next = { ...prev };
          delete next[codigo];
          return next;
        });
      }, 8_000);
    } catch (err) {
      setNluContactStates((prev) => ({ ...prev, [codigo]: "error" }));
      setNluContactErrors((prev) => ({
        ...prev,
        [codigo]: err instanceof Error ? err.message : "Error de red",
      }));
    }
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-h-[calc(100dvh-8rem)] max-w-[1600px] flex-col overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex shrink-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Demandas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCeoOrAdmin
              ? "Todas las demandas activas del sistema con estado de pipeline."
              : "Tus demandas asignadas con estado de pipeline."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-2 bg-card shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* Stats bar */}
      <div className="mb-4 shrink-0">
        <StatsBar
          stats={stats}
          onGroupClick={toggleGroupStatuses}
          activeStatuses={selectedStatuses}
        />
      </div>

      {/* Main layout: filtros fijos + tabla con scroll */}
      <div className="flex min-h-0 flex-1 gap-5">

        {/* Filter Sidebar */}
        <div
          className={cn(
            "shrink-0 self-stretch transition-all duration-200",
            sidebarOpen ? "w-72" : "w-0 overflow-hidden"
          )}
        >
          <div className="flex h-full w-72 flex-col rounded-lg border border-border/60 bg-card shadow-sm">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Search className="h-4 w-4 text-muted-foreground" />
                Filtros
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Ocultar Filtros
              </button>
            </div>

            {/* Search input */}
            <div className="px-4 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Buscar por nombre, código, zona o teléfono..."
                  className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {/* Status filter chips */}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado pipeline</p>
              <div className="flex flex-col gap-1">
                {ALL_STATUSES.map((status) => {
                  const meta = STATUS_META[status];
                  const active = selectedStatuses.includes(status);
                  const count = stats[status] ?? 0;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatus(status)}
                      className={cn(
                        "flex items-center justify-between w-full rounded-md px-3 py-1.5 text-xs font-medium transition-all border",
                        active
                          ? "bg-primary/5 border-primary/30 text-foreground"
                          : "bg-transparent border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        count === 0 && !active && "opacity-40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        {meta.label}
                      </div>
                      <span className={cn(
                        "text-[10px] tabular-nums font-normal",
                        active ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedStatuses.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                >
                  <X className="h-3 w-3" />
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Apply filters footer */}
            <div className="px-4 py-3 border-t border-border/40">
              <Button
                size="sm"
                className="w-full gap-2"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <Search className="h-3.5 w-3.5" />
                Aplicar filtros
              </Button>
            </div>
          </div>
        </div>

        {/* Main content column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* Show filters toggle (when sidebar is hidden) */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex shrink-0 items-center gap-1.5 self-start text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              Mostrar Filtros
            </button>
          )}

      {/* Table */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60 shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border/60 bg-accent/95 backdrop-blur-sm">
              <tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Comprador</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Zonas / Tipos</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Presupuesto</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Estado Pipeline</th>
                {isCeoOrAdmin && <th className="px-5 py-3 font-medium text-muted-foreground">Comercial</th>}
                <th className="px-5 py-3 font-medium text-muted-foreground">Última actividad</th>
                <th className="px-5 py-3 font-medium text-muted-foreground text-right">Contacto</th>
                {isCeoOrAdmin && <th className="px-5 py-3 font-medium text-muted-foreground text-right">Cruces</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 bg-card">
              {isLoading ? (
                <TableSkeleton rows={PAGE_LIMIT} showComercial={isCeoOrAdmin} showForceMatch={isCeoOrAdmin} />
              ) : error ? (
                <tr>
                  <td
                    colSpan={isCeoOrAdmin ? 8 : 6}
                    className="text-center py-10 text-destructive"
                  >
                    Error al cargar demandas: {error}
                  </td>
                </tr>
              ) : demands.length === 0 ? (
                <tr>
                  <td
                    colSpan={isCeoOrAdmin ? 8 : 6}
                    className="text-center py-16"
                  >
                    <Users2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-base font-medium text-foreground">No se encontraron demandas</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No hay demandas que coincidan con los filtros seleccionados.
                    </p>
                  </td>
                </tr>
              ) : (
                demands.map((demand) => (
                  <DemandTableRow
                    key={demand.codigo}
                    demand={demand}
                    showComercial={isCeoOrAdmin}
                    showForceMatch={isCeoOrAdmin}
                    isCeoOrAdmin={isCeoOrAdmin}
                    rematchState={rematchStates[demand.codigo] ?? "idle"}
                    rematchResult={rematchResults[demand.codigo] ?? null}
                    rematchError={rematchErrors[demand.codigo] ?? null}
                    nluContactState={nluContactStates[demand.codigo] ?? "idle"}
                    nluContactResult={nluContactResults[demand.codigo] ?? null}
                    nluContactError={nluContactErrors[demand.codigo] ?? null}
                    onForceMatch={handleForceMatch}
                    onContactNlu={handleContactNlu}
                    onRefresh={refetch}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-border/40 bg-accent/10 px-5 py-3">
            <span className="text-sm text-muted-foreground">
              {total} demanda{total !== 1 ? "s" : ""}
              {selectedStatuses.length > 0 || debouncedQuery
                ? " (filtradas)"
                : " en total"}
              {" · "}
              página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        </Card>
        </div>{/* end main content column */}
      </div>{/* end sidebar + content flex */}
    </div>
  );
}
