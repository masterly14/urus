"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TemplateEditor } from "@/components/legal/templates/template-editor";
import { Loader2 } from "lucide-react";

interface TemplateData {
  id: string;
  documentKind: string;
  version: string;
  name: string;
  isActive: boolean;
  structure: unknown;
  variableBindings: unknown;
  sharedClauseOverrides: unknown;
  publishedAt: string | null;
}

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/templates/${params.id}`);
        if (!res.ok) {
          setError("No se pudo cargar la plantilla");
          return;
        }
        const data = await res.json();
        setTemplate(data);
      } catch {
        setError("Error de conexion");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">{error ?? "Plantilla no encontrada"}</p>
        <button
          className="text-sm text-primary underline"
          onClick={() => router.push("/platform/legal/plantillas")}
        >
          Volver a plantillas
        </button>
      </div>
    );
  }

  return <TemplateEditor template={template} />;
}
