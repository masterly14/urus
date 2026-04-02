"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyCard } from "@/components/pricing/property-card";
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
}

export default function PricingPage() {
  const [properties, setProperties] = useState<PropertyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterZona, setFilterZona] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const isMock = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");

  useEffect(() => {
    if (isMock) {
      setProperties(propertiesListFixture);
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch("/api/pricing/properties");
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const body = await res.json();
        setProperties(body.properties ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando propiedades");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isMock]);

  const zonas = useMemo(() => [...new Set(properties.map((p) => p.zona).filter(Boolean))].sort(), [properties]);
  const estados = useMemo(() => [...new Set(properties.map((p) => p.estado).filter(Boolean))].sort(), [properties]);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
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
  }, [properties, filterZona, filterEstado, search]);

  const totalValue = useMemo(() => properties.reduce((s, p) => s + p.precio, 0), [properties]);
  const avgPriceM2 = useMemo(() => {
    const valid = properties.filter((p) => p.metrosConstruidos > 0);
    if (valid.length === 0) return 0;
    return Math.round(valid.reduce((s, p) => s + p.precio / p.metrosConstruidos, 0) / valid.length);
  }, [properties]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
          <p className="text-sm text-muted-foreground">Cargando propiedades...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-[var(--urus-danger)]/30 bg-card/60 backdrop-blur-sm">
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
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
            <Tag className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Smart Pricing</h1>
            <p className="text-sm text-muted-foreground">
              Selecciona un inmueble para generar su informe de pricing
            </p>
          </div>
        </div>
        <Link href="/platform/pricing/mercado">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors">
            <BarChart3 className="h-3 w-3 text-secondary" />
            Vista de Mercado
            <ArrowUpRight className="h-3 w-3" />
          </Badge>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total propiedades</p>
            <p className="text-2xl font-bold font-mono">{properties.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor cartera</p>
            <p className="text-2xl font-bold font-mono">{(totalValue / 1_000_000).toFixed(1)}M €</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">€/m² medio</p>
            <p className="text-2xl font-bold font-mono">{avgPriceM2.toLocaleString("es-ES")} €</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
            </div>

            {/* Search */}
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

            {/* Zona */}
            <select
              value={filterZona}
              onChange={(e) => setFilterZona(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todas las zonas</option>
              {zonas.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>

            {/* Estado */}
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todos los estados</option>
              {estados.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>

            {/* View toggle + count */}
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="text-[10px]">{filtered.length} resultados</Badge>
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
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron propiedades con esos filtros</p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PropertyCard key={p.codigo} property={p} />
          ))}
        </div>
      ) : (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Código</th>
                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Título</th>
                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Zona</th>
                    <th className="text-right px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">m²</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Hab</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filtered.map((p) => (
                    <tr key={p.codigo} className="hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/platform/pricing/informe/${p.codigo}`} className="text-xs font-mono font-bold text-secondary hover:underline">
                          {p.codigo}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/platform/pricing/informe/${p.codigo}`} className="text-sm font-medium hover:text-secondary transition-colors">
                          {p.titulo || p.ref || p.codigo}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[9px]">{p.zona || p.ciudad}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono font-medium">{p.precio.toLocaleString("es-ES")} €</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-mono">{p.metrosConstruidos}</td>
                      <td className="px-4 py-3 text-center text-xs font-mono">{p.habitaciones}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className="text-[9px]"
                          style={{
                            borderColor: p.estado === "Reservado" ? "var(--urus-success)" : undefined,
                            color: p.estado === "Reservado" ? "var(--urus-success)" : undefined,
                          }}
                        >
                          {p.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
