"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { isValidRefFormat, normalizeRef } from "@/lib/routing/parse-ref-code";
import {
  PropertyPreviewCard,
  type PropertyOption,
} from "@/components/captacion/property-selector";

interface RefPreviewResponse {
  exists: boolean;
  preview: PropertyOption | null;
  warnings?: string[];
}

interface RefInputProps {
  value: string;
  onChange: (value: string) => void;
  onPreviewChange?: (preview: RefPreviewResponse | null) => void;
}

export function RefInput({
  value,
  onChange,
  onPreviewChange,
}: RefInputProps) {
  const [loading, setLoading] = React.useState(false);
  const [preview, setPreview] = React.useState<RefPreviewResponse | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmed = value.trim();
  const normalized = normalizeRef(trimmed);
  const isValid = trimmed.length === 0 || isValidRefFormat(trimmed);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed || !isValidRefFormat(trimmed)) {
      setPreview(null);
      onPreviewChange?.(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/captacion/properties-by-ref?ref=${encodeURIComponent(normalized)}`,
        );
        if (!res.ok) {
          setPreview(null);
          onPreviewChange?.(null);
          return;
        }
        const data = (await res.json()) as RefPreviewResponse;
        setPreview(data);
        onPreviewChange?.(data);
      } catch {
        setPreview(null);
        onPreviewChange?.(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed, normalized, onPreviewChange]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onBlur={() => onChange(normalized)}
          placeholder="URUS09VFEDE"
          className="pr-10 font-mono"
          aria-invalid={!isValid}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {!isValid && (
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Use el formato URUS + número + V/A + iniciales, por ejemplo URUS09VFEDE.
        </p>
      )}

      {preview?.warnings?.map((warning) => (
        <p
          key={warning}
          className="flex items-center gap-2 text-sm font-medium text-amber-600"
        >
          <AlertTriangle className="h-4 w-4" />
          {warning}
        </p>
      ))}

      {preview?.exists && preview.preview ? (
        <PropertyPreviewCard property={preview.preview} />
      ) : (
        trimmed &&
        isValid && (
          <Badge variant="outline" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Propiedad pendiente de sincronización
          </Badge>
        )
      )}
    </div>
  );
}
