"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { Plus, Search, ChevronLeft, ChevronRight, ArrowRight, CheckCircle, XCircle, Loader2, MoreHorizontal, Eye, Info } from "lucide-react";
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
import { useSession } from "@/lib/hooks/use-session";
import { operacionEstadoFilterLabels, PIPELINE_OPERACION_ESTADO_VALUES } from "@/lib/postventa/pipeline-filter-options";
import { CrearOperacionDialog } from "./crear-operacion-dialog";
import { DetalleSheet } from "./detalle-sheet";
import { AvanzarDialog } from "./avanzar-dialog";
import { CerrarDialog } from "./cerrar-dialog";
import { CancelarDialog } from "./cancelar-dialog";
import { OperacionesGuiaDialog } from "./operaciones-guia-dialog";

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

function daysInState(updatedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000));
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
  const [guiaOpen, setGuiaOpen] = useState(false);

  const refetch = useCallback(() => { mutate(); }, [mutate]);

  const isTerminal = (estado: string) =>
    estado.startsWith("CERRADA_") || estado === "CANCELADA";

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <h1 className="text-sm font-semibold">Operaciones</h1>
              <Button
                variant="outline"
                size="icon-xs"
                className="h-7 w-7"
                onClick={() => setGuiaOpen(true)}
                title="Como funciona Operaciones"
                aria-label="Abrir guia de Operaciones"
              >
                <Info className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por código o propiedad..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
                  className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <select
                value={filterEstado}
                onChange={(e) => { setFilterEstado(e.target.value); setOffset(0); }}
                className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              >
                <option value="all">Todos</option>
                {PIPELINE_OPERACION_ESTADO_VALUES.map((e) => (
                  <option key={e} value={e}>{operacionEstadoFilterLabels[e]}</option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={() => setCrearOpen(true)} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Nueva
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando operaciones...
          </CardContent>
        </Card>
      )}

      {!loading && !error && operaciones.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No se encontraron operaciones.
          </CardContent>
        </Card>
      )}

      {!loading && operaciones.length > 0 && (
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
                  <TableCell className="font-mono text-xs font-medium">{op.codigo}</TableCell>
                  <TableCell className="text-xs">{op.propertyCode}</TableCell>
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
                    {isTerminal(op.estado) ? "—" : daysInState(op.updatedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(op.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="h-6 w-6"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => setDetalleId(op.id)} className="text-xs gap-2">
                          <Eye className="h-3 w-3" /> Ver detalle
                        </DropdownMenuItem>
                        {!isTerminal(op.estado) && (
                          <>
                            <DropdownMenuItem onClick={() => setAvanzarOp(op)} className="text-xs gap-2">
                              <ArrowRight className="h-3 w-3" /> Avanzar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setCerrarOp(op)} className="text-xs gap-2">
                              <CheckCircle className="h-3 w-3" /> Cerrar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setCancelarOp(op)} className="text-xs gap-2 text-destructive">
                              <XCircle className="h-3 w-3" /> Cancelar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

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

      <OperacionesGuiaDialog open={guiaOpen} onOpenChange={setGuiaOpen} />
    </div>
  );
}
