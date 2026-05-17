"use client";

import Link from "next/link";
import {
  FileText,
  Eye,
  CheckCircle2,
  Clock,
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
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Version</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Creado por</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Actualizado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {templates.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No hay plantillas.
                </td>
              </tr>
            )}
            {templates.map((tpl) => (
              <tr key={tpl.id} className="hover:bg-muted/30 transition-colors">
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
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Button>
                    </Link>
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
