"use client";

import { useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDemands, type DemandsFilters, type DemandRow } from "@/lib/hooks/use-demands";
import type { LeadStatus } from "@prisma/client";

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
      "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
  },
  CERRADO: {
    label: "Cerrado",
    className:
      "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800",
  },
  PERDIDO: {
    label: "Perdido",
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800",
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
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass:
      "bg-emerald-50/90 border-emerald-100 dark:bg-emerald-950/35 dark:border-emerald-900/50",
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
              "flex flex-col gap-1 rounded-xl border p-4 text-left transition-all hover:shadow-md hover:border-foreground/15",
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
                ? cn(meta.className, "ring-1 ring-foreground/10 shadow-sm")
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
}: {
  demand: DemandRow;
  showComercial: boolean;
}) {
  const budgetLabel = formatBudget(demand.presupuestoMin, demand.presupuestoMax);
  const hasBudgetRange =
    demand.presupuestoMin > 0 || demand.presupuestoMax > 0;

  return (
    <TableRow className="border-border/80 transition-colors hover:bg-muted/60">
      <TableCell className="max-w-[220px] py-3 pl-4 align-top">
        <div className="font-medium leading-snug line-clamp-2">
          {displayBuyerName(demand.nombre)}
        </div>
        {demand.telefono && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{demand.telefono}</span>
          </div>
        )}
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
        <StatusBadge status={demand.leadStatus} />
      </TableCell>

      {showComercial && (
        <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate py-3 align-top">
          {demand.agente || "—"}
        </TableCell>
      )}

      <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3 pr-4 align-top">
        <div className="flex items-center gap-1.5 pt-0.5">
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span>{formatRelativeDate(demand.updatedAt)}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton({ rows = 8, showComercial }: { rows?: number; showComercial: boolean }) {
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
                  <TableHead className="pr-4">Última actividad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={PAGE_LIMIT} showComercial={isCeoOrAdmin} />
                ) : error ? (
                  <TableRow>
                    <TableCell
                      colSpan={isCeoOrAdmin ? 6 : 5}
                      className="text-center py-10 text-destructive"
                    >
                      Error al cargar demandas: {error}
                    </TableCell>
                  </TableRow>
                ) : demands.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isCeoOrAdmin ? 6 : 5}
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
