"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { MiniRichEditor } from "./mini-rich-editor";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";

interface InlineSectionAddendumEditorProps {
  sectionId: string;
  existingDetails: Array<{ id: string; previewText: string }>;
  onClose: () => void;
  onSave: (sectionId: string, contentDoc: AdditionalClausesDoc) => Promise<void>;
  onDelete: (sectionId: string, addendumId: string) => Promise<void>;
}

export function InlineSectionAddendumEditor({
  sectionId,
  existingDetails,
  onClose,
  onSave,
  onDelete,
}: InlineSectionAddendumEditorProps) {
  const [contentDoc, setContentDoc] = useState<AdditionalClausesDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialDoc = useMemo<AdditionalClausesDoc>(
    () => ({ type: "doc", content: [{ type: "paragraph" }] }),
    [],
  );

  const isEmpty = useMemo(() => {
    if (!contentDoc) return true;
    const text = (contentDoc.content ?? [])
      .map((b) => {
        if (b.type !== "paragraph") return "";
        return (b.content ?? [])
          .filter((n) => n.type === "text")
          .map((n) => n.text ?? "")
          .join("");
      })
      .join("")
      .trim();
    return text.length === 0;
  }, [contentDoc]);

  const handleSave = async () => {
    if (!contentDoc || isEmpty) {
      setErrorMessage("Escribe algo antes de guardar.");
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      await onSave(sectionId, contentDoc);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (addendumId: string) => {
    const confirmed = window.confirm("¿Seguro que quieres eliminar este detalle?");
    if (!confirmed) return;
    setErrorMessage(null);
    setDeletingId(addendumId);
    try {
      await onDelete(sectionId, addendumId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 text-card-foreground shadow-card">
      <div>
        <div className="text-[13px] font-semibold">Añadir detalle a esta sección</div>
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          Escribe el contenido libremente. Se insertará directamente dentro de este bloque.
        </p>
      </div>

      <MiniRichEditor
        initialDoc={initialDoc}
        onChange={setContentDoc}
        minHeightClassName="min-h-[140px]"
        disabled={saving || deletingId != null}
      />

      {existingDetails.length > 0 ? (
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
            Detalles añadidos en esta sección
          </p>
          <div className="space-y-1.5">
            {existingDetails.map((detail) => (
              <div
                key={detail.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-2 py-1.5"
              >
                <span className="truncate text-[11.5px] text-foreground">{detail.previewText}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={saving || deletingId != null}
                  onClick={() => void handleDelete(detail.id)}
                >
                  {deletingId === detail.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-[11.5px] text-destructive">{errorMessage}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={saving || deletingId != null}
          size="sm"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || deletingId != null || isEmpty}
          size="sm"
        >
          {saving ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Guardar detalle
        </Button>
      </div>
    </div>
  );
}
