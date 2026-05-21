"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Plus, Search, ChevronLeft, ChevronRight, ArrowRight, CheckCircle, XCircle, Loader2, MoreHorizontal, Eye, Info, ImageOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/hooks/use-session";
import { operacionEstadoFilterLabels, PIPELINE_OPERACION_ESTADO_VALUES } from "@/lib/postventa/pipeline-filter-options";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { FadeIn, Fade, AnimatePresence } from "@/components/ui/motion";
import { CrearOperacionDialog } from "./crear-operacion-dialog";
import { DetalleSheet } from "./detalle-sheet";
import { AvanzarDialog } from "./avanzar-dialog";
import { CerrarDialog } from "./cerrar-dialog";
import { CancelarDialog } from "./cancelar-dialog";
import { OperacionesGuiaDialog } from "./operaciones-guia-dialog";
import { EliminarDialog } from "./eliminar-dialog";

interface Operacion {
  id: string;
  codigo: string;
  propertyCode: string;
  estado: string;
  ciudad: string;
  comercialId: string | null;
  demandId: string | null;
  buyerClientId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { asignaciones: number };
  property?: {
    codigo: string;
    mainPhotoUrl: string | null;
    ref: string | null;
    numFotos: number;
  } | null;
}

const OPERACION_STAGE_FLOW = [
  "EN_CURSO",
  "OFERTA_FIRME",
  "RESERVA",
  "ARRAS",
  "PENDIENTE_FIRMA",
] as const;

const STAGE_SHORT_LABEL: Record<(typeof OPERACION_STAGE_FLOW)[number], string> = {
  EN_CURSO: "En curso",
  OFERTA_FIRME: "Oferta",
  RESERVA: "Reserva",
  ARRAS: "Arras",
  PENDIENTE_FIRMA: "Firma",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

function estadoBadgeVariant(estado: string): BadgeVariant {
  if (estado.startsWith("CERRADA_")) return "success";
  if (estado === "CANCELADA") return "destructive";
  if (estado === "PENDIENTE_FIRMA") return "warning";
  if (estado === "EN_CURSO") return "info" as BadgeVariant;
  return "secondary";
}

function isTerminal(estado: string) {
  return estado.startsWith("CERRADA_") || estado === "CANCELADA";
}

function totalDays(op: Operacion): number {
  const end = isTerminal(op.estado) ? new Date(op.closedAt || op.updatedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(op.createdAt).getTime()) / 86_400_000));
}

function stageProgressInfo(estado: string): { currentIndex: number; progressPct: number } {
  if (estado.startsWith("CERRADA_")) {
    return { currentIndex: OPERACION_STAGE_FLOW.length - 1, progressPct: 100 };
  }
  if (estado === "CANCELADA") {
    return { currentIndex: 0, progressPct: 0 };
  }
  const idx = OPERACION_STAGE_FLOW.indexOf(estado as (typeof OPERACION_STAGE_FLOW)[number]);
  if (idx === -1) return { currentIndex: 0, progressPct: 0 };
  return {
    currentIndex: idx,
    progressPct: Math.round(((idx + 1) / OPERACION_STAGE_FLOW.length) * 100),
  };
}

function CompactStepper({ estado }: { estado: string }) {
  const { currentIndex } = stageProgressInfo(estado);
  const isClosed = estado.startsWith("CERRADA_");
  const isCancelled = estado === "CANCELADA";

  return (
    <div className="flex items-center gap-0.5">
      {OPERACION_STAGE_FLOW.map((stage, index) => {
        const isCompleted = index < currentIndex || isClosed;
        const isCurrent = index === currentIndex && !isClosed && !isCancelled;
        return (
          <div key={stage} className="flex items-center gap-0.5" title={STAGE_SHORT_LABEL[stage]}>
            <div
              className={[
                "h-1.5 w-4 rounded-full transition-colors",
                isCompleted ? "bg-primary" : "",
                isCurrent ? "bg-primary/50" : "",
                !isCompleted && !isCurrent ? "bg-border" : "",
              ].join(" ")}
            />
          </div>
        );
      })}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function OperacionesClient() {
  useSession();

  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const swrKey = (() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterEstado !== "all") params.set("estado", filterEstado);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("orderBy", "updatedAt");
    params.set("orderDir", "desc");
    return `/api/operaciones?${params}`;
  })();

  const { data: swrData, error: swrError, isLoading, mutate } = useSWR<{
    operaciones: Operacion[];
    total: number;
  }>(swrKey, { revalidateOnMount: true, keepPreviousData: true });

  const operaciones = swrData?.operaciones ?? [];
  const total = swrData?.total ?? 0;
  const loading = isLoading && operaciones.length === 0;
  const error = swrError
    ? (swrError instanceof Error ? swrError.message : "Error al cargar operaciones")
    : null;

  const [crearOpen, setCrearOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [avanzarOp, setAvanzarOp] = useState<Operacion | null>(null);
  const [cerrarOp, setCerrarOp] = useState<Operacion | null>(null);
  const [cancelarOp, setCancelarOp] = useState<Operacion | null>(null);
  const [eliminarOp, setEliminarOp] = useState<Operacion | null>(null);
  const [guiaOpen, setGuiaOpen] = useState(false);

  const refetch = useCallback(() => { mutate(); }, [mutate]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <PageHeader
        title="Operaciones"
        description="Pipeline de operaciones inmobiliarias y su estado actual."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setGuiaOpen(true)}
              title="Cómo funciona Operaciones"
              aria-label="Abrir guía de Operaciones"
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setCrearOpen(true)} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Nueva Operación
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border/60 rounded-lg p-2 shadow-sm">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por código o propiedad..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="w-full bg-transparent border-none focus:ring-0 text-sm pl-9 pr-4 py-1.5 placeholder:text-muted-foreground"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="h-6 w-px bg-border/60 hidden sm:block mx-2" />
          <Select value={filterEstado} onValueChange={(val) => { setFilterEstado(val); setOffset(0); }}>
            <SelectTrigger className="w-[140px] bg-transparent border-border/50 h-8 text-sm focus:ring-1 focus:ring-secondary/50">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {PIPELINE_OPERACION_ESTADO_VALUES.map((e) => (
                <SelectItem key={e} value={e}>{operacionEstadoFilterLabels[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <Fade key="error">
            <Card className="border-destructive/30">
              <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
            </Card>
          </Fade>
        )}

        {loading && !error && (
          <Fade key="loading">
            <Card>
              <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando operaciones...
              </CardContent>
            </Card>
          </Fade>
        )}

        {!loading && !error && operaciones.length === 0 && (
          <FadeIn key="empty">
            <EmptyState
              icon={Search}
              title="No se encontraron operaciones"
              description="Ajusta los filtros de búsqueda o crea una nueva operación para comenzar."
              className="bg-card border border-border/60 rounded-lg shadow-sm"
            />
          </FadeIn>
        )}

        {!loading && !error && operaciones.length > 0 && (
          <FadeIn key="data">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
            <TableBody>
              {operaciones.map((op) => (
                <TableRow
                  key={op.id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    // Prevent opening the detail drawer when the click comes from row actions.
                    if (target.closest("button, a, [role='menuitem']")) return;
                    setDetalleId(op.id);
                  }}
                >
                  <TableCell className="font-mono text-xs font-medium">
                    <div>{op.propertyCode}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">{op.codigo}</div>
                  </TableCell>
                  <TableCell>
                    <div className="relative h-10 w-16 overflow-hidden rounded bg-muted">
                      {op.property?.mainPhotoUrl ? (
                        <Image
                          src={op.property.mainPhotoUrl}
                          alt={op.propertyCode}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{op.ciudad || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={estadoBadgeVariant(op.estado)} className="text-[10px]">
                      {operacionEstadoFilterLabels[op.estado as keyof typeof operacionEstadoFilterLabels] ?? op.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <CompactStepper estado={op.estado} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {totalDays(op)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(op.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!isTerminal(op.estado) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                            title="Avanzar etapa"
                            aria-label="Avanzar etapa"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAvanzarOp(op);
                            }}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            title="Cerrar operación"
                            aria-label="Cerrar operación"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCerrarOp(op);
                            }}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="h-7 w-7"
                            aria-label="Opciones de operación"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => setDetalleId(op.id)} className="text-xs gap-2">
                            <Eye className="h-3 w-3" /> Ver detalle
                          </DropdownMenuItem>
                          {!isTerminal(op.estado) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setCancelarOp(op)} className="text-xs gap-2 text-destructive">
                                <XCircle className="h-3 w-3" /> Cancelar
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setEliminarOp(op)}
                            className="text-xs gap-2 text-destructive"
                          >
                            <Trash2 className="h-3 w-3" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </Card>
        </FadeIn>
        )}
      </AnimatePresence>

      {total > limit && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {total} operaciones · Pág. {currentPage}/{totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <CrearOperacionDialog open={crearOpen} onOpenChange={setCrearOpen} onSuccess={refetch} />

      {detalleId && (
        <DetalleSheet operacionId={detalleId} onClose={() => setDetalleId(null)} onRefresh={refetch} />
      )}

      {avanzarOp && (
        <AvanzarDialog
          operacion={avanzarOp}
          onOpenChange={(open) => { if (!open) setAvanzarOp(null); }}
          onSuccess={refetch}
        />
      )}

      {cerrarOp && (
        <CerrarDialog
          operacion={cerrarOp}
          onOpenChange={(open) => { if (!open) setCerrarOp(null); }}
          onSuccess={refetch}
        />
      )}

      {cancelarOp && (
        <CancelarDialog
          operacion={cancelarOp}
          onOpenChange={(open) => { if (!open) setCancelarOp(null); }}
          onSuccess={refetch}
        />
      )}

      {eliminarOp && (
        <EliminarDialog
          operacion={eliminarOp}
          onOpenChange={(open) => {
            if (!open) setEliminarOp(null);
          }}
          onSuccess={refetch}
        />
      )}

      <OperacionesGuiaDialog open={guiaOpen} onOpenChange={setGuiaOpen} />
    </div>
  );
}
