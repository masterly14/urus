"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileSignature,
  FileText,
  Mic,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import type { Contrato, EstadoContrato } from "@/lib/mock-data/types";
import { cn } from "@/lib/utils";

const estadoConfig: Record<
  EstadoContrato,
  {
    label: string;
    icon: typeof FileText;
    variant: StatusBadgeVariant;
  }
> = {
  borrador: {
    label: "Borrador",
    icon: FileText,
    variant: "info",
  },
  revision: {
    label: "Revisión gestor",
    icon: AlertCircle,
    variant: "warning",
  },
  enviado: {
    label: "Enviado a firma",
    icon: Send,
    variant: "warning",
  },
  firmado: {
    label: "Firmado",
    icon: CheckCircle2,
    variant: "success",
  },
};

const documentKindLabel: Record<string, string> = {
  arras: "Contrato de arras",
  senal_compra: "Señal de compra",
  oferta_firme: "Oferta en firme",
  anexo_mobiliario: "Anexo mobiliario",
  parte_visita: "Parte de visita",
  nota_encargo: "Nota de encargo",
  reserva: "Reserva",
};

function getDocumentKind(contract: Contrato): string {
  const rawKind = contract.documentKind ?? contract.tipo;
  return typeof rawKind === "string" && rawKind.trim() ? rawKind : "reserva";
}

function isReadOnlyDocumentKind(kind: string): boolean {
  const normalized = kind.toLowerCase();
  return normalized === "parte_visita" || normalized === "nota_encargo";
}

function getPreferredPreviewUrl(contract: Contrato): string | null {
  return contract.urls?.signed ?? contract.urls?.cloudinary ?? null;
}

function getDocumentKindLabel(kind: string): string {
  const normalized = kind.toLowerCase();
  return documentKindLabel[normalized] ?? normalized.replace(/_/g, " ");
}

function formatContractDate(value: string): string {
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatContractAmount(value: unknown): string {
  return `${Number(value ?? 0).toLocaleString("es-ES")} €`;
}

export function ContratosListClient({
  contratos,
}: {
  contratos: Contrato[];
}) {
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [search, setSearch] = useState("");

  const availableKinds = useMemo(() => {
    const kinds = new Set(contratos.map((c) => getDocumentKind(c)));
    return ["all", ...Array.from(kinds)];
  }, [contratos]);

  const filtered = useMemo(() => {
    return contratos.filter((contract) => {
      const documentKind = getDocumentKind(contract);

      if (filterTipo !== "all" && documentKind !== filterTipo) return false;
      if (filterEstado !== "all" && contract.estado !== filterEstado) return false;

      if (search.trim()) {
        const term = search.toLowerCase();
        const matchesSearch =
          contract.operacion.toLowerCase().includes(term) ||
          contract.id.toLowerCase().includes(term) ||
          getDocumentKindLabel(documentKind).toLowerCase().includes(term) ||
          String(contract.variables.comprador ?? "").toLowerCase().includes(term) ||
          String(contract.variables.vendedor ?? "").toLowerCase().includes(term);

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [contratos, filterTipo, filterEstado, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automatización legal"
        description="Smart Closing: revisión por voz, vista previa y firma digital."
        breadcrumbs={[
          { label: "Inicio", href: "/platform" },
          { label: "Legal", href: "/platform/legal" },
          { label: "Contratos" },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href="/platform/legal/documentos">Ver explorador de documentos</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.entries(estadoConfig) as [EstadoContrato, (typeof estadoConfig)[EstadoContrato]][]).map(
          ([key, cfg]) => {
            const count = contratos.filter((c) => c.estado === key).length;
            const Icon = cfg.icon;
            const isActive = filterEstado === key;

            return (
              <KpiCard
                key={key}
                label={cfg.label}
                value={count}
                icon={<Icon />}
                className={isActive ? "border-primary/40 bg-accent/50" : ""}
              />
            );
          },
        )}
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por operación, contrato, partes o tipo..."
        filters={
          <>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {availableKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind === "all" ? "Todos los tipos" : getDocumentKindLabel(kind)}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {(["all", "borrador", "revision", "enviado", "firmado"] as const).map((status) => {
                const cfg = status !== "all" ? estadoConfig[status] : null;
                return (
                  <Button
                    key={status}
                    onClick={() => setFilterEstado(status)}
                    variant={filterEstado === status ? "secondary" : "outline"}
                    size="sm"
                    className={cn("text-xs", filterEstado !== status && "text-muted-foreground")}
                  >
                    {status === "all" ? "Todos" : cfg?.label}
                  </Button>
                );
              })}
            </div>
          </>
        }
        badges={
          <Badge variant="outline" className="text-xs">
            {filtered.length} contratos
          </Badge>
        }
      />

      <DataTable
        data={filtered}
        keyExtractor={(item) => item.id}
        emptyState={
          <EmptyState
            icon={FileSignature}
            title="No hay contratos para estos filtros"
            description="Prueba cambiando el tipo, estado o el término de búsqueda."
            className="py-10"
          />
        }
        columns={[
          {
            header: "Contrato",
            className: "pl-4",
            cell: (contract) => (
              <span className="font-mono text-sm font-medium">
                {contract.id.toUpperCase().slice(0, 12)}
              </span>
            ),
          },
          {
            header: "Operación",
            cell: (contract) => (
              <span className="font-mono text-xs text-muted-foreground">
                {contract.operacion}
              </span>
            ),
          },
          {
            header: "Tipo de documento",
            cell: (contract) => (
              <Badge variant="outline" className="text-[10px]">
                {getDocumentKindLabel(getDocumentKind(contract))}
              </Badge>
            ),
          },
          {
            header: "Partes",
            cell: (contract) => (
              <div className="text-xs">
                <p className="font-medium">{String(contract.variables.comprador ?? "—")}</p>
                <p className="text-[10px] text-muted-foreground">
                  ↔ {String(contract.variables.vendedor ?? "—")}
                </p>
              </div>
            ),
          },
          {
            header: "Versión",
            className: "text-center",
            cell: (contract) => (
              <span className="font-mono text-xs font-bold">{contract.versionActual}</span>
            ),
          },
          {
            header: "Estado",
            className: "text-center",
            cell: (contract) => {
              const cfg = estadoConfig[contract.estado];
              const Icon = cfg.icon;
              return (
                <StatusBadge variant={cfg.variant}>
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </StatusBadge>
              );
            },
          },
          {
            header: "Fecha",
            className: "text-center",
            cell: (contract) => (
              <span className="text-xs text-muted-foreground">
                {formatContractDate(contract.fechaCreacion)}
              </span>
            ),
          },
          {
            header: "Precio",
            className: "text-center",
            cell: (contract) => (
              <span className="font-mono text-xs font-medium">
                {formatContractAmount(contract.variables.precio)}
              </span>
            ),
          },
          {
            header: "Acciones",
            className: "pr-4 text-center",
            cell: (contract) => {
              const documentKind = getDocumentKind(contract);
              const isReadOnly = isReadOnlyDocumentKind(documentKind);
              const previewUrl = getPreferredPreviewUrl(contract);

              if (isReadOnly) {
                return previewUrl ? (
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abrir documento"
                    >
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin archivo</span>
                );
              }

              return (
                <div className="flex items-center justify-center gap-1">
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      href={`/platform/legal/contratos/${contract.id}`}
                      aria-label="Ver contrato"
                    >
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      href={`/platform/legal/contratos/${contract.id}`}
                      aria-label="Editar contrato por voz"
                    >
                      <Mic className="h-4 w-4 text-secondary" />
                    </Link>
                  </Button>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
