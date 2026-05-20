"use client";

import Link from "next/link";
import {
  FileText,
  Eye,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  senal_compra: "Señal de compra",
  oferta_firme: "Oferta en firme",
  anexo_mobiliario: "Anexo mobiliario",
  parte_visita: "Parte de visita",
  nota_encargo: "Nota de encargo",
};

export function PlantillasListClient({ templates }: { templates: TemplateRow[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas de contratos"
        description="Edita y gestiona las plantillas legales utilizadas para generar documentos."
        breadcrumbs={[
          { label: "Inicio", href: "/platform" },
          { label: "Legal", href: "/platform/legal" },
          { label: "Plantillas" },
        ]}
      />

      <Card className="border-border/50">
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No hay plantillas disponibles"
              description="Cuando se publiquen plantillas legales aparecerán aquí."
              className="py-10"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead>Actualizado</TableHead>
                  <TableHead className="pr-4 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="pl-4 font-medium">{tpl.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {KIND_LABELS[tpl.documentKind] ?? tpl.documentKind}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{tpl.version}</TableCell>
                    <TableCell>
                      {tpl.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--urus-success)]">
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
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tpl.createdByUser?.name ?? "Sistema"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(tpl.updatedAt).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/platform/legal/plantillas/${tpl.id}/editor`}>
                          <Button variant="outline" size="sm" className="gap-1.5 h-8">
                            <Eye className="h-3.5 w-3.5" />
                            Ver
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
