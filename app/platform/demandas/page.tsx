"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Users2,
  Search,
  RefreshCw,
  Phone,
  MapPin,
  Home,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowLeftRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  UserRoundPen,
  UserCog,
  Ban,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDemands, type DemandsFilters, type DemandRow } from "@/lib/hooks/use-demands";
import type { LeadStatus } from "@prisma/client";
import { DeactivateConfirmDialog } from "./deactivate-confirm-dialog";

// ---------------------------------------------------------------------------
// LeadStatus metadata
// ---------------------------------------------------------------------------

interface StatusMeta {
  label: string;
  className: string;
}

const STATUS_META: Record<LeadStatus, StatusMeta> = {
  NUEVO: {
    label: "Nuevo",
    className:
      "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800/90 dark:text-zinc-100 dark:border-zinc-600",
  },
  CONTACTADO: {
    label: "Contactado",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  },
  EN_SELECCION: {
    label: "En Selección",
    className:
      "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800",
  },
  VISITA_PENDIENTE: {
    label: "Visita Pendiente",
    className:
      "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800",
  },
  VISITA_CONFIRMADA: {
    label: "Visita Confirmada",
    className:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-800",
  },
  VISITA_REALIZADA: {
    label: "Visita Realizada",
    className:
      "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-800",
  },
  EN_NEGOCIACION: {
    label: "En Negociación",
    className:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/55 dark:text-purple-200 dark:border-purple-800",
  },
  EN_FIRMA: {
    label: "En Firma",
    className:
      "bg-urus-warning/10 text-urus-warning border-urus-warning/30 dark:bg-urus-warning/15 dark:text-urus-warning dark:border-urus-warning/30",
  },
  CERRADO: {
    label: "Cerrado",
    className:
      "bg-urus-success/10 text-urus-success border-urus-success/30 dark:bg-urus-success/15 dark:text-urus-success dark:border-urus-success/30",
  },
  PERDIDO: {
    label: "Perdido",
    className:
      "bg-urus-danger/10 text-urus-danger border-urus-danger/30 dark:bg-urus-danger/15 dark:text-urus-danger dark:border-urus-danger/30",
  },
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
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass:
      "bg-blue-50/90 border-blue-100 dark:bg-blue-950/35 dark:border-blue-900/60",
  },
  {
    label: "En Proceso",
    statuses: [
      "EN_SELECCION",
      "VISITA_PENDIENTE",
      "VISITA_CONFIRMADA",
      "VISITA_REALIZADA",
    ] as LeadStatus[],
    colorClass: "text-orange-600 dark:text-orange-400",
    bgClass:
      "bg-orange-50/90 border-orange-100 dark:bg-orange-950/30 dark:border-orange-900/50",
  },
  {
    label: "Negociación / Firma",
    statuses: ["EN_NEGOCIACION", "EN_FIRMA"] as LeadStatus[],
    colorClass: "text-purple-600 dark:text-purple-400",
    bgClass:
      "bg-purple-50/90 border-purple-100 dark:bg-purple-950/35 dark:border-purple-900/55",
  },
  {
    label: "Cerrados / Perdidos",
    statuses: ["CERRADO", "PERDIDO"] as LeadStatus[],
    colorClass: "text-urus-success dark:text-urus-success",
    bgClass:
      "bg-urus-success/5 border-urus-success/20 dark:bg-urus-success/10 dark:border-urus-success/20",
  },
];

// ---------------------------------------------------------------------------
// Helper formatters
// ---------------------------------------------------------------------------

/** Rango numérico sin símbolo € (el símbolo se muestra una sola vez en la celda). */
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
}

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
        className="gap-1.5 text-xs h-8 border-[var(--urus-warning)]/40 text-[var(--urus-warning)] hover:text-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/10 whitespace-nowrap"
        title={blockedReason ?? "Faltan datos para cruzar"}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Completar datos</span>
        <span className="sm:hidden">Datos</span>
      </Button>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
        <span className="hidden sm:inline">Cruzando...</span>
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
      variant="secondary"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onTrigger(demandCodigo);
      }}
      className="gap-1.5 text-xs h-8 border border-secondary/25 shadow-sm whitespace-nowrap"
    >
      <ArrowLeftRight className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Forzar cruce</span>
      <span className="sm:hidden">Cruce</span>
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
          className="h-auto min-h-8 w-full max-w-[200px] justify-start gap-2 px-2.5 py-1.5 text-left font-normal border-border shadow-sm hover:bg-muted/50"
          title="Cambiar comercial asignado"
        >
          <UserCog className="h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0 leading-tight">
            <span className="truncate text-xs font-medium text-foreground">
              {currentAgente || "Sin asignar"}
            </span>
            <span className="text-[10px] text-muted-foreground">Reasignar</span>
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

function isMissingBuyerData(demand: DemandRow): boolean {
  const noName = !demand.nombre?.trim() || /^(null|undefined|sin nombre)$/i.test(demand.nombre.trim());
  const noPhone = !demand.telefono?.trim();
  return noName || noPhone;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.className,
      )}
    >
      {meta.label}
    </span>
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STAT_GROUPS.map((group) => {
        const count = group.statuses.reduce((a, s) => a + (stats[s] ?? 0), 0);
        const isActive = group.statuses.every((s) => activeStatuses.includes(s));
        return (
          <button
            key={group.label}
            type="button"
            onClick={() => onGroupClick(group.statuses)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-4 text-left transition-all hover:shadow-[var(--shadow-elevated)] hover:border-foreground/15",
              group.bgClass,
              isActive &&
                "ring-2 ring-primary/35 ring-offset-2 ring-offset-background dark:ring-primary/45",
            )}
          >
            <span className={cn("text-2xl font-bold tabular-nums", group.colorClass)}>
              {count}
            </span>
            <span className="text-xs text-muted-foreground leading-tight">{group.label}</span>
            {total > 0 && (
              <span className={cn("text-xs font-medium", group.colorClass)}>
                {Math.round((count / total) * 100)}%
              </span>
            )}
          </button>
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
      <span className="text-xs text-muted-foreground font-medium mr-1">Estado:</span>
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
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
              active
                ? cn(meta.className, "border border-border shadow-sm")
                : cn(
                    "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    count === 0 && "opacity-55",
                  ),
            )}
          >
            {meta.label}
            <span
              className={cn(
                "tabular-nums rounded-full px-1",
                active ? "bg-black/10" : "bg-muted",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
      {activeStatuses.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Limpiar filtros
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
  onForceMatch,
  onRefresh,
}: {
  demand: DemandRow;
  showComercial: boolean;
  showForceMatch: boolean;
  isCeoOrAdmin: boolean;
  rematchState: RematchState;
  rematchResult: RematchResult | null;
  rematchError: string | null;
  onForceMatch: (codigo: string) => void;
  onRefresh: () => void;
}) {
  const budgetLabel = formatBudget(demand.presupuestoMin, demand.presupuestoMax);
  const hasBudgetRange =
    demand.presupuestoMin > 0 || demand.presupuestoMax > 0;
  const incomplete = isMissingBuyerData(demand);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [guardModalOpen, setGuardModalOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const isTerminal = demand.leadStatus === "CERRADO" || demand.leadStatus === "PERDIDO";

  const handleForceMatchGuarded = useCallback(() => {
    if (!demand.telefono?.trim()) {
      setGuardModalOpen(true);
      return;
    }
    onForceMatch(demand.codigo);
  }, [demand.telefono, demand.codigo, onForceMatch]);

  return (
    <>
    <TableRow className="border-border/80 transition-colors hover:bg-muted/60 group/row">
      <TableCell className="max-w-[220px] py-3 pl-4 align-top">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 font-medium leading-snug line-clamp-2">
              {displayBuyerName(demand.nombre)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditModalOpen(true)}
              className={cn(
                "h-7 shrink-0 gap-1 px-2 text-[11px] font-medium shadow-sm",
                incomplete
                  ? "border-[var(--urus-warning)]/40 text-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/10"
                  : "border-border",
              )}
              title={
                incomplete
                  ? "Completar nombre, teléfono o email del comprador"
                  : "Editar datos del comprador"
              }
            >
              {incomplete ? (
                <>
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Completar
                </>
              ) : (
                <>
                  <Pencil className="h-3 w-3 shrink-0" />
                  Editar
                </>
              )}
            </Button>
          </div>
          {demand.telefono && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{demand.telefono}</span>
            </div>
          )}
          {!demand.telefono && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditModalOpen(true)}
              className="h-7 w-fit gap-1 px-2 text-[11px] border-[var(--urus-warning)]/35 text-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/10"
            >
              <Phone className="h-3 w-3 shrink-0" />
              Sin teléfono — añadir
            </Button>
          )}
        </div>
      </TableCell>

      <TableCell className="max-w-[200px] py-3 align-top">
        {demand.zonas && (
          <div className="flex items-start gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="text-xs leading-relaxed text-foreground/90 line-clamp-3">
              {demand.zonas}
            </span>
          </div>
        )}
        {demand.tipos && (
          <div className="flex items-center gap-1 mt-1">
            <Home className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground line-clamp-2">{demand.tipos}</span>
          </div>
        )}
        {!demand.zonas && !demand.tipos && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="tabular-nums text-sm whitespace-nowrap py-3 align-top">
        <div className="flex items-baseline gap-1.5">
          {hasBudgetRange && (
            <span
              className="text-muted-foreground text-[0.8rem] font-medium select-none"
              aria-hidden
            >
              €
            </span>
          )}
          <span className={!hasBudgetRange ? "text-muted-foreground" : undefined}>
            {budgetLabel}
          </span>
        </div>
        {demand.habitacionesMin > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            {demand.habitacionesMin}+ hab.
          </div>
        )}
      </TableCell>

      <TableCell className="py-3 align-middle">
        <div className="flex items-center gap-1.5">
          <StatusBadge status={demand.leadStatus} />
          {!isTerminal && (
            <button
              type="button"
              onClick={() => setDeactivateOpen(true)}
              className="shrink-0 opacity-0 group-hover/row:opacity-50 hover:!opacity-100 transition-opacity"
              title="Dar de baja esta demanda"
            >
              <Ban className="h-3 w-3 text-destructive" />
            </button>
          )}
        </div>
      </TableCell>

      {showComercial && (
        <TableCell className="py-3 align-top">
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
        </TableCell>
      )}

      <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3 align-top">
        <div className="flex items-center gap-1.5 pt-0.5">
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span>{formatRelativeDate(demand.updatedAt)}</span>
        </div>
      </TableCell>

      {showForceMatch && (
        <TableCell className="py-3 pr-4 align-middle text-right">
          <ForceMatchButton
            demandCodigo={demand.codigo}
            state={rematchState}
            result={rematchResult}
            errorMsg={rematchError}
            onTrigger={handleForceMatchGuarded}
            blocked={!demand.telefono?.trim()}
            blockedReason="El comprador no tiene teléfono — completa los datos para poder enviar ofertas por WhatsApp."
          />
        </TableCell>
      )}
    </TableRow>

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
      contextMessage="Esta demanda no tiene teléfono de contacto. Completa los datos del comprador antes de forzar el cruce — sin teléfono, el sistema no puede enviar WhatsApp al comprador."
      onSuccess={onRefresh}
    />

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
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
          {showComercial && <TableCell><Skeleton className="h-4 w-20" /></TableCell>}
          <TableCell><Skeleton className="h-4 w-14" /></TableCell>
          {showForceMatch && <TableCell><Skeleton className="h-8 w-24 rounded-md" /></TableCell>}
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 25;

export default function DemandasPage() {
  const { isCeoOrAdmin } = useSession();

  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  // Per-demand rematch state
  const [rematchStates, setRematchStates] = useState<Record<string, RematchState>>({});
  const [rematchResults, setRematchResults] = useState<Record<string, RematchResult>>({});
  const [rematchErrors, setRematchErrors] = useState<Record<string, string>>({});

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
        },
      }));

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
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav
            className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
            aria-label="Migas de pan"
          >
            <Link href="/platform" className="hover:text-foreground transition-colors">
              Panel
            </Link>
            <span className="text-muted-foreground/70" aria-hidden>
              /
            </span>
            <span className="font-medium text-foreground">Demandas</span>
          </nav>
          <div className="flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Demandas</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {isCeoOrAdmin
              ? "Todas las demandas activas del sistema con estado de pipeline"
              : "Tus demandas asignadas con estado de pipeline"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* Stats bar */}
      <StatsBar
        stats={stats}
        onGroupClick={toggleGroupStatuses}
        activeStatuses={selectedStatuses}
      />

      {/* Filters */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre, zona o teléfono..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10"
            />
          </div>

          {/* Status chips */}
          <FilterChips
            activeStatuses={selectedStatuses}
            onToggle={toggleStatus}
            onClearAll={clearFilters}
            stats={stats}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b bg-muted/35 dark:bg-muted/20">
                  <TableHead className="pl-4">Comprador</TableHead>
                  <TableHead>Zonas / Tipos</TableHead>
                  <TableHead>Presupuesto</TableHead>
                  <TableHead>Estado Pipeline</TableHead>
                  {isCeoOrAdmin && <TableHead>Comercial</TableHead>}
                  <TableHead>Última actividad</TableHead>
                  {isCeoOrAdmin && <TableHead className="pr-4 text-right">Cruces</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={PAGE_LIMIT} showComercial={isCeoOrAdmin} showForceMatch={isCeoOrAdmin} />
                ) : error ? (
                  <TableRow>
                    <TableCell
                      colSpan={isCeoOrAdmin ? 7 : 5}
                      className="text-center py-10 text-destructive"
                    >
                      Error al cargar demandas: {error}
                    </TableCell>
                  </TableRow>
                ) : demands.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isCeoOrAdmin ? 7 : 5}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No hay demandas que coincidan con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
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
                      onForceMatch={handleForceMatch}
                      onRefresh={refetch}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!isLoading && total > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
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
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
