"use client";

import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MiniRichEditor } from "./mini-rich-editor";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";

interface InlineAdditionalClauseEditorProps {
  clauseNumber: number;
  existingClauses: Array<{ number: number; headingText: string }>;
  onClose: () => void;
  onSave: (title: string, contentDoc: AdditionalClausesDoc) => Promise<void>;
  onDelete: (clauseNumber: number) => Promise<void>;
}

export function InlineAdditionalClauseEditor({
  clauseNumber,
  existingClauses,
  onClose,
  onSave,
  onDelete,
}: InlineAdditionalClauseEditorProps) {
  const [title, setTitle] = useState("");
  const [contentDoc, setContentDoc] = useState<AdditionalClausesDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingClauseNumber, setDeletingClauseNumber] = useState<number | null>(null);
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
      setErrorMessage("Escribe el contenido de la cláusula antes de guardar.");
      return;
    }
    if (!title.trim()) {
      setErrorMessage("Añade un título corto para la cláusula.");
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      await onSave(title, contentDoc);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetClauseNumber: number) => {
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la cláusula ${targetClauseNumber}? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    setErrorMessage(null);
    setDeletingClauseNumber(targetClauseNumber);
    try {
      await onDelete(targetClauseNumber);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo eliminar.");
    } finally {
      setDeletingClauseNumber(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-card-foreground">
      <div>
        <div className="text-[13px] font-semibold">Nueva cláusula {clauseNumber}</div>
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          Se añadirá al final del apartado de cláusulas en el contrato.
        </p>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la cláusula"
        disabled={saving}
      />

      <MiniRichEditor
        initialDoc={initialDoc}
        onChange={setContentDoc}
        minHeightClassName="min-h-[140px]"
        disabled={saving || deletingClauseNumber != null}
      />

      {errorMessage ? <p className="text-[11.5px] text-destructive">{errorMessage}</p> : null}

      {existingClauses.length > 0 ? (
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">
            Cláusulas añadidas
          </p>
          <div className="space-y-1.5">
            {existingClauses.map((clause) => (
              <div
                key={clause.number}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-2 py-1.5"
              >
                <span className="text-[11.5px] text-foreground truncate">
                  {clause.headingText}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={saving || deletingClauseNumber != null}
                  onClick={() => void handleDelete(clause.number)}
                >
                  {deletingClauseNumber === clause.number ? (
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

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={saving || deletingClauseNumber != null}
          size="sm"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || deletingClauseNumber != null}
          size="sm"
        >
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Guardar cláusula
        </Button>
      </div>
    </div>
  );
}
