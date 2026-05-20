"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PreviewFieldAnchor } from "@/lib/legal/smart-closing/preview-field-anchors";

interface InlinePayloadFieldEditorProps {
  anchor: PreviewFieldAnchor;
  onClose: () => void;
  onSave: (path: string, rawValue: string) => Promise<boolean>;
}

export function InlinePayloadFieldEditor({
  anchor,
  onClose,
  onSave,
}: InlinePayloadFieldEditorProps) {
  const [value, setValue] = useState(anchor.value);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDirty = useMemo(() => value !== anchor.value, [value, anchor.value]);

  const handleSave = async () => {
    if (!isDirty) {
      onClose();
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const ok = await onSave(anchor.path, value);
      if (!ok) {
        setErrorMessage("No se pudo guardar el cambio.");
        return;
      }
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-0.5">
        <p className="text-[12px] font-semibold text-foreground">{anchor.label}</p>
        <p className="text-[10.5px] text-muted-foreground">{anchor.path}</p>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        autoFocus
      />
      {errorMessage ? <p className="text-[11px] text-destructive">{errorMessage}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}
