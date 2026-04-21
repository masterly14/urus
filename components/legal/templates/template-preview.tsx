"use client";

import { useState } from "react";
import { Download, Loader2, RefreshCcw, FileText, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  templateId: string;
}

export function TemplatePreview({ templateId }: Props) {
  const [loading, setLoading] = useState(false);
  const [base64, setBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generatePreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/preview`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          (data as { error?: string })?.error ?? `Error HTTP ${res.status}`,
        );
      }
      const data = await res.json();
      setBase64(data.base64);
      setFileName(data.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar vista previa");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!base64 || !fileName) return;
    const blob = new Blob(
      [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Vista previa</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Genera un documento Word con datos de ejemplo para ver como quedara el contrato.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-5">
        {!base64 && !loading && !error && (
          <>
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
            </div>

            <div className="text-center">
              <p className="text-sm font-medium mb-1">Sin vista previa generada</p>
              <p className="text-xs text-muted-foreground">
                Haz clic en el boton para generar un documento de prueba con datos ficticios.
              </p>
            </div>

            <Button
              onClick={generatePreview}
              className="gap-2 bg-neutral-800 hover:bg-neutral-700 text-white"
            >
              <FileText className="h-4 w-4" />
              Generar vista previa
            </Button>
          </>
        )}

        {loading && (
          <>
            <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">Generando documento...</p>
          </>
        )}

        {error && (
          <>
            <div className="w-full max-w-sm p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <p className="text-sm text-destructive font-medium mb-1">Error al generar</p>
              <p className="text-xs text-destructive/80">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={generatePreview} className="gap-2">
              <RefreshCcw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </>
        )}

        {base64 && !error && (
          <>
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <FileCheck className="h-8 w-8 text-emerald-600" />
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-emerald-700">Documento listo</p>
              <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleDownload} className="gap-2 bg-neutral-800 hover:bg-neutral-700 text-white">
                <Download className="h-4 w-4" />
                Descargar Word
              </Button>
              <Button variant="outline" size="sm" onClick={generatePreview} className="gap-1.5">
                <RefreshCcw className="h-3.5 w-3.5" />
                Regenerar
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed max-w-[280px]">
              El documento usa datos ficticios. Los datos reales se insertan al crear un contrato.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
