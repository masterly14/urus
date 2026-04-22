"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Copy,
  Eye,
  Pencil,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TemplateRow {
  id: string;
  documentKind: string;
  version: string;
  name: string;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser: { name: string } | null;
}

const KIND_LABELS: Record<string, string> = {
  arras: "Arras",
  senal_compra: "Senal de Compra",
  oferta_firme: "Oferta en Firme",
  anexo_mobiliario: "Anexo Mobiliario",
};

export function PlantillasListClient({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);

  const filtered =
    kindFilter === "all"
      ? templates
      : templates.filter((t) => t.documentKind === kindFilter);

  const kinds = [...new Set(templates.map((t) => t.documentKind))];

  async function handleCreate(kind: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentKind: kind, name: `Nueva plantilla ${KIND_LABELS[kind] ?? kind}` }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/platform/legal/plantillas/${data.id}/editor`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleClone(templateId: string) {
    const source = templates.find((t) => t.id === templateId);
    if (!source) return;
    setCreating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentKind: source.documentKind,
          name: `${source.name} (copia)`,
          cloneFromId: templateId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/platform/legal/plantillas/${data.id}/editor`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas de Contratos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edita y gestiona las plantillas de los documentos legales. La plantilla activa de cada tipo
            se usa automaticamente al generar contratos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["arras", "senal_compra", "oferta_firme"] as const).map((kind) => (
            <Button
              key={kind}
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => handleCreate(kind)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva {KIND_LABELS[kind]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <button
          onClick={() => setKindFilter("all")}
          className={cn(
            "px-3 py-1 text-xs rounded-full border transition-colors",
            kindFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-accent/50",
          )}
        >
          Todas
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            onClick={() => setKindFilter(kind)}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition-colors",
              kindFilter === kind
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent/50",
            )}
          >
            {KIND_LABELS[kind] ?? kind}
          </button>
        ))}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Version</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Creado por</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actualizado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No hay plantillas{kindFilter !== "all" ? ` de tipo ${KIND_LABELS[kindFilter]}` : ""}.
                </td>
              </tr>
            )}
            {filtered.map((tpl) => (
              <tr key={tpl.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{tpl.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-accent/20">
                    {KIND_LABELS[tpl.documentKind] ?? tpl.documentKind}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{tpl.version}</td>
                <td className="px-4 py-3">
                  {tpl.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-urus-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Activa
                    </span>
                  ) : tpl.publishedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      Publicada (inactiva)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-urus-warning">
                      <Clock className="h-3.5 w-3.5" />
                      Borrador
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {tpl.createdByUser?.name ?? "Sistema"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(tpl.updatedAt).toLocaleDateString("es-ES")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link href={`/platform/legal/plantillas/${tpl.id}/editor`}>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8">
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      title="Crear una copia de esta plantilla"
                      disabled={creating}
                      onClick={() => handleClone(tpl.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
