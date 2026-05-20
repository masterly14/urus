"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PencilLine,
  Plus,
  SquareStack,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EMPTY_ADDITIONAL_CLAUSES_DOC,
  isAdditionalClausesDocEmpty,
  type AdditionalClausesDoc,
} from "@/lib/contracts/additional-clauses/types";
import {
  type SectionAddendum,
  type SectionAddendumType,
  type SectionAddendumsList,
} from "@/lib/contracts/section-addendums/types";
import {
  getSectionCatalogForKind,
  getSectionLabel,
} from "@/lib/contracts/section-addendums/catalog";
import { MiniRichEditor } from "./mini-rich-editor";

/**
 * Gestor de "detalles por sección" del contrato.
 *
 * Patrón UX (alineado con .cursor/rules/ux-patterns.mdc y docs/saas-ux-guide.md):
 * - Card colapsable, oculta por defecto cuando no hay detalles (ruido cero).
 * - CTA primario único: "Añadir detalle".
 * - Dialog para crear/editar: 1 sección (Select del catálogo) + 1 tipo
 *   semántico (Select cerrado) + editor mini WYSIWYG (mismo subset TipTap
 *   que cláusulas adicionales). Único primary "Añadir a {SECCIÓN}".
 * - Listado agrupado por sección con acciones inline (Editar / Quitar).
 * - Quitar pide confirmación con AlertDialog (acción destructiva).
 * - Persistencia: PATCH /api/contracts/[id] con `sectionAddendums`.
 *   Optimista: cambia la UI inmediatamente, revierte si el servidor falla.
 *
 * Persistencia:
 * - El componente es la fuente de verdad UI de la lista en memoria.
 * - Tras cada PATCH OK invoca `onPersisted(updatedAt, list)` para que el
 *   padre regenere el DOCX (mismo patrón que el editor de cláusulas).
 */

type SaveState = "idle" | "saving" | "saved" | "error";

export interface SectionAddendumsManagerProps {
  contractId: string;
  documentKind: string;
  initialAddendums: SectionAddendumsList;
  readOnly: boolean;
  /**
   * Se invoca tras un PATCH exitoso con la lista resultante y el
   * timestamp del servidor. El padre lo usa típicamente para regenerar
   * el preview DOCX.
   */
  onPersisted?: (
    updatedAt: string | null,
    list: SectionAddendumsList,
  ) => void;
}

type DialogMode =
  | { mode: "closed" }
  | { mode: "create"; sectionId: string; type: SectionAddendumType }
  | {
      mode: "edit";
      addendum: SectionAddendum;
    };

function generateLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `addendum_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function groupBySection(list: SectionAddendumsList): Record<string, SectionAddendum[]> {
  const grouped: Record<string, SectionAddendum[]> = {};
  for (const addendum of list) {
    const arr = grouped[addendum.sectionId] ?? [];
    arr.push(addendum);
    grouped[addendum.sectionId] = arr;
  }
  return grouped;
}

export interface SectionAddendumsManagerRef {
  openCreateForSection: (sectionId: string) => void;
  saveAddendum: (sectionId: string, contentDoc: AdditionalClausesDoc) => Promise<void>;
}

export const SectionAddendumsManager = forwardRef<SectionAddendumsManagerRef, SectionAddendumsManagerProps>(function SectionAddendumsManager({
  contractId,
  documentKind,
  initialAddendums,
  readOnly,
  onPersisted,
}, ref) {
  const sectionCatalog = useMemo(
    () => getSectionCatalogForKind(documentKind),
    [documentKind],
  );

  const [list, setList] = useState<SectionAddendumsList>(initialAddendums);
  const [expanded, setExpanded] = useState(initialAddendums.length > 0);
  const [dialogState, setDialogState] = useState<DialogMode>({ mode: "closed" });
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previousListRef = useRef<SectionAddendumsList>(initialAddendums);

  // Si el contrato se recarga desde el servidor, sincronizamos la lista.
  useEffect(() => {
    setList(initialAddendums);
    previousListRef.current = initialAddendums;
    if (initialAddendums.length > 0) setExpanded(true);
  }, [initialAddendums]);

  const persist = useCallback(
    async (nextList: SectionAddendumsList) => {
      previousListRef.current = list;
      setList(nextList);
      setSaveState("saving");
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/contracts/${contractId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionAddendums: nextList }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `Error HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          ok: true;
          sectionAddendumsUpdatedAt: string | null;
        };
        setSaveState("saved");
        onPersisted?.(data.sectionAddendumsUpdatedAt, nextList);
      } catch (error) {
        // Revierte el cambio optimista.
        setList(previousListRef.current);
        setSaveState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "No se pudo guardar",
        );
      }
    },
    [contractId, list, onPersisted],
  );

  const handleOpenCreate = useCallback(
    (sectionId?: string) => {
      const firstSection = sectionId ?? sectionCatalog[0]?.id ?? "";
      setDialogState({
        mode: "create",
        sectionId: firstSection,
        type: "notes",
      });
    },
    [sectionCatalog],
  );

  const handleSubmit = useCallback(
    async (params: {
      sectionId: string;
      type: SectionAddendumType;
      contentDoc: AdditionalClausesDoc;
    }) => {
      if (isAdditionalClausesDocEmpty(params.contentDoc)) {
        setErrorMessage("El detalle no puede estar vacío.");
        return;
      }
      setErrorMessage(null);

      const nowIso = new Date().toISOString();
      let nextList: SectionAddendumsList;

      if (dialogState.mode === "edit") {
        nextList = list.map((a) =>
          a.id === dialogState.addendum.id
            ? {
                ...a,
                sectionId: params.sectionId,
                type: params.type,
                contentDoc: params.contentDoc,
                updatedAtIso: nowIso,
              }
            : a,
        );
      } else {
        const newAddendum: SectionAddendum = {
          id: generateLocalId(),
          sectionId: params.sectionId,
          type: params.type,
          contentDoc: params.contentDoc,
          updatedAtIso: nowIso,
        };
        nextList = [...list, newAddendum];
      }

      setDialogState({ mode: "closed" });
      if (!expanded) setExpanded(true);
      await persist(nextList);
    },
    [dialogState, expanded, list, persist],
  );

  // Expone la API imperativa para que el preview interactivo
  // pueda abrir el modal o guardar directamente desde el botón "+".
  useImperativeHandle(ref, () => ({
    openCreateForSection: (sectionId: string) => {
      if (!readOnly) {
        handleOpenCreate(sectionId);
      }
    },
    saveAddendum: async (sectionId, contentDoc) => {
      if (readOnly) return;
      await handleSubmit({ sectionId, type: "notes", contentDoc });
    },
  }));

  const handleConfirmRemove = useCallback(async () => {
    if (!pendingRemoveId) return;
    const nextList = list.filter((a) => a.id !== pendingRemoveId);
    setPendingRemoveId(null);
    await persist(nextList);
  }, [list, pendingRemoveId, persist]);

  const grouped = useMemo(() => groupBySection(list), [list]);
  const sectionIdsWithContent = useMemo(
    () =>
      sectionCatalog
        .map((entry) => entry.id)
        .filter((id) => (grouped[id]?.length ?? 0) > 0),
    [grouped, sectionCatalog],
  );

  // No hay catálogo (kind sin soporte): no renderizamos nada para no
  // confundir al comercial.
  if (sectionCatalog.length === 0) return null;

  const hasContent = list.length > 0;
  const totalCount = list.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2.5 pb-2">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-left flex-1 min-w-0"
            aria-expanded={expanded}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              <SquareStack className="h-3.5 w-3.5 text-muted-foreground" />
              Detalles por sección
              <span className="text-xs font-normal text-muted-foreground">
                {hasContent ? `(${totalCount})` : "(opcional)"}
              </span>
            </CardTitle>
          </button>

          <div className="flex items-center gap-2">
            {saveState === "saving" && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando…
              </span>
            )}
            {saveState === "saved" && (
              <span className="text-[10px] text-[var(--urus-success)] flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Guardado
              </span>
            )}
            {saveState === "error" && (
              <span className="text-[10px] text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Error
              </span>
            )}
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => handleOpenCreate()}
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir detalle
              </Button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground"
              aria-label={expanded ? "Colapsar" : "Expandir"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0 border-t border-border/30">
          {readOnly && (
            <div className="bg-urus-warning/10 border-b border-urus-warning/30 px-4 py-2 text-xs text-urus-warning">
              El contrato ya no está en borrador. Los detalles son solo de lectura.
            </div>
          )}

          {errorMessage && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              {errorMessage}
            </div>
          )}

          {!hasContent ? (
            <EmptyState
              readOnly={readOnly}
              onAdd={() => handleOpenCreate()}
            />
          ) : (
            <div className="divide-y divide-border/30">
              {sectionIdsWithContent.map((sectionId) => {
                const items = grouped[sectionId] ?? [];
                return (
                  <SectionGroup
                    key={sectionId}
                    sectionLabel={getSectionLabel(documentKind, sectionId)}
                    items={items}
                    readOnly={readOnly}
                    onAdd={() => handleOpenCreate(sectionId)}
                    onEdit={(addendum) =>
                      setDialogState({ mode: "edit", addendum })
                    }
                    onRemove={(id) => setPendingRemoveId(id)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      )}

      <SectionAddendumDialog
        documentKind={documentKind}
        state={dialogState}
        onClose={() => setDialogState({ mode: "closed" })}
        onSubmit={handleSubmit}
      />

      <AlertDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este detalle?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará del contrato. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRemove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
});

function EmptyState({
  readOnly,
  onAdd,
}: {
  readOnly: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="px-6 py-8 text-center space-y-3">
      <p className="text-sm text-muted-foreground">
        Sin detalles añadidos. Útil para ampliar una sección concreta
        (p.&nbsp;ej. añadir anejos al inmueble, datos registrales extra,
        cargas conocidas u observaciones).
      </p>
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir el primero
        </Button>
      )}
    </div>
  );
}

interface SectionGroupProps {
  sectionLabel: string;
  items: SectionAddendum[];
  readOnly: boolean;
  onAdd: () => void;
  onEdit: (addendum: SectionAddendum) => void;
  onRemove: (id: string) => void;
}

function SectionGroup({
  sectionLabel,
  items,
  readOnly,
  onAdd,
  onEdit,
  onRemove,
}: SectionGroupProps) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {sectionLabel}
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onAdd}
            aria-label={`Añadir otro detalle a ${sectionLabel}`}
          >
            <Plus className="h-3 w-3 mr-1" />
            Añadir otro
          </Button>
        )}
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-start justify-between gap-2 rounded-md border border-border/40 bg-card px-3 py-2 hover:bg-accent/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs text-foreground line-clamp-2">
                {summariseContent(item.contentDoc)}
              </div>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onEdit(item)}
                  aria-label="Editar detalle"
                >
                  <PencilLine className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(item.id)}
                  aria-label="Quitar detalle"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function summariseContent(doc: AdditionalClausesDoc): string {
  const parts: string[] = [];
  for (const block of doc.content ?? []) {
    if (block.type === "paragraph") {
      const text = (block.content ?? [])
        .filter((n) => n.type === "text")
        .map((n) => n.text)
        .join("");
      if (text.trim().length > 0) parts.push(text.trim());
    } else {
      for (const item of block.content ?? []) {
        for (const p of item.content ?? []) {
          const text = (p.content ?? [])
            .filter((n) => n.type === "text")
            .map((n) => n.text)
            .join("");
          if (text.trim().length > 0) parts.push(`• ${text.trim()}`);
        }
      }
    }
  }
  const merged = parts.join(" · ");
  return merged.length > 0 ? merged : "(sin contenido)";
}

interface SectionAddendumDialogProps {
  documentKind: string;
  state: DialogMode;
  onClose: () => void;
  onSubmit: (params: {
    sectionId: string;
    type: SectionAddendumType;
    contentDoc: AdditionalClausesDoc;
  }) => void;
}

function SectionAddendumDialog({
  documentKind,
  state,
  onClose,
  onSubmit,
}: SectionAddendumDialogProps) {
  const isOpen = state.mode !== "closed";
  const isEdit = state.mode === "edit";
  const sectionCatalog = useMemo(
    () => getSectionCatalogForKind(documentKind),
    [documentKind],
  );

  const [sectionId, setSectionId] = useState<string>("");
  const [contentDoc, setContentDoc] = useState<AdditionalClausesDoc>(
    EMPTY_ADDITIONAL_CLAUSES_DOC,
  );

  useEffect(() => {
    if (state.mode === "create") {
      setSectionId(state.sectionId);
      setContentDoc(EMPTY_ADDITIONAL_CLAUSES_DOC);
    } else if (state.mode === "edit") {
      setSectionId(state.addendum.sectionId);
      setContentDoc(state.addendum.contentDoc);
    }
  }, [state]);

  const sectionEntry = useMemo(
    () => sectionCatalog.find((entry) => entry.id === sectionId),
    [sectionCatalog, sectionId],
  );

  const isContentEmpty = isAdditionalClausesDocEmpty(contentDoc);
  const canSubmit = !!sectionId && !isContentEmpty;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? `Editar detalle de "${sectionEntry?.label ?? sectionId}"`
              : "Añadir detalle a una sección"}
          </DialogTitle>
          <DialogDescription>
            Se insertará dentro de la sección elegida, antes del cierre.
            Redacta de forma clara y profesional.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="section-id" className="text-xs">
              Sección del contrato
            </Label>
            <Select
              value={sectionId}
              onValueChange={(v) => setSectionId(v)}
            >
              <SelectTrigger id="section-id" className="h-9">
                <SelectValue placeholder="Selecciona una sección" />
              </SelectTrigger>
              <SelectContent>
                {sectionCatalog.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sectionEntry?.hint && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {sectionEntry.hint}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Contenido</Label>
          <MiniRichEditor
            initialDoc={contentDoc}
            onChange={setContentDoc}
            minHeightClassName="min-h-[160px]"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({ sectionId, type: "notes", contentDoc })
            }
            className={cn(
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {isEdit
              ? "Guardar cambios"
              : sectionEntry
                ? `Añadir a "${sectionEntry.label}"`
                : "Añadir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
