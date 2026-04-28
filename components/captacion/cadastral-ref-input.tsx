"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  buildCadastralRefWarning,
  normalizeCadastralRef,
} from "@/lib/nota-encargo/cadastral-ref";
import {
  PropertyPreviewCard,
  type PropertyOption,
} from "@/components/captacion/property-selector";

interface CadastralPreviewResponse {
  exists: boolean;
  preview: PropertyOption | null;
  warnings?: string[];
}

interface CadastralRefInputProps {
  value: string;
  onChange: (value: string) => void;
  onPreviewChange?: (preview: CadastralPreviewResponse | null) => void;
}

export function CadastralRefInput({
  value,
  onChange,
  onPreviewChange,
}: CadastralRefInputProps) {
  const [loading, setLoading] = React.useState(false);
  const [preview, setPreview] = React.useState<CadastralPreviewResponse | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmed = value.trim();
  const normalized = normalizeCadastralRef(trimmed);
  const localWarning = trimmed ? buildCadastralRefWarning(trimmed) : null;

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed) {
      setPreview(null);
      onPreviewChange?.(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/captacion/properties-by-cadastral?refCatastral=${encodeURIComponent(normalized)}`,
        );
        if (!res.ok) {
          setPreview(null);
          onPreviewChange?.(null);
          return;
        }
        const data = (await res.json()) as CadastralPreviewResponse;
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
          placeholder="9872023VH5797S0006XS"
          className="pr-10 font-mono"
          aria-invalid={false}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {localWarning && (
        <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          {localWarning}
        </p>
      )}

      {preview?.warnings
        ?.filter((warning) => warning !== localWarning)
        .map((warning) => (
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
        trimmed && (
          <Badge variant="outline" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Propiedad pendiente de sincronización por catastro
          </Badge>
        )
      )}
    </div>
  );
}
