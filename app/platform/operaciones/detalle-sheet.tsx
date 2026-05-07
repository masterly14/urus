"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  FileText,
  Clock,
  MessageSquare,
  CheckSquare,
  Paperclip,
  Plus,
  Pencil,
  Trash2,
  Save,
  Upload,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Home,
  MapPin,
  Euro,
  Ruler,
  BedDouble,
  Bath,
  ImageOff,
  UserRound,
  Phone,
  IdCard,
  Mail,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { operacionEstadoFilterLabels } from "@/lib/postventa/pipeline-filter-options";
import type { PanelAdjuntoDTO, PanelChecklistItemDTO, PanelNotaDTO } from "@/lib/postventa/panel/types";
import {
  ADJUNTO_ALLOWED_EXTENSIONS,
  ADJUNTO_MAX_FILE_BYTES,
  CHECKLIST_ITEM_MAX_LENGTH,
  NOTA_MAX_LENGTH,
} from "@/lib/postventa/panel/constants";
import { CompletarDatosDialog } from "./completar-datos-dialog";

interface Documento {
  id: string;
  documentKind: string;
  status: string;
  templateVersion: number | null;
  cloudinaryUrl: string | null;
  signedDocumentUrl: string | null;
  createdAt: string;
}

interface Evento {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

interface PropertyDetalle {
  codigo: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  numFotos: number;
  mainPhotoUrl: string | null;
  portalUrl: string | null;
  portalName: string | null;
  propietarioNombre: string | null;
  propietarioDni: string | null;
  propietarioPhone: string | null;
  propietarioDomicilioFiscal: string | null;
}

interface DemandDetalle {
  codigo: string;
  ref: string;
  nombre: string;
  estadoNombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  telefono: string;
  leadStatus: string;
  metrosMin: number | null;
  metrosMax: number | null;
  tipoOperacion: string | null;
}

interface ComercialDetalle {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  ciudad: string;
}

interface OperacionDetalle {
  id: string;
  codigo: string;
  propertyCode: string;
  estado: string;
  ciudad: string;
  comercialId: string | null;
  demandId: string | null;
  buyerClientId: string | null;
  sellerClientId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { notas: number; checklistItems: number; adjuntos: number };
  property: PropertyDetalle | null;
  demand: DemandDetalle | null;
  comercial: ComercialDetalle | null;
  documentos: Documento[];
  eventos: Evento[];
}

interface ComercialLite {
  id: string;
  nombre: string;
}

interface ColaboradorLite {
  id: string;
  nombre: string;
  tipo: string;
}

function docStatusBadge(status: string): "default" | "secondary" | "outline" {
  if (status === "SIGNED" || status === "APPROVED") return "default";
  if (status === "DRAFT") return "secondary";
  return "outline";
}

function docKindLabel(kind: string): string {
  const map: Record<string, string> = {
    arras: "Contrato de Arras",
    oferta_firme: "Oferta en Firme",
    senal_compra: "Señal de Compra",
  };
  return map[kind] ?? kind;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const notaRoleLabel: Record<PanelNotaDTO["authorRole"], string> = {
  ceo: "CEO",
  admin: "Admin",
  comercial: "Comercial",
};

const acceptExtensions = ADJUNTO_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Sin precio";
  return `${Math.round(value).toLocaleString("es-ES")} €`;
}

function formatBudget(min: number, max: number): string {
  if (min > 0 && max > 0) return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  if (max > 0) return `Hasta ${formatCurrency(max)}`;
  if (min > 0) return `Desde ${formatCurrency(min)}`;
  return "Sin presupuesto";
}

function formatMeters(min: number | null, max: number | null): string {
  if (min && max) return `${min}-${max} m²`;
  if (min) return `Desde ${min} m²`;
  if (max) return `Hasta ${max} m²`;
  return "Sin metros definidos";
}

function displayValue(value: string | null | undefined, fallback = "Sin dato"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function portalLabel(portalName: string | null): string {
  return portalName ? `Ver en ${portalName}` : "Ver anuncio";
}

export function DetalleSheet({
  operacionId,
  onClose,
  onRefresh,
}: {
  operacionId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<OperacionDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completarOpen, setCompletarOpen] = useState(false);
  const [tab, setTab] = useState<"notas" | "checklist" | "adjuntos">("notas");

  const [panelLoading, setPanelLoading] = useState(true);
  const [comerciales, setComerciales] = useState<ComercialLite[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorLite[]>([]);

  const [notas, setNotas] = useState<PanelNotaDTO[]>([]);
  const [nuevaNota, setNuevaNota] = useState("");
  const [creandoNota, setCreandoNota] = useState(false);
  const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
  const [notaEditContent, setNotaEditContent] = useState("");

  const [checklist, setChecklist] = useState<PanelChecklistItemDTO[]>([]);
  const [nuevoItem, setNuevoItem] = useState("");
  const [nuevoResponsable, setNuevoResponsable] = useState<string>("");
  const [nuevoColaborador, setNuevoColaborador] = useState<string>("");
  const [creandoItem, setCreandoItem] = useState(false);
  const [editandoItemId, setEditandoItemId] = useState<string | null>(null);
  const [itemEditTexto, setItemEditTexto] = useState("");

  const [adjuntos, setAdjuntos] = useState<PanelAdjuntoDTO[]>([]);
  const [quota, setQuota] = useState<{
    maxFileBytes: number;
    maxTotalBytes: number;
    usedBytes: number;
    availableBytes: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const syncCounts = (
    n: PanelNotaDTO[] = notas,
    c: PanelChecklistItemDTO[] = checklist,
    a: PanelAdjuntoDTO[] = adjuntos,
  ) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            _count: {
              ...prev._count,
              notas: n.length,
              checklistItems: c.length,
              adjuntos: a.length,
            },
          }
        : prev,
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/operaciones/${operacionId}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${res.status}`);
        }
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setData(body.operacion);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [operacionId]);

  useEffect(() => {
    let cancelled = false;
    setPanelLoading(true);

    Promise.all([
      fetch(`/api/postventa/operaciones/${operacionId}/notas`, { credentials: "same-origin" }),
      fetch(`/api/postventa/operaciones/${operacionId}/checklist`, { credentials: "same-origin" }),
      fetch(`/api/postventa/operaciones/${operacionId}/adjuntos`, { credentials: "same-origin" }),
      fetch("/api/comerciales/activos", { credentials: "same-origin" }),
      fetch("/api/colaboradores?activo=true", { credentials: "same-origin" }),
    ])
      .then(async ([notasRes, checklistRes, adjuntosRes, comercialesRes, colaboradoresRes]) => {
        if (!notasRes.ok) {
          const body = await notasRes.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${notasRes.status} cargando notas`);
        }
        if (!checklistRes.ok) {
          const body = await checklistRes.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${checklistRes.status} cargando checklist`);
        }
        if (!adjuntosRes.ok) {
          const body = await adjuntosRes.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${adjuntosRes.status} cargando adjuntos`);
        }
        if (!comercialesRes.ok) {
          const body = await comercialesRes.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${comercialesRes.status} cargando comerciales`);
        }

        const notasBody = (await notasRes.json()) as { notas: PanelNotaDTO[] };
        const checklistBody = (await checklistRes.json()) as { items: PanelChecklistItemDTO[] };
        const adjuntosBody = (await adjuntosRes.json()) as {
          adjuntos: PanelAdjuntoDTO[];
          quota: {
            maxFileBytes: number;
            maxTotalBytes: number;
            usedBytes: number;
            availableBytes: number;
          };
        };
        const comercialesBody = (await comercialesRes.json()) as {
          comerciales?: Array<{ id: string; nombre: string }>;
        };
        const colaboradoresBody = colaboradoresRes.ok
          ? ((await colaboradoresRes.json()) as {
              colaboradores?: Array<{ id: string; nombre: string; tipo: string }>;
            })
          : { colaboradores: [] };

        if (!cancelled) {
          const nextNotas = notasBody.notas ?? [];
          const nextChecklist = checklistBody.items ?? [];
          const nextAdjuntos = adjuntosBody.adjuntos ?? [];
          setNotas(nextNotas);
          setChecklist(nextChecklist);
          setAdjuntos(nextAdjuntos);
          setQuota(adjuntosBody.quota ?? null);
          setComerciales((comercialesBody.comerciales ?? []).map((c) => ({ id: c.id, nombre: c.nombre })));
          setColaboradores(
            (colaboradoresBody.colaboradores ?? []).map((c) => ({
              id: c.id,
              nombre: c.nombre,
              tipo: c.tipo,
            })),
          );
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  _count: {
                    ...prev._count,
                    notas: nextNotas.length,
                    checklistItems: nextChecklist.length,
                    adjuntos: nextAdjuntos.length,
                  },
                }
              : prev,
          );
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error cargando panel");
      })
      .finally(() => {
        if (!cancelled) setPanelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operacionId]);

  const crearNota = async () => {
    const content = nuevaNota.trim();
    if (!content) return;
    setCreandoNota(true);
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al crear nota");
      }
      const body = (await res.json()) as { nota: PanelNotaDTO };
      const next = [body.nota, ...notas];
      setNotas(next);
      setNuevaNota("");
      syncCounts(next, checklist, adjuntos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear nota");
    } finally {
      setCreandoNota(false);
    }
  };

  const guardarEdicionNota = async (notaId: string) => {
    const content = notaEditContent.trim();
    if (!content) return;
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/notas/${notaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al editar nota");
      }
      const body = (await res.json()) as { nota: PanelNotaDTO };
      setNotas((prev) => {
        const next = prev.map((n) => (n.id === notaId ? body.nota : n));
        syncCounts(next, checklist, adjuntos);
        return next;
      });
      setEditandoNotaId(null);
      setNotaEditContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al editar nota");
    }
  };

  const eliminarNota = async (notaId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/notas/${notaId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al eliminar nota");
      }
      const next = notas.filter((n) => n.id !== notaId);
      setNotas(next);
      syncCounts(next, checklist, adjuntos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar nota");
    }
  };

  const checklistCompletados = useMemo(
    () => checklist.filter((item) => item.completado).length,
    [checklist],
  );

  const crearItem = async () => {
    const texto = nuevoItem.trim();
    if (!texto) return;
    setCreandoItem(true);
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          texto,
          responsableComercialId: nuevoResponsable || null,
          responsableColaboradorId: nuevoColaborador || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al crear ítem");
      }
      const body = (await res.json()) as { item: PanelChecklistItemDTO };
      const next = [...checklist, body.item];
      setChecklist(next);
      setNuevoItem("");
      setNuevoResponsable("");
      setNuevoColaborador("");
      syncCounts(notas, next, adjuntos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear ítem");
    } finally {
      setCreandoItem(false);
    }
  };

  const actualizarItem = async (
    itemId: string,
    patch: {
      texto?: string;
      completado?: boolean;
      responsableComercialId?: string | null;
      responsableColaboradorId?: string | null;
      orden?: number;
    },
  ) => {
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al actualizar ítem");
      }
      const body = (await res.json()) as { item: PanelChecklistItemDTO };
      const resolvedComercial = body.item.responsableComercialId
        ? comerciales.find((c) => c.id === body.item.responsableComercialId)?.nombre ?? null
        : null;
      const resolvedColaborador = body.item.responsableColaboradorId
        ? colaboradores.find((c) => c.id === body.item.responsableColaboradorId)?.nombre ?? null
        : null;
      const merged = {
        ...body.item,
        responsableNombre: resolvedComercial,
        responsableColaboradorNombre: resolvedColaborador,
      };
      const next = checklist.map((item) => (item.id === itemId ? merged : item));
      setChecklist(next);
      syncCounts(notas, next, adjuntos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar ítem");
    }
  };

  const eliminarItem = async (itemId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/checklist/${itemId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al eliminar ítem");
      }
      const next = checklist.filter((item) => item.id !== itemId);
      setChecklist(next);
      syncCounts(notas, next, adjuntos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar ítem");
    }
  };

  const moverItem = async (itemId: string, dir: "up" | "down") => {
    const idx = checklist.findIndex((item) => item.id === itemId);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= checklist.length) return;

    const reordered = [...checklist];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    setChecklist(reordered);
    syncCounts(notas, reordered, adjuntos);

    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/checklist/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ itemIds: reordered.map((item) => item.id) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error reordenando checklist");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reordenando checklist");
    }
  };

  const subirAdjunto = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/adjuntos`, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al subir adjunto");
      }

      const body = (await res.json()) as { adjunto: PanelAdjuntoDTO };
      const next = [body.adjunto, ...adjuntos];
      setAdjuntos(next);
      setQuota((prev) =>
        prev
          ? {
              ...prev,
              usedBytes: prev.usedBytes + body.adjunto.bytes,
              availableBytes: Math.max(0, prev.availableBytes - body.adjunto.bytes),
            }
          : prev,
      );
      syncCounts(notas, checklist, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir adjunto");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const property = data?.property ?? null;
  const demand = data?.demand ?? null;
  const comercial = data?.comercial ?? null;
  const propertyTitle =
    property?.titulo?.trim() ||
    property?.ref?.trim() ||
    (data ? `Propiedad ${data.propertyCode}` : "Propiedad");
  const propertyLocation = [property?.zona, property?.ciudad || data?.ciudad]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
  const ownerName = displayValue(property?.propietarioNombre, "Propietario sin identificar");
  const ownerPhone = displayValue(property?.propietarioPhone, "Sin teléfono");
  const ownerDni = displayValue(property?.propietarioDni, "Sin DNI");
  const ownerAddress = displayValue(property?.propietarioDomicilioFiscal, "Sin domicilio fiscal");

  const eliminarAdjunto = async (adjuntoId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/adjuntos/${adjuntoId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al eliminar adjunto");
      }
      const removed = adjuntos.find((a) => a.id === adjuntoId);
      const next = adjuntos.filter((a) => a.id !== adjuntoId);
      setAdjuntos(next);
      if (removed) {
        setQuota((prev) =>
          prev
            ? {
                ...prev,
                usedBytes: Math.max(0, prev.usedBytes - removed.bytes),
                availableBytes: Math.min(prev.maxTotalBytes, prev.availableBytes + removed.bytes),
              }
            : prev,
        );
      }
      syncCounts(notas, checklist, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar adjunto");
    }
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>{data?.codigo ?? "Operación"}</SheetTitle>
          <SheetDescription>Detalle de la operación</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-destructive">{error}</div>
        )}

        {data && (
          <div className="space-y-5 p-4">
            {/* Resumen comercial */}
            <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
              <div className="relative aspect-[16/10] bg-muted/40">
                {property?.mainPhotoUrl ? (
                  // La URL viene de Inmovilla/Cloudinary y no siempre pasa por next/image config.
                  <Image
                    src={property.mainPhotoUrl}
                    alt={propertyTitle}
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="h-7 w-7" />
                    <span className="text-xs">
                      {property?.numFotos ? `${property.numFotos} fotos en Inmovilla` : "Sin imagen sincronizada"}
                    </span>
                  </div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {operacionEstadoFilterLabels[data.estado as keyof typeof operacionEstadoFilterLabels] ?? data.estado}
                  </Badge>
                  {property?.estado && <Badge variant="outline" className="bg-background/90">{property.estado}</Badge>}
                </div>
                {property?.portalUrl && (
                  <a
                    href={property.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur hover:bg-background"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {portalLabel(property.portalName)}
                  </a>
                )}
              </div>

              <div className="space-y-4 p-4">
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold leading-tight">{propertyTitle}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {propertyLocation || "Ubicación sin sincronizar"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold">{formatCurrency(property?.precio ?? 0)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {property?.ref ? `Ref. ${property.ref}` : `Ficha ${data.propertyCode}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-border/40 p-2">
                    <Ruler className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
                    <p className="font-medium">{property?.metrosConstruidos ? `${property.metrosConstruidos} m²` : "Sin m²"}</p>
                    <p className="text-[10px] text-muted-foreground">Superficie</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-2">
                    <BedDouble className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
                    <p className="font-medium">{property?.habitaciones ? property.habitaciones : "Sin dato"}</p>
                    <p className="text-[10px] text-muted-foreground">Habitaciones</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-2">
                    <Bath className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
                    <p className="font-medium">{property?.banyos ? property.banyos : "Sin dato"}</p>
                    <p className="text-[10px] text-muted-foreground">Baños</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-2">
                    <Home className="mb-1 h-3.5 w-3.5 text-muted-foreground" />
                    <p className="font-medium">{displayValue(property?.tipoOfer, "Sin tipo")}</p>
                    <p className="text-[10px] text-muted-foreground">Tipología</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-border/50 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  Propietario
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <p className="font-medium">{ownerName}</p>
                    <p className="text-muted-foreground">{ownerAddress}</p>
                  </div>
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {ownerPhone}
                  </p>
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <IdCard className="h-3.5 w-3.5" />
                    {ownerDni}
                  </p>
                  {data.sellerClientId && (
                    <p className="text-[10px] text-muted-foreground">Cliente Inmovilla: {data.sellerClientId}</p>
                  )}
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-border/50 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Demanda / comprador
                </div>
                {demand ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{displayValue(demand.nombre, "Comprador sin nombre")}</p>
                        <p className="text-muted-foreground">{displayValue(demand.estadoNombre, demand.leadStatus)}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{demand.leadStatus}</Badge>
                    </div>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {displayValue(demand.telefono, "Sin teléfono")}
                    </p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Euro className="h-3.5 w-3.5" />
                      {formatBudget(demand.presupuestoMin, demand.presupuestoMax)}
                    </p>
                    <p className="text-muted-foreground">
                      {displayValue(demand.zonas, "Sin zonas")} · {displayValue(demand.tipos, "Sin tipología")}
                    </p>
                    <p className="text-muted-foreground">
                      {demand.habitacionesMin > 0 ? `${demand.habitacionesMin}+ hab.` : "Habitaciones sin definir"} · {formatMeters(demand.metrosMin, demand.metrosMax)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>No hay demanda local asociada.</p>
                    {data.demandId && <p>Ref. demanda: {data.demandId}</p>}
                    {data.buyerClientId && <p>Cliente comprador: {data.buyerClientId}</p>}
                  </div>
                )}
              </section>
            </div>

            <div className="rounded-xl border border-border/50 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Gestión comercial</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Operación creada el {new Date(data.createdAt).toLocaleDateString("es-ES")}
                    {data.closedAt ? ` · cerrada el ${new Date(data.closedAt).toLocaleDateString("es-ES")}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{data.codigo}</Badge>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" />
                  {comercial?.nombre ?? data.comercialId ?? "Sin comercial"}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {displayValue(comercial?.telefono, "Sin teléfono")}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {displayValue(comercial?.email, "Sin email")}
                </p>
              </div>
            </div>

            {/* Counters */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {data._count.notas} notas</span>
              <span className="flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" /> {data._count.checklistItems} checklist</span>
              <span className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> {data._count.adjuntos} adjuntos</span>
            </div>

            {/* Panel Operativo */}
            <div>
              <h3 className="text-sm font-medium mb-2">Panel Operativo (Notas, Checklist, Adjuntos)</h3>
              {panelLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border/50 p-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando panel...
                </div>
              ) : (
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as typeof tab)}
                  className="flex-col"
                >
                  <TabsList className="h-auto w-full grid grid-cols-3 gap-1 p-1">
                    <TabsTrigger value="notas" className="min-w-0 gap-1 px-2 py-1.5 text-[11px]">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span className="truncate">Notas</span>
                      {notas.length > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-[18px] shrink-0 px-1 text-[9px]">
                          {notas.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="checklist" className="min-w-0 gap-1 px-2 py-1.5 text-[11px]">
                      <CheckSquare className="h-3.5 w-3.5" />
                      <span className="truncate">Checklist</span>
                      {checklist.length > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-[30px] shrink-0 px-1 text-[9px]">
                          {checklistCompletados}/{checklist.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="adjuntos" className="min-w-0 gap-1 px-2 py-1.5 text-[11px]">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="truncate">Adjuntos</span>
                      {adjuntos.length > 0 && (
                        <Badge variant="secondary" className="h-4 min-w-[18px] shrink-0 px-1 text-[9px]">
                          {adjuntos.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="notas" className="mt-3 w-full space-y-3">
                    <div className="space-y-2 rounded-lg border border-border/50 p-3">
                      <textarea
                        value={nuevaNota}
                        onChange={(e) => setNuevaNota(e.target.value.slice(0, NOTA_MAX_LENGTH))}
                        rows={3}
                        placeholder="Añade una nota interna para esta operación..."
                        className="w-full resize-none rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {nuevaNota.length} / {NOTA_MAX_LENGTH}
                        </span>
                        <Button
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={crearNota}
                          disabled={creandoNota || !nuevaNota.trim()}
                        >
                          {creandoNota ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          Añadir nota
                        </Button>
                      </div>
                    </div>

                    {notas.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Sin notas todavía.</p>
                    ) : (
                      <ul className="space-y-2">
                        {notas.map((nota) => (
                          <li key={nota.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground">
                                  {nota.authorName}
                                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                    · {notaRoleLabel[nota.authorRole]}
                                  </span>
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {formatDateTime(nota.createdAt)}
                                  {nota.updatedAt !== nota.createdAt ? " · editada" : ""}
                                </p>
                              </div>

                              {nota.canEdit && editandoNotaId !== nota.id && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setEditandoNotaId(nota.id);
                                      setNotaEditContent(nota.content);
                                    }}
                                    aria-label="Editar nota"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => eliminarNota(nota.id)}
                                    aria-label="Eliminar nota"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            {editandoNotaId === nota.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={notaEditContent}
                                  onChange={(e) => setNotaEditContent(e.target.value.slice(0, NOTA_MAX_LENGTH))}
                                  rows={3}
                                  className="w-full resize-none rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setEditandoNotaId(null);
                                      setNotaEditContent("");
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => guardarEdicionNota(nota.id)}
                                    disabled={!notaEditContent.trim()}
                                  >
                                    <Save className="h-3 w-3" /> Guardar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs whitespace-pre-wrap text-foreground/90">{nota.content}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>

                  <TabsContent value="checklist" className="mt-3 w-full space-y-3">
                    <div className="space-y-2 rounded-lg border border-border/50 p-3">
                      <input
                        type="text"
                        value={nuevoItem}
                        onChange={(e) => setNuevoItem(e.target.value.slice(0, CHECKLIST_ITEM_MAX_LENGTH))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void crearItem();
                          }
                        }}
                        placeholder="Nuevo ítem (ej: Solicitar nota simple)"
                        className="w-full rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30"
                      />
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <select
                          value={nuevoResponsable}
                          onChange={(e) => setNuevoResponsable(e.target.value)}
                          className="min-w-0 rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                          <option value="">Sin responsable</option>
                          {comerciales.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </select>
                        <select
                          value={nuevoColaborador}
                          onChange={(e) => setNuevoColaborador(e.target.value)}
                          className="min-w-0 rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                          <option value="">Sin colaborador</option>
                          {colaboradores.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre} ({c.tipo})
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={crearItem}
                          disabled={creandoItem || !nuevoItem.trim()}
                        >
                          {creandoItem ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          Añadir
                        </Button>
                      </div>
                    </div>

                    {checklist.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Sin ítems en el checklist.</p>
                    ) : (
                      <ul className="space-y-2">
                        {checklist.map((item, idx) => (
                          <li key={item.id} className="flex items-start gap-2 rounded-lg border border-border/50 p-2.5">
                            <button
                              type="button"
                              onClick={() => void actualizarItem(item.id, { completado: !item.completado })}
                              className="mt-0.5 shrink-0"
                              aria-label={item.completado ? "Marcar pendiente" : "Marcar completado"}
                            >
                              <span
                                className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                                  item.completado ? "border-emerald-600 bg-emerald-600 text-white" : "border-border/60"
                                }`}
                              >
                                {item.completado && <Check className="h-3 w-3" />}
                              </span>
                            </button>

                            <div className="min-w-0 flex-1 space-y-1.5">
                              {editandoItemId === item.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={itemEditTexto}
                                    onChange={(e) => setItemEditTexto(e.target.value.slice(0, CHECKLIST_ITEM_MAX_LENGTH))}
                                    className="flex-1 rounded-md border border-border/50 bg-background/60 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      const texto = itemEditTexto.trim();
                                      if (!texto) return;
                                      void actualizarItem(item.id, { texto });
                                      setEditandoItemId(null);
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setEditandoItemId(null);
                                      setItemEditTexto("");
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <p className={`text-xs ${item.completado ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {item.texto}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                                <select
                                  value={item.responsableComercialId ?? ""}
                                  onChange={(e) =>
                                    void actualizarItem(item.id, { responsableComercialId: e.target.value || null })
                                  }
                                  className="max-w-[130px] truncate rounded border border-border/50 bg-transparent px-1.5 py-0.5 text-[10px] focus:outline-none"
                                  title="Responsable (comercial)"
                                >
                                  <option value="">Sin responsable</option>
                                  {comerciales.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nombre}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={item.responsableColaboradorId ?? ""}
                                  onChange={(e) =>
                                    void actualizarItem(item.id, { responsableColaboradorId: e.target.value || null })
                                  }
                                  className="max-w-[130px] truncate rounded border border-border/50 bg-transparent px-1.5 py-0.5 text-[10px] focus:outline-none"
                                  title="Colaborador externo"
                                >
                                  <option value="">Sin colaborador</option>
                                  {colaboradores.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nombre}
                                    </option>
                                  ))}
                                </select>
                                {item.completado && item.completadoAt && <span>· completado {formatDateTime(item.completadoAt)}</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => void moverItem(item.id, "up")}
                                disabled={idx === 0}
                                aria-label="Mover arriba"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => void moverItem(item.id, "down")}
                                disabled={idx === checklist.length - 1}
                                aria-label="Mover abajo"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              {editandoItemId !== item.id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditandoItemId(item.id);
                                    setItemEditTexto(item.texto);
                                  }}
                                  aria-label="Editar ítem"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => void eliminarItem(item.id)}
                                aria-label="Eliminar ítem"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>

                  <TabsContent value="adjuntos" className="mt-3 w-full space-y-3">
                    <div className="space-y-2 rounded-lg border border-border/50 p-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={acceptExtensions}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void subirAdjunto(file);
                        }}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                        >
                          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {uploading ? "Subiendo..." : "Subir archivo"}
                        </Button>
                        <span className="text-[10px] text-muted-foreground">
                          {quota ? `${formatBytes(quota.usedBytes)} / ${formatBytes(quota.maxTotalBytes)} usados` : ""}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Máx. {formatBytes(ADJUNTO_MAX_FILE_BYTES)} por archivo. Formatos: {ADJUNTO_ALLOWED_EXTENSIONS.join(", ")}.
                      </p>
                    </div>

                    {adjuntos.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Sin adjuntos en esta operación.</p>
                    ) : (
                      <ul className="space-y-2">
                        {adjuntos.map((adj) => (
                          <li key={adj.id} className="flex items-center gap-2 rounded-lg border border-border/50 p-2.5">
                            <FileText className="h-4 w-4 text-secondary shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{adj.nombre}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatBytes(adj.bytes)} · {adj.uploadedByName} · {formatDateTime(adj.createdAt)}
                              </p>
                            </div>
                            <a
                              href={adj.cloudinaryUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex p-1 rounded hover:bg-accent/40 transition-colors"
                              aria-label="Abrir adjunto"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                            {adj.canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => void eliminarAdjunto(adj.id)}
                                aria-label="Eliminar adjunto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {/* Documents */}
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Documentos ({data.documentos.length})
              </h3>
              {data.documentos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin documentos generados.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.documentos.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium">{docKindLabel(doc.documentKind)}</span>
                        {doc.templateVersion && <span className="text-muted-foreground ml-1">v{doc.templateVersion}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={docStatusBadge(doc.status)}>{doc.status}</Badge>
                        {doc.cloudinaryUrl && (
                          <a href={doc.cloudinaryUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                            Ver
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!data.estado.startsWith("CERRADA_") && data.estado !== "CANCELADA" && (
                <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => setCompletarOpen(true)}>
                  Completar datos para contrato
                </Button>
              )}
            </div>

            {/* Events timeline */}
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Eventos recientes ({data.eventos.length})
              </h3>
              {data.eventos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin eventos.</p>
              ) : (
                <div className="space-y-1">
                  {data.eventos.slice(0, 20).map((evt) => (
                    <div key={evt.id} className="flex items-start gap-2 text-xs border-l-2 border-border pl-3 py-1">
                      <span className="text-muted-foreground whitespace-nowrap">
                        {new Date(evt.occurredAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="font-mono">{evt.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {data && completarOpen && (
          <CompletarDatosDialog
            operacion={data}
            onOpenChange={setCompletarOpen}
            onSuccess={() => {
              setCompletarOpen(false);
              onRefresh();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
