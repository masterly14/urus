"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, ExternalLink } from "lucide-react";

type Documento = {
  id: string;
  nombre: string;
  cloudinaryUrl: string;
  formato: string;
  bytes: number;
  createdAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentoUpload({
  asignacionId,
  hitoId,
  documentos,
  onUploaded,
}: {
  asignacionId: string;
  hitoId?: string;
  documentos: Documento[];
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (hitoId) formData.append("hitoId", hitoId);

      const res = await fetch(
        `/api/colaboradores/asignaciones/${asignacionId}/documentos`,
        { method: "POST", body: formData },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al subir");
      }

      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir documento");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {documentos.length > 0 && (
        <div className="space-y-1">
          {documentos.map((doc) => (
            <a
              key={doc.id}
              href={doc.cloudinaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded-lg border border-border/30 hover:bg-accent/20 transition-colors group"
            >
              <FileText className="h-3.5 w-3.5 text-secondary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate group-hover:text-secondary transition-colors">
                  {doc.nombre}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {formatBytes(doc.bytes)} · {new Date(doc.createdAt).toLocaleDateString("es-ES")}
                </p>
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          onChange={handleUpload}
          className="hidden"
          accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png"
        />
        <Button
          variant="outline"
          size="xs"
          className="gap-1"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {uploading ? "Subiendo..." : "Subir documento"}
        </Button>
      </div>

      {error && <p className="text-[10px] text-[var(--urus-danger)]">{error}</p>}
    </div>
  );
}
