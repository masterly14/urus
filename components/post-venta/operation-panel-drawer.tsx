"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    StickyNote,
    CheckSquare,
    Paperclip,
    Plus,
    Trash2,
    Pencil,
    FileText,
    Upload,
    Loader2,
    ExternalLink,
    Check,
    X,
    ArrowUp,
    ArrowDown,
    Save,
} from "lucide-react";
import type {
    PanelAdjuntoDTO,
    PanelChecklistItemDTO,
    PanelNotaDTO,
} from "@/lib/postventa/panel/types";
import {
    ADJUNTO_ALLOWED_EXTENSIONS,
    ADJUNTO_MAX_FILE_BYTES,
    CHECKLIST_ITEM_MAX_LENGTH,
    NOTA_MAX_LENGTH,
} from "@/lib/postventa/panel/constants";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    operacionId: string;
    operacionCodigo?: string | null;
    /** Para mostrar metadatos de contexto arriba del drawer. */
    operacionTitulo?: string;
    /** Comerciales disponibles para asignar responsable de un checklist item. */
    comerciales?: Array<{ id: string; nombre: string }>;
    /** Llamado cuando cambia cualquier contador (notas/checklist/adjuntos) para
     *  que el padre actualice la tarjeta del pipeline. */
    onSummaryChange?: (summary: {
        notasVisibles: number;
        checklistTotal: number;
        checklistCompletados: number;
        adjuntos: number;
    }) => void;
}

const acceptExtensions = ADJUNTO_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function OperationPanelDrawer({
    open,
    onOpenChange,
    operacionId,
    operacionCodigo,
    operacionTitulo,
    comerciales = [],
    onSummaryChange,
}: Props) {
    const [tab, setTab] = useState<"notas" | "checklist" | "adjuntos">("notas");

    const [notas, setNotas] = useState<PanelNotaDTO[]>([]);
    const [checklist, setChecklist] = useState<PanelChecklistItemDTO[]>([]);
    const [adjuntos, setAdjuntos] = useState<PanelAdjuntoDTO[]>([]);
    const [quota, setQuota] = useState<{
        maxFileBytes: number;
        maxTotalBytes: number;
        usedBytes: number;
        availableBytes: number;
    } | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadedRef = useRef(false);

    const emitSummary = useCallback(
        (
            n: PanelNotaDTO[] = notas,
            c: PanelChecklistItemDTO[] = checklist,
            a: PanelAdjuntoDTO[] = adjuntos,
        ) => {
            onSummaryChange?.({
                notasVisibles: n.length,
                checklistTotal: c.length,
                checklistCompletados: c.filter((i) => i.completado).length,
                adjuntos: a.length,
            });
        },
        [notas, checklist, adjuntos, onSummaryChange],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [notasRes, checklistRes, adjuntosRes] = await Promise.all([
                fetch(`/api/postventa/operaciones/${operacionId}/notas`, {
                    credentials: "same-origin",
                }),
                fetch(`/api/postventa/operaciones/${operacionId}/checklist`, {
                    credentials: "same-origin",
                }),
                fetch(`/api/postventa/operaciones/${operacionId}/adjuntos`, {
                    credentials: "same-origin",
                }),
            ]);
            if (!notasRes.ok) throw new Error("Error cargando notas");
            if (!checklistRes.ok) throw new Error("Error cargando checklist");
            if (!adjuntosRes.ok) throw new Error("Error cargando adjuntos");

            const notasBody = (await notasRes.json()) as { notas: PanelNotaDTO[] };
            const checklistBody = (await checklistRes.json()) as {
                items: PanelChecklistItemDTO[];
            };
            const adjuntosBody = (await adjuntosRes.json()) as {
                adjuntos: PanelAdjuntoDTO[];
                quota: NonNullable<typeof quota>;
            };

            setNotas(notasBody.notas);
            setChecklist(checklistBody.items);
            setAdjuntos(adjuntosBody.adjuntos);
            setQuota(adjuntosBody.quota);
            emitSummary(notasBody.notas, checklistBody.items, adjuntosBody.adjuntos);
            loadedRef.current = true;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error cargando panel");
        } finally {
            setLoading(false);
        }
        // emitSummary depends on state which we're about to overwrite; ignored intentionally.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [operacionId]);

    useEffect(() => {
        if (open && !loadedRef.current) {
            void load();
        }
        if (!open) {
            loadedRef.current = false;
        }
    }, [open, load]);

    // ── Notas ────────────────────────────────────────────────
    const [nuevaNota, setNuevaNota] = useState("");
    const [creandoNota, setCreandoNota] = useState(false);
    const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
    const [notaEditContent, setNotaEditContent] = useState("");

    const crearNota = async () => {
        const content = nuevaNota.trim();
        if (!content) return;
        setCreandoNota(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/notas`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ content }),
                },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al crear nota");
            }
            const body = (await res.json()) as { nota: PanelNotaDTO };
            const next = [body.nota, ...notas];
            setNotas(next);
            setNuevaNota("");
            emitSummary(next, checklist, adjuntos);
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
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/notas/${notaId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ content }),
                },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al editar");
            }
            const body = (await res.json()) as { nota: PanelNotaDTO };
            setNotas((prev) => prev.map((n) => (n.id === notaId ? body.nota : n)));
            setEditandoNotaId(null);
            setNotaEditContent("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al editar nota");
        }
    };

    const eliminarNota = async (notaId: string) => {
        setError(null);
        try {
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/notas/${notaId}`,
                { method: "DELETE", credentials: "same-origin" },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al eliminar");
            }
            const next = notas.filter((n) => n.id !== notaId);
            setNotas(next);
            emitSummary(next, checklist, adjuntos);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al eliminar nota");
        }
    };

    // ── Checklist ────────────────────────────────────────────
    const [nuevoItem, setNuevoItem] = useState("");
    const [nuevoResponsable, setNuevoResponsable] = useState<string>("");
    const [creandoItem, setCreandoItem] = useState(false);
    const [editandoItemId, setEditandoItemId] = useState<string | null>(null);
    const [itemEditTexto, setItemEditTexto] = useState("");

    const crearItem = async () => {
        const texto = nuevoItem.trim();
        if (!texto) return;
        setCreandoItem(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/checklist`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        texto,
                        responsableComercialId: nuevoResponsable || null,
                    }),
                },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al crear ítem");
            }
            const body = (await res.json()) as { item: PanelChecklistItemDTO };
            const next = [...checklist, body.item];
            setChecklist(next);
            setNuevoItem("");
            setNuevoResponsable("");
            emitSummary(notas, next, adjuntos);
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
        },
    ) => {
        setError(null);
        try {
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/checklist/${itemId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(patch),
                },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al actualizar");
            }
            const body = (await res.json()) as { item: PanelChecklistItemDTO };
            // responsableNombre no viene en la respuesta simple; lo resolvemos aquí.
            const resolvedName =
                body.item.responsableComercialId
                    ? comerciales.find((c) => c.id === body.item.responsableComercialId)
                          ?.nombre ?? null
                    : null;
            const merged = { ...body.item, responsableNombre: resolvedName };
            const next = checklist.map((i) => (i.id === itemId ? merged : i));
            setChecklist(next);
            emitSummary(notas, next, adjuntos);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al actualizar");
        }
    };

    const eliminarItem = async (itemId: string) => {
        setError(null);
        try {
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/checklist/${itemId}`,
                { method: "DELETE", credentials: "same-origin" },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al eliminar");
            }
            const next = checklist.filter((i) => i.id !== itemId);
            setChecklist(next);
            emitSummary(notas, next, adjuntos);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al eliminar");
        }
    };

    const moverItem = async (itemId: string, dir: "up" | "down") => {
        const idx = checklist.findIndex((i) => i.id === itemId);
        if (idx < 0) return;
        const newIdx = dir === "up" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= checklist.length) return;
        const reordered = [...checklist];
        const [moved] = reordered.splice(idx, 1);
        reordered.splice(newIdx, 0, moved);
        setChecklist(reordered);

        try {
            await fetch(
                `/api/postventa/operaciones/${operacionId}/checklist/reorder`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ itemIds: reordered.map((i) => i.id) }),
                },
            );
        } catch {
            // En caso de fallo, recargamos para resincronizar.
            void load();
        }
    };

    // ── Adjuntos ─────────────────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const subirAdjunto = async (file: File) => {
        setUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/adjuntos`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    body: formData,
                },
            );
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
                          availableBytes: Math.max(
                              0,
                              prev.availableBytes - body.adjunto.bytes,
                          ),
                      }
                    : prev,
            );
            emitSummary(notas, checklist, next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al subir adjunto");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const eliminarAdjunto = async (adjuntoId: string) => {
        setError(null);
        try {
            const res = await fetch(
                `/api/postventa/operaciones/${operacionId}/adjuntos/${adjuntoId}`,
                { method: "DELETE", credentials: "same-origin" },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? "Error al eliminar");
            }
            const removed = adjuntos.find((a) => a.id === adjuntoId);
            const next = adjuntos.filter((a) => a.id !== adjuntoId);
            setAdjuntos(next);
            if (removed && quota) {
                setQuota({
                    ...quota,
                    usedBytes: Math.max(0, quota.usedBytes - removed.bytes),
                    availableBytes: Math.min(
                        quota.maxTotalBytes,
                        quota.availableBytes + removed.bytes,
                    ),
                });
            }
            emitSummary(notas, checklist, next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al eliminar adjunto");
        }
    };

    const checklistCompletados = useMemo(
        () => checklist.filter((i) => i.completado).length,
        [checklist],
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="sm:max-w-xl w-full overflow-hidden flex flex-col"
            >
                <SheetHeader className="border-b border-border/40 pb-3">
                    <SheetTitle className="text-base">
                        Panel de operación {operacionCodigo ?? ""}
                    </SheetTitle>
                    {operacionTitulo && (
                        <SheetDescription className="text-xs text-muted-foreground">
                            {operacionTitulo}
                        </SheetDescription>
                    )}
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-4 pb-6">
                    {error && (
                        <div className="mb-3 rounded-lg border border-[var(--urus-danger)]/40 bg-[var(--urus-danger)]/10 p-2 text-xs text-[var(--urus-danger)]">
                            {error}
                        </div>
                    )}
                    {loading && !loadedRef.current ? (
                        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando panel...
                        </div>
                    ) : (
                        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                            <TabsList className="w-full grid grid-cols-3">
                                <TabsTrigger value="notas" className="gap-1.5">
                                    <StickyNote className="h-3.5 w-3.5" />
                                    Notas
                                    {notas.length > 0 && (
                                        <Badge variant="secondary" className="text-[9px] h-4 min-w-[18px] px-1">
                                            {notas.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="checklist" className="gap-1.5">
                                    <CheckSquare className="h-3.5 w-3.5" />
                                    Checklist
                                    {checklist.length > 0 && (
                                        <Badge variant="secondary" className="text-[9px] h-4 min-w-[30px] px-1">
                                            {checklistCompletados}/{checklist.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="adjuntos" className="gap-1.5">
                                    <Paperclip className="h-3.5 w-3.5" />
                                    Adjuntos
                                    {adjuntos.length > 0 && (
                                        <Badge variant="secondary" className="text-[9px] h-4 min-w-[18px] px-1">
                                            {adjuntos.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="notas" className="mt-3 space-y-3">
                                <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
                                    <textarea
                                        value={nuevaNota}
                                        onChange={(e) => setNuevaNota(e.target.value.slice(0, NOTA_MAX_LENGTH))}
                                        rows={3}
                                        placeholder="Añade una nota interna (solo visible internamente)..."
                                        className="w-full resize-none bg-background/60 border border-border/50 rounded-md px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                    />
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-muted-foreground">
                                            {nuevaNota.length} / {NOTA_MAX_LENGTH}
                                        </span>
                                        <Button
                                            size="xs"
                                            onClick={crearNota}
                                            disabled={creandoNota || !nuevaNota.trim()}
                                            className="gap-1"
                                        >
                                            {creandoNota ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Plus className="h-3 w-3" />
                                            )}
                                            Añadir nota
                                        </Button>
                                    </div>
                                </div>

                                {notas.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-4 text-center">
                                        Sin notas todavía.
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {notas.map((nota) => (
                                            <li
                                                key={nota.id}
                                                className="rounded-lg border border-border/40 bg-card/60 p-3 space-y-2"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[11px] font-medium text-foreground">
                                                            {nota.authorName}
                                                            <span className="text-muted-foreground ml-1.5 font-normal">
                                                                · {nota.authorRole}
                                                            </span>
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {formatDateTime(nota.createdAt)}
                                                            {nota.updatedAt !== nota.createdAt && " · editada"}
                                                        </p>
                                                    </div>
                                                    {nota.canEdit && editandoNotaId !== nota.id && (
                                                        <div className="flex gap-1 shrink-0">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                onClick={() => {
                                                                    setEditandoNotaId(nota.id);
                                                                    setNotaEditContent(nota.content);
                                                                }}
                                                                aria-label="Editar"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                onClick={() => eliminarNota(nota.id)}
                                                                aria-label="Eliminar"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>

                                                {editandoNotaId === nota.id ? (
                                                    <div className="space-y-2">
                                                        <textarea
                                                            value={notaEditContent}
                                                            onChange={(e) =>
                                                                setNotaEditContent(e.target.value.slice(0, NOTA_MAX_LENGTH))
                                                            }
                                                            rows={3}
                                                            className="w-full resize-none bg-background/60 border border-border/50 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                                        />
                                                        <div className="flex justify-end gap-1">
                                                            <Button
                                                                size="xs"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setEditandoNotaId(null);
                                                                    setNotaEditContent("");
                                                                }}
                                                            >
                                                                Cancelar
                                                            </Button>
                                                            <Button
                                                                size="xs"
                                                                onClick={() => guardarEdicionNota(nota.id)}
                                                                disabled={!notaEditContent.trim()}
                                                                className="gap-1"
                                                            >
                                                                <Save className="h-3 w-3" /> Guardar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs whitespace-pre-wrap text-foreground/90">
                                                        {nota.content}
                                                    </p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </TabsContent>

                            <TabsContent value="checklist" className="mt-3 space-y-3">
                                <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
                                    <input
                                        type="text"
                                        value={nuevoItem}
                                        onChange={(e) =>
                                            setNuevoItem(e.target.value.slice(0, CHECKLIST_ITEM_MAX_LENGTH))
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                void crearItem();
                                            }
                                        }}
                                        placeholder="Nuevo ítem (ej: Solicitar nota simple)"
                                        className="w-full bg-background/60 border border-border/50 rounded-md px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                    />
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={nuevoResponsable}
                                            onChange={(e) => setNuevoResponsable(e.target.value)}
                                            className="flex-1 bg-background/60 border border-border/50 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                        >
                                            <option value="">Sin responsable</option>
                                            {comerciales.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.nombre}
                                                </option>
                                            ))}
                                        </select>
                                        <Button
                                            size="xs"
                                            onClick={crearItem}
                                            disabled={creandoItem || !nuevoItem.trim()}
                                            className="gap-1"
                                        >
                                            {creandoItem ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Plus className="h-3 w-3" />
                                            )}
                                            Añadir
                                        </Button>
                                    </div>
                                </div>

                                {checklist.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-4 text-center">
                                        Sin ítems en el checklist.
                                    </p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {checklist.map((item, idx) => (
                                            <li
                                                key={item.id}
                                                className="flex items-start gap-2 rounded-lg border border-border/40 bg-card/60 p-2.5"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        actualizarItem(item.id, { completado: !item.completado })
                                                    }
                                                    className="mt-0.5 shrink-0"
                                                    aria-label={item.completado ? "Marcar pendiente" : "Marcar completado"}
                                                >
                                                    <span
                                                        className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                                                            item.completado
                                                                ? "border-[var(--urus-success)] bg-[var(--urus-success)] text-white"
                                                                : "border-border/60"
                                                        }`}
                                                    >
                                                        {item.completado && <Check className="h-3 w-3" />}
                                                    </span>
                                                </button>

                                                <div className="min-w-0 flex-1 space-y-1">
                                                    {editandoItemId === item.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="text"
                                                                value={itemEditTexto}
                                                                onChange={(e) =>
                                                                    setItemEditTexto(
                                                                        e.target.value.slice(0, CHECKLIST_ITEM_MAX_LENGTH),
                                                                    )
                                                                }
                                                                className="flex-1 bg-background/60 border border-border/50 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                                                            />
                                                            <Button
                                                                size="icon-sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    const texto = itemEditTexto.trim();
                                                                    if (!texto) return;
                                                                    void actualizarItem(item.id, { texto });
                                                                    setEditandoItemId(null);
                                                                }}
                                                                aria-label="Guardar"
                                                            >
                                                                <Check className="h-3 w-3" />
                                                            </Button>
                                                            <Button
                                                                size="icon-sm"
                                                                variant="ghost"
                                                                onClick={() => setEditandoItemId(null)}
                                                                aria-label="Cancelar"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <p
                                                            className={`text-xs ${
                                                                item.completado
                                                                    ? "text-muted-foreground line-through"
                                                                    : "text-foreground"
                                                            }`}
                                                        >
                                                            {item.texto}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                        <select
                                                            value={item.responsableComercialId ?? ""}
                                                            onChange={(e) =>
                                                                actualizarItem(item.id, {
                                                                    responsableComercialId: e.target.value || null,
                                                                })
                                                            }
                                                            className="bg-transparent border border-border/40 rounded px-1 py-0.5 text-[10px] focus:outline-none"
                                                        >
                                                            <option value="">Sin responsable</option>
                                                            {comerciales.map((c) => (
                                                                <option key={c.id} value={c.id}>
                                                                    {c.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {item.completado && item.completadoAt && (
                                                            <span>· completado {formatDateTime(item.completadoAt)}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => moverItem(item.id, "up")}
                                                        disabled={idx === 0}
                                                        aria-label="Mover arriba"
                                                    >
                                                        <ArrowUp className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => moverItem(item.id, "down")}
                                                        disabled={idx === checklist.length - 1}
                                                        aria-label="Mover abajo"
                                                    >
                                                        <ArrowDown className="h-3 w-3" />
                                                    </Button>
                                                    {editandoItemId !== item.id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            onClick={() => {
                                                                setEditandoItemId(item.id);
                                                                setItemEditTexto(item.texto);
                                                            }}
                                                            aria-label="Editar"
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => eliminarItem(item.id)}
                                                        aria-label="Eliminar"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </TabsContent>

                            <TabsContent value="adjuntos" className="mt-3 space-y-3">
                                <div className="space-y-2 rounded-lg border border-border/40 bg-card/40 p-3">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={acceptExtensions}
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) void subirAdjunto(f);
                                        }}
                                        className="hidden"
                                    />
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="gap-1"
                                        >
                                            {uploading ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Upload className="h-3 w-3" />
                                            )}
                                            {uploading ? "Subiendo..." : "Subir archivo"}
                                        </Button>
                                        <span className="text-[10px] text-muted-foreground">
                                            {quota
                                                ? `${formatBytes(quota.usedBytes)} / ${formatBytes(quota.maxTotalBytes)} usados`
                                                : ""}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        Máx. {formatBytes(ADJUNTO_MAX_FILE_BYTES)} por archivo.
                                        Formatos: {ADJUNTO_ALLOWED_EXTENSIONS.join(", ")}.
                                    </p>
                                </div>

                                {adjuntos.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-4 text-center">
                                        Sin adjuntos en esta operación.
                                    </p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {adjuntos.map((adj) => (
                                            <li
                                                key={adj.id}
                                                className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 p-2.5"
                                            >
                                                <FileText className="h-4 w-4 text-secondary shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium truncate">{adj.nombre}</p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {formatBytes(adj.bytes)} · {adj.uploadedByName} ·{" "}
                                                        {formatDateTime(adj.createdAt)}
                                                    </p>
                                                </div>
                                                <a
                                                    href={adj.cloudinaryUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex p-1 rounded hover:bg-accent/40 transition-colors"
                                                    aria-label="Abrir adjunto"
                                                >
                                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                                </a>
                                                {adj.canDelete && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => eliminarAdjunto(adj.id)}
                                                        aria-label="Eliminar"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
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
            </SheetContent>
        </Sheet>
    );
}
