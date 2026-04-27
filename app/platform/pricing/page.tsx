"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import Image from "next/image";
import {
  Tag,
  Filter,
  MapPin,
  LayoutGrid,
  List,
  ArrowUpRight,
  BarChart3,
  Loader2,
  AlertTriangle,
  Search,
  ImageOff,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyCard } from "@/components/pricing/property-card";
import { AiIndicator } from "@/components/ui/ai-indicator";
import { propertiesListFixture } from "@/lib/mock-data/pricing-fixture";

export interface PropertyListItem {
  codigo: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  numFotos: number;
  agente: string;
  fechaAlta: string;
  /** URL absoluta de la foto principal (Cloudinary / Inmovilla). Null hasta que el worker de fotos la cachee. */
  mainPhotoUrl?: string | null;
  /** URL pública del anuncio en el portal principal (prioridad Idealista). Null hasta que el worker de extrainfo lo sincronice. */
  portalUrl?: string | null;
  /** Nombre del portal destino (ej. "idealista", "fotocasa"). */
  portalName?: string | null;
  propietarioNombre?: string | null;
  propietarioDni?: string | null;
  propietarioPhone?: string | null;
  propietarioDomicilioFiscal?: string | null;
}

const PAGE_SIZE_GRID = 12;
const PAGE_SIZE_LIST = 20;

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function isEligibleForSmartPricing(property: PropertyListItem): boolean {
  const ciudad = property.ciudad?.trim() ?? "";
  const zona = property.zona?.trim() ?? "";
  if (!ciudad || !zona) return false;
  return normalizeForComparison(ciudad).includes("cordoba");
}

function portalButtonClass(portalName?: string | null): string {
  const n = (portalName ?? "").toLowerCase();
  if (n.includes("idealista"))
    return "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[#D44431]/60 bg-[#D44431]/10 text-[#D44431] hover:bg-[#D44431]/20 hover:border-[#D44431]";
  if (n.includes("fotocasa"))
    return "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[#0065EB]/50 bg-[#0065EB]/10 text-[#0065EB] hover:bg-[#0065EB]/20";
  return "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-border/50 bg-accent/20 text-foreground hover:bg-accent/40";
}

function portalLabel(portalName?: string | null): string {
  if (!portalName) return "Ver anuncio";
  const n = portalName.toLowerCase();
  if (n.includes("idealista")) return "Ver en Idealista";
  if (n.includes("fotocasa")) return "Ver en Fotocasa";
  if (n.includes("pisos")) return "Ver en Pisos.com";
  if (n.includes("habitaclia")) return "Ver en Habitaclia";
  return `Ver en ${portalName}`;
}

interface PaginationProps {
  current: number;
  total: number;
  onChange: (p: number) => void;
}

function Pagination({ current, total, onChange }: PaginationProps) {
  if (total <= 1) return null;

  const pages: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("…");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }

  const btn =
    "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-border/40 px-2 text-xs font-medium transition-all";

  return (
    <div className="flex items-center justify-center gap-1.5 pt-2">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className={`${btn} disabled:opacity-30 hover:bg-accent/40`}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            className={`${btn} ${
              p === current
                ? "border-secondary bg-secondary/20 text-secondary font-bold"
                : "hover:bg-accent/40"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total}
        className={`${btn} disabled:opacity-30 hover:bg-accent/40`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function PricingPage() {
  const isMock =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mock");

  const { data: swrData, error: swrError, isLoading } = useSWR<{ properties: PropertyListItem[] }>(
    isMock ? null : "/api/pricing/properties",
    { revalidateOnMount: true, keepPreviousData: true },
  );

  const properties = isMock
    ? propertiesListFixture
    : (swrData?.properties ?? []);
  const loading = !isMock && isLoading && properties.length === 0;
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Error cargando propiedades") : null;

  const [filterZona, setFilterZona] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [onlyEligible, setOnlyEligible] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const zonas = useMemo(
    () => [...new Set(properties.map((p) => p.zona).filter(Boolean))].sort(),
    [properties],
  );
  const estados = useMemo(
    () =>
      [...new Set(properties.map((p) => p.estado).filter(Boolean))].sort(),
    [properties],
  );

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (onlyEligible && !isEligibleForSmartPricing(p)) return false;
      if (filterZona !== "all" && p.zona !== filterZona) return false;
      if (filterEstado !== "all" && p.estado !== filterEstado) return false;
      if (search) {
        const q = search.toLowerCase();
        const hayMatch =
          p.codigo.toLowerCase().includes(q) ||
          p.titulo.toLowerCase().includes(q) ||
          p.zona.toLowerCase().includes(q) ||
          p.ciudad.toLowerCase().includes(q) ||
          p.ref.toLowerCase().includes(q);
        if (!hayMatch) return false;
      }
      return true;
    });
  }, [properties, onlyEligible, filterZona, filterEstado, search]);

  // Reset to page 1 when filters or view mode change
  useEffect(() => {
    setPage(1);
  }, [filtered.length, viewMode]);

  const pageSize = viewMode === "grid" ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalValue = useMemo(
    () => properties.reduce((s, p) => s + p.precio, 0),
    [properties],
  );
  const avgPriceM2 = useMemo(() => {
    const valid = properties.filter((p) => p.metrosConstruidos > 0);
    if (valid.length === 0) return 0;
    return Math.round(
      valid.reduce((s, p) => s + p.precio / p.metrosConstruidos, 0) /
        valid.length,
    );
  }, [properties]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
          <p className="text-sm text-muted-foreground">
            Cargando propiedades...
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-[var(--urus-danger)]/30">
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-[var(--urus-danger)] mx-auto" />
            <h2 className="text-lg font-semibold">Error cargando propiedades</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
            <Tag className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Smart Pricing</h1>
              <AiIndicator label="Valoración IA" />
            </div>
            <p className="text-sm text-muted-foreground">
              Selecciona un inmueble para generar su informe de precio
            </p>
          </div>
        </div>
        <Link href="/platform/pricing/mercado">
          <Badge
            variant="outline"
            className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <BarChart3 className="h-3 w-3 text-secondary" />
            Vista de Mercado
            <ArrowUpRight className="h-3 w-3" />
          </Badge>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border border-border">
          <CardContent className="p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Total propiedades
            </p>
            <p className="text-2xl font-bold font-mono">{properties.length}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Valor cartera
            </p>
            <p className="text-2xl font-bold font-mono">
              {(totalValue / 1_000_000).toFixed(1)}M €
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              €/m² medio
            </p>
            <p className="text-2xl font-bold font-mono">
              {avgPriceM2.toLocaleString("es-ES")} €
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Filtrar:
              </span>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar código, título, zona..."
                className="bg-accent/30 border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30 w-56"
              />
            </div>

            <select
              value={filterZona}
              onChange={(e) => setFilterZona(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todas las zonas</option>
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todos los estados</option>
              {estados.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-accent/30 px-2.5 py-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyEligible}
                onChange={(e) => setOnlyEligible(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-secondary)]"
              />
              Solo elegibles Smart Pricing
            </label>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">
                {filtered.length > 0
                  ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`
                  : "0 resultados"}
              </span>
              <div className="flex bg-accent/30 rounded-lg p-0.5 border border-border/30">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-card shadow-sm" : ""}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-card shadow-sm" : ""}`}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Properties Grid/List */}
      {filtered.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No se encontraron propiedades con esos filtros
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map((p) => (
              <PropertyCard key={p.codigo} property={p} />
            ))}
          </div>
          <Pagination current={page} total={totalPages} onChange={setPage} />
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="border border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Foto
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Código
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Título
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Zona
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Precio
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        m²
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Hab
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Portal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {paginated.map((p) => (
                      <tr
                        key={p.codigo}
                        className="transition-colors hover:bg-accent/20"
                      >
                        <td className="px-4 py-3">
                          <div className="relative h-12 w-16 overflow-hidden rounded border border-border/30 bg-accent/30">
                            {p.mainPhotoUrl ? (
                              <Image
                                src={p.mainPhotoUrl}
                                alt={p.titulo || p.codigo}
                                fill
                                sizes="64px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                                <ImageOff className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isEligibleForSmartPricing(p) ? (
                            <Link
                              href={`/platform/pricing/informe/${p.codigo}`}
                              className="font-mono text-xs font-bold text-secondary hover:underline"
                            >
                              {p.codigo}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs font-bold text-muted-foreground">
                              {p.codigo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEligibleForSmartPricing(p) ? (
                            <Link
                              href={`/platform/pricing/informe/${p.codigo}`}
                              className="text-sm font-medium transition-colors hover:text-secondary"
                            >
                              {p.titulo || p.ref || p.codigo}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground">
                              {p.titulo || p.ref || p.codigo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[9px]">
                              {p.zona || p.ciudad}
                            </Badge>
                            {!isEligibleForSmartPricing(p) && (
                              <Badge
                                variant="outline"
                                className="border-[var(--urus-warning)]/40 text-[9px] text-[var(--urus-warning)]"
                              >
                                No elegible
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm font-medium">
                            {p.precio.toLocaleString("es-ES")} €
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">
                          {p.metrosConstruidos}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">
                          {p.habitaciones}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="outline"
                            className="text-[9px]"
                            style={{
                              borderColor:
                                p.estado === "Reservado"
                                  ? "var(--urus-success)"
                                  : undefined,
                              color:
                                p.estado === "Reservado"
                                  ? "var(--urus-success)"
                                  : undefined,
                            }}
                          >
                            {p.estado}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.portalUrl ? (
                            <a
                              href={p.portalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={portalButtonClass(p.portalName)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {p.portalName
                                ? p.portalName.charAt(0).toUpperCase() +
                                  p.portalName.slice(1)
                                : "Anuncio"}
                            </a>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Pagination current={page} total={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
