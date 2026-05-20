"use client";

import { use, useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ArrowUp,
  ArrowDown,
  Check,
  X,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { OperacionSummaryCard } from "@/components/operaciones/operacion-summary-card";
import { CompletarDatosDialog } from "@/app/platform/operaciones/completar-datos-dialog";
import { OperacionColaboradoresSection } from "@/components/operaciones/colaboradores/operacion-colaboradores-section";
import { docStatusBadge, docKindLabel, formatDateTime, formatBytes, notaRoleLabel } from "@/lib/postventa/panel/helpers";
import { ADJUNTO_ALLOWED_EXTENSIONS, ADJUNTO_MAX_FILE_BYTES, CHECKLIST_ITEM_MAX_LENGTH, NOTA_MAX_LENGTH } from "@/lib/postventa/panel/constants";
import type { PanelAdjuntoDTO, PanelChecklistItemDTO, PanelNotaDTO } from "@/lib/postventa/panel/types";

export default function OperacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: operacionId } = use(params);
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completarOpen, setCompletarOpen] = useState(false);
  const [tab, setTab] = useState<"resumen" | "notas" | "checklist" | "adjuntos" | "documentos" | "historial">("resumen");

  const [panelLoading, setPanelLoading] = useState(true);
  const [comerciales, setComerciales] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);

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
  const [quota, setQuota] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchOperacion = () => {
    setLoading(true);
    fetch(`/api/operaciones/${operacionId}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Error ${res.status}`);
        }
        return res.json();
      })
      .then((body) => {
        setData(body.operacion);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOperacion();
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
        if (!notasRes.ok || !checklistRes.ok || !adjuntosRes.ok || !comercialesRes.ok) throw new Error("Error loading panel");
        const notasBody = await notasRes.json();
        const checklistBody = await checklistRes.json();
        const adjuntosBody = await adjuntosRes.json();
        const comercialesBody = await comercialesRes.json();
        const colaboradoresBody = colaboradoresRes.ok ? await colaboradoresRes.json() : { colaboradores: [] };

        if (!cancelled) {
          setNotas(notasBody.notas ?? []);
          setChecklist(checklistBody.items ?? []);
          setAdjuntos(adjuntosBody.adjuntos ?? []);
          setQuota(adjuntosBody.quota ?? null);
          setComerciales((comercialesBody.comerciales ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre })));
          setColaboradores((colaboradoresBody.colaboradores ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })));
        }
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setPanelLoading(false);
      });

    return () => { cancelled = true; };
  }, [operacionId]);

  const syncCounts = (
    n: PanelNotaDTO[] = notas,
    c: PanelChecklistItemDTO[] = checklist,
    a: PanelAdjuntoDTO[] = adjuntos,
  ) => {
    setData((prev: any) =>
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

  const crearNota = async () => {
    const content = nuevaNota.trim();
    if (!content) return;
    setCreandoNota(true);
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Error al crear nota");
      const body = await res.json();
      const next = [body.nota, ...notas];
      setNotas(next);
      setNuevaNota("");
      syncCounts(next, checklist, adjuntos);
    } catch (err) {
      console.error(err);
    } finally {
      setCreandoNota(false);
    }
  };

  const guardarEdicionNota = async (notaId: string) => {
    const content = notaEditContent.trim();
    if (!content) return;
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/notas/${notaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Error al editar nota");
      const body = await res.json();
      setNotas((prev) => {
        const next = prev.map((n) => (n.id === notaId ? body.nota : n));
        syncCounts(next, checklist, adjuntos);
        return next;
      });
      setEditandoNotaId(null);
      setNotaEditContent("");
    } catch (err) {
      console.error(err);
    }
  };

  const eliminarNota = async (notaId: string) => {
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/notas/${notaId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Error al eliminar nota");
      const next = notas.filter((n) => n.id !== notaId);
      setNotas(next);
      syncCounts(next, checklist, adjuntos);
    } catch (err) {
      console.error(err);
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
      if (!res.ok) throw new Error("Error al crear ítem");
      const body = await res.json();
      const next = [...checklist, body.item];
      setChecklist(next);
      setNuevoItem("");
      setNuevoResponsable("");
      setNuevoColaborador("");
      syncCounts(notas, next, adjuntos);
    } catch (err) {
      console.error(err);
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
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Error al actualizar ítem");
      const body = await res.json();
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
      console.error(err);
    }
  };

  const eliminarItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/checklist/${itemId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Error al eliminar ítem");
      const next = checklist.filter((item) => item.id !== itemId);
      setChecklist(next);
      syncCounts(notas, next, adjuntos);
    } catch (err) {
      console.error(err);
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
      if (!res.ok) throw new Error("Error reordenando checklist");
    } catch (err) {
      console.error(err);
    }
  };

  const subirAdjunto = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/adjuntos`, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      if (!res.ok) throw new Error("Error al subir adjunto");

      const body = await res.json();
      const next = [body.adjunto, ...adjuntos];
      setAdjuntos(next);
      setQuota((prev: any) =>
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
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const eliminarAdjunto = async (adjuntoId: string) => {
    try {
      const res = await fetch(`/api/postventa/operaciones/${operacionId}/adjuntos/${adjuntoId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Error al eliminar adjunto");
      const removed = adjuntos.find((a) => a.id === adjuntoId);
      const next = adjuntos.filter((a) => a.id !== adjuntoId);
      setAdjuntos(next);
      if (removed) {
        setQuota((prev: any) =>
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
      console.error(err);
    }
  };

  const acceptExtensions = ADJUNTO_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-6 text-destructive text-center">Error al cargar la operación</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 px-4">
      <Link href="/platform/operaciones" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
        <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Volver a Operaciones
      </Link>

      <PageHeader
        title={data.codigo}
        description="Ficha completa de la operación inmobiliaria"
        actions={
          <Button variant="outline" onClick={() => setCompletarOpen(true)}>
            Completar datos de contrato
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full flex flex-col">
        <TabsList className="mb-4 bg-muted/40 p-1 w-full justify-start overflow-x-auto flex-nowrap h-auto border border-border/50">
          <TabsTrigger value="resumen" className="text-xs">Resumen</TabsTrigger>
          <TabsTrigger value="colaboradores" className="text-xs">Colaboradores ({data.asignaciones?.length || 0})</TabsTrigger>
          <TabsTrigger value="notas" className="text-xs">Notas ({data._count.notas})</TabsTrigger>
          <TabsTrigger value="checklist" className="text-xs">Checklist</TabsTrigger>
          <TabsTrigger value="adjuntos" className="text-xs">Adjuntos ({data._count.adjuntos})</TabsTrigger>
          <TabsTrigger value="documentos" className="text-xs">Documentos ({data.documentos.length})</TabsTrigger>
          <TabsTrigger value="historial" className="text-xs">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 mt-0">
          <OperacionSummaryCard data={data} />
        </TabsContent>

        <TabsContent value="colaboradores" className="mt-0">
          <div className="rounded-xl border border-border/50 p-6 bg-card">
            <OperacionColaboradoresSection 
              operacionId={operacionId} 
              asignaciones={data.asignaciones || []} 
              onRefresh={fetchOperacion} 
            />
          </div>
        </TabsContent>

        <TabsContent value="notas" className="mt-0">
          <div className="rounded-xl border border-border/50 p-6 bg-card space-y-4">
            <h3 className="text-lg font-medium mb-4">Notas Internas</h3>
            
            <div className="space-y-2">
              <textarea
                value={nuevaNota}
                onChange={(e) => setNuevaNota(e.target.value.slice(0, NOTA_MAX_LENGTH))}
                rows={3}
                placeholder="Añade una nota interna para esta operación..."
                className="w-full resize-none rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {nuevaNota.length} / {NOTA_MAX_LENGTH}
                </span>
                <Button size="sm" onClick={crearNota} disabled={creandoNota || !nuevaNota.trim()} className="gap-1.5 h-8 text-xs">
                  {creandoNota ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Añadir nota
                </Button>
              </div>
            </div>

            {panelLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : notas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Sin notas todavía.</p>
            ) : (
              <ul className="space-y-3">
                {notas.map((nota) => (
                  <li key={nota.id} className="rounded-lg border border-border/50 p-4 space-y-2 bg-background/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {nota.authorName}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            · {notaRoleLabel[nota.authorRole]}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(nota.createdAt)}
                          {nota.updatedAt !== nota.createdAt ? " · editada" : ""}
                        </p>
                      </div>

                      {nota.canEdit && editandoNotaId !== nota.id && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditandoNotaId(nota.id); setNotaEditContent(nota.content); }}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => eliminarNota(nota.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {editandoNotaId === nota.id ? (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={notaEditContent}
                          onChange={(e) => setNotaEditContent(e.target.value.slice(0, NOTA_MAX_LENGTH))}
                          rows={3}
                          className="w-full resize-none rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditandoNotaId(null); setNotaEditContent(""); }}>Cancelar</Button>
                          <Button size="sm" onClick={() => guardarEdicionNota(nota.id)} disabled={!notaEditContent.trim()} className="gap-1.5">
                            <Save className="h-3.5 w-3.5" /> Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap text-foreground mt-2">{nota.content}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="checklist" className="mt-0">
          <div className="rounded-xl border border-border/50 p-6 bg-card space-y-4">
            <h3 className="text-lg font-medium mb-4">Checklist de Tareas</h3>
            
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-background/50">
              <input
                type="text"
                value={nuevoItem}
                onChange={(e) => setNuevoItem(e.target.value.slice(0, CHECKLIST_ITEM_MAX_LENGTH))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); crearItem(); } }}
                placeholder="Nuevo ítem (ej: Solicitar nota simple)"
                className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                <select
                  value={nuevoResponsable}
                  onChange={(e) => setNuevoResponsable(e.target.value)}
                  className="w-full rounded-md border border-border/50 bg-background/60 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 text-foreground"
                >
                  <option value="">Sin responsable (comercial)</option>
                  {comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select
                  value={nuevoColaborador}
                  onChange={(e) => setNuevoColaborador(e.target.value)}
                  className="w-full rounded-md border border-border/50 bg-background/60 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 text-foreground"
                >
                  <option value="">Sin colaborador externo</option>
                  {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
                </select>
                <Button size="sm" onClick={crearItem} disabled={creandoItem || !nuevoItem.trim()} className="gap-1.5 h-9 w-full sm:w-auto">
                  {creandoItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Añadir ítem
                </Button>
              </div>
            </div>

            {panelLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : checklist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Sin ítems en el checklist.</p>
            ) : (
              <ul className="space-y-2 mt-4">
                {checklist.map((item, idx) => (
                  <li key={item.id} className="flex items-start gap-3 rounded-lg border border-border/50 p-3 bg-background/30 hover:bg-muted/30 transition-colors">
                    <button
                      type="button"
                      onClick={() => actualizarItem(item.id, { completado: !item.completado })}
                      className="mt-1 shrink-0"
                    >
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        item.completado ? "border-emerald-600 bg-emerald-600 text-white" : "border-border/80 bg-background hover:bg-accent"
                      }`}>
                        {item.completado && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1 space-y-2">
                      {editandoItemId === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={itemEditTexto}
                            onChange={(e) => setItemEditTexto(e.target.value.slice(0, CHECKLIST_ITEM_MAX_LENGTH))}
                            className="flex-1 rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => {
                            if (itemEditTexto.trim()) { actualizarItem(item.id, { texto: itemEditTexto.trim() }); }
                            setEditandoItemId(null);
                          }}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setEditandoItemId(null); setItemEditTexto(""); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className={`text-sm ${item.completado ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>
                          {item.texto}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <select
                          value={item.responsableComercialId ?? ""}
                          onChange={(e) => actualizarItem(item.id, { responsableComercialId: e.target.value || null })}
                          className="max-w-[150px] truncate rounded border border-border/50 bg-background px-1.5 py-0.5 text-xs focus:outline-none"
                        >
                          <option value="">Sin responsable</option>
                          {comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <select
                          value={item.responsableColaboradorId ?? ""}
                          onChange={(e) => actualizarItem(item.id, { responsableColaboradorId: e.target.value || null })}
                          className="max-w-[150px] truncate rounded border border-border/50 bg-background px-1.5 py-0.5 text-xs focus:outline-none"
                        >
                          <option value="">Sin colaborador</option>
                          {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        {item.completado && item.completadoAt && <span>· completado {formatDateTime(item.completadoAt)}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity md:opacity-100">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => moverItem(item.id, "up")} disabled={idx === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => moverItem(item.id, "down")} disabled={idx === checklist.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      {editandoItemId !== item.id && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => { setEditandoItemId(item.id); setItemEditTexto(item.texto); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => eliminarItem(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="adjuntos" className="mt-0">
           <div className="rounded-xl border border-border/50 p-6 bg-card space-y-4">
            <h3 className="text-lg font-medium mb-4">Archivos Adjuntos</h3>
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border/50 p-4 bg-background/50">
              <input ref={fileInputRef} type="file" accept={acceptExtensions} onChange={(e) => { const f = e.target.files?.[0]; if (f) subirAdjunto(f); }} className="hidden" />
              <div className="flex-1 space-y-1 text-center sm:text-left">
                <p className="text-sm font-medium">Sube archivos relacionados a la operación</p>
                <p className="text-xs text-muted-foreground">Máx. {formatBytes(ADJUNTO_MAX_FILE_BYTES)}. Formatos: {ADJUNTO_ALLOWED_EXTENSIONS.join(", ")}.</p>
              </div>
              <div className="flex flex-col items-center sm:items-end gap-1 shrink-0">
                <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Subiendo..." : "Subir archivo"}
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  {quota ? `${formatBytes(quota.usedBytes)} / ${formatBytes(quota.maxTotalBytes)} usados` : ""}
                </span>
              </div>
            </div>

            {panelLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : adjuntos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Sin adjuntos en esta operación.</p>
            ) : (
              <ul className="space-y-2 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adjuntos.map((adj) => (
                  <li key={adj.id} className="flex items-center gap-3 rounded-lg border border-border/50 p-3 bg-background/30 hover:bg-muted/30 transition-colors group">
                    <div className="h-10 w-10 shrink-0 rounded-md bg-secondary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-secondary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-foreground">{adj.nombre}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {formatBytes(adj.bytes)} · {adj.uploadedByName} · {formatDateTime(adj.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={adj.cloudinaryUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Abrir adjunto">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      {adj.canDelete && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => eliminarAdjunto(adj.id)} title="Eliminar adjunto">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documentos" className="mt-0">
          <div className="rounded-xl border border-border/50 p-6 bg-card">
            <h3 className="text-lg font-medium mb-4">Documentos Legales</h3>
            {data.documentos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin documentos generados.</p>
            ) : (
              <div className="space-y-3">
                {data.documentos.map((doc: any) => (
                  <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-border/50 px-4 py-3 text-sm bg-background/50">
                    <div>
                      <span className="font-medium text-foreground">{docKindLabel(doc.documentKind)}</span>
                      {doc.templateVersion && <span className="text-muted-foreground ml-2 text-xs">v{doc.templateVersion}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={docStatusBadge(doc.status)}>{doc.status}</Badge>
                      {doc.cloudinaryUrl && (
                        <a href={doc.cloudinaryUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium text-sm inline-flex items-center gap-1">
                          Ver archivo <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="historial" className="mt-0">
          <div className="rounded-xl border border-border/50 p-6 bg-card">
            <h3 className="text-lg font-medium mb-4">Historial de Eventos</h3>
            {data.eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
            ) : (
              <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/60 before:to-transparent mt-4">
                {data.eventos.map((evt: any) => (
                  <div key={evt.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group py-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-background bg-accent text-muted-foreground group-hover:text-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10 transition-colors">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-background/50 border border-border/50 p-4 rounded-xl shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-semibold text-foreground">{evt.type}</span>
                      </div>
                      <time className="text-[10px] text-muted-foreground">{new Date(evt.occurredAt).toLocaleString("es-ES", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {completarOpen && (
        <CompletarDatosDialog
          operacion={data}
          onOpenChange={setCompletarOpen}
          onSuccess={() => {
            setCompletarOpen(false);
            fetchOperacion();
          }}
        />
      )}
    </div>
  );
}
