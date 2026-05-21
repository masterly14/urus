"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  AlertTriangle,
  TrendingUp,
  Search,
  ArrowUpRight,
  Trophy,
  Plus,
  Loader2,
  Briefcase,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { ClasificacionBadge } from "@/components/colaboradores/clasificacion-badge";
import type { ColaboradorClasificacion } from "@/components/colaboradores/clasificacion-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ColaboradorForm } from "@/components/colaboradores/colaborador-form";
import { FadeIn, Fade, AnimatePresence } from "@/components/ui/motion";

type ColaboradorRow = {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  especialidad: string;
  activo: boolean;
  asignacionesActivas: number;
  asignacionesCompletadas: number;
  asignacionesTotales: number;
  hitosCompletados: number;
  hitosTotales: number;
  hitosVencidos: number;
  slaCumplimiento: number;
  avgDiasHito: number | null;
  clasificacion: {
    clasificacion: ColaboradorClasificacion;
  };
};

export default function ColaboradoresPage() {
  const [data, setData] = useState<{
    colaboradores: ColaboradorRow[];
    tipos: { nombre: string }[];
    ciudades: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterCiudad, setFilterCiudad] = useState("all");
  const [filterClasificacion, setFilterClasificacion] = useState("all");
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/colaboradores?activo=true");
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.colaboradores.filter((c) => {
      if (filterTipo !== "all" && c.tipo !== filterTipo) return false;
      if (filterCiudad !== "all" && c.ciudad !== filterCiudad) return false;
      if (filterClasificacion !== "all" && c.clasificacion.clasificacion !== filterClasificacion) return false;
      if (search && !c.nombre.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, filterTipo, filterCiudad, filterClasificacion, search]);

  const totalColabs = filtered.length;
  const avgSla = totalColabs > 0
    ? (filtered.reduce((s, c) => s + c.slaCumplimiento, 0) / totalColabs).toFixed(1)
    : "—";
  const slaExceeded = filtered.filter((c) => c.hitosVencidos > 0).length;
  const avgOps = totalColabs > 0
    ? Math.round(filtered.reduce((s, c) => s + c.asignacionesTotales, 0) / totalColabs)
    : 0;

  const handleCreate = async (formData: Record<string, string>) => {
    const res = await fetch("/api/colaboradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || "Error al crear");
    }
    setShowNewForm(false);
    fetchData();
  };

  if (loading) {
    return (
      <Fade className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Fade>
    );
  }

  return (
    <FadeIn className="space-y-6 max-w-7xl mx-auto pb-10">
      <PageHeader
        title="Colaboradores Externos"
        description="Gestión de proveedores, plazos y rendimiento operativo."
        actions={
          <>
            <Link href="/platform/colaboradores/ranking">
              <Button variant="outline" size="sm" className="gap-2 bg-card shadow-sm">
                <Trophy className="h-4 w-4 text-[var(--urus-gold)]" />
                Clasificación
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </Button>
            </Link>
            <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 shadow-sm">
                  <Plus className="h-4 w-4" />
                  Nuevo Colaborador
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nuevo Colaborador</DialogTitle>
                </DialogHeader>
                <ColaboradorForm
                  tipos={data?.tipos.map((t) => t.nombre) ?? []}
                  onSubmit={handleCreate}
                  onCancel={() => setShowNewForm(false)}
                  submitLabel="Crear"
                />
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/* KPIs - B2B Style (Clean Cards, subtle icons) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total Colaboradores</span>
              <Users className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{totalColabs}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Plazos Cumplidos</span>
              <TrendingUp className="h-4 w-4 text-[var(--urus-success)]" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {avgSla}<span className="text-sm font-medium text-muted-foreground ml-1">%</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Con Plazo Vencido</span>
              <AlertTriangle className={slaExceeded > 0 ? "h-4 w-4 text-[var(--urus-danger)]" : "h-4 w-4"} />
            </div>
            <p className={`text-2xl font-bold ${slaExceeded > 0 ? "text-[var(--urus-danger)]" : "text-foreground"}`}>
              {slaExceeded}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Asignaciones Activas</span>
              <Briefcase className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{avgOps} <span className="text-sm font-medium text-muted-foreground ml-1">avg</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar (Filters & Search) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border/60 rounded-lg p-2 shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm pl-9 pr-4 py-1.5 placeholder:text-muted-foreground"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="h-6 w-px bg-border/60 hidden sm:block mx-2" />
          
          <Select value={filterTipo} onValueChange={(val) => setFilterTipo(val)}>
            <SelectTrigger className="w-[140px] bg-transparent border-border/50 h-8 text-sm focus:ring-1 focus:ring-secondary/50">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {(data?.tipos ?? []).map((t) => (
                <SelectItem key={t.nombre} value={t.nombre}>{t.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterCiudad} onValueChange={(val) => setFilterCiudad(val)}>
            <SelectTrigger className="w-[140px] bg-transparent border-border/50 h-8 text-sm focus:ring-1 focus:ring-secondary/50">
              <SelectValue placeholder="Todas las ciudades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las ciudades</SelectItem>
              {(data?.ciudades ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterClasificacion} onValueChange={(val) => setFilterClasificacion(val)}>
            <SelectTrigger className="w-[160px] bg-transparent border-border/50 h-8 text-sm focus:ring-1 focus:ring-secondary/50">
              <SelectValue placeholder="Cualquier clasificación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cualquier clasificación</SelectItem>
              <SelectItem value="partner_estrategico">Socio Estratégico</SelectItem>
              <SelectItem value="funcional">Funcional</SelectItem>
              <SelectItem value="lento">Lento</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
              <SelectItem value="sin_datos">Sin datos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table */}
      <Card className="shadow-sm border-border/60 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState 
            icon={Users}
            title="No se encontraron colaboradores"
            description={
              data?.colaboradores.length === 0
                ? "Crea el primer colaborador para empezar a gestionar asignaciones."
                : "Ajusta los filtros de búsqueda para ver más resultados."
            }
            className="py-20 bg-accent/10"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-accent/40">
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-center">Clasificación</TableHead>
                  <TableHead className="text-center">Cumplimiento SLA</TableHead>
                  <TableHead className="text-center">Asignaciones</TableHead>
                  <TableHead className="text-center">Hitos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell>
                      <Link href={`/platform/colaboradores/${c.id}`} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-semibold text-secondary shrink-0 border border-secondary/20">
                          {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[220px] group-hover:text-secondary transition-colors">
                            {c.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {c.especialidad || "Sin especialidad"}
                          </p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal bg-accent text-foreground hover:bg-accent">
                        {c.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.ciudad || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <ClasificacionBadge clasificacion={c.clasificacion.clasificacion} size="sm" />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className={`font-medium ${c.slaCumplimiento >= 80 ? "text-[var(--urus-success)]" : c.slaCumplimiento >= 60 ? "text-[var(--urus-warning)]" : "text-[var(--urus-danger)]"}`}>
                          {c.slaCumplimiento}%
                        </span>
                        {c.hitosVencidos > 0 && (
                          <span className="text-[10px] text-[var(--urus-danger)] flex items-center gap-1 mt-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--urus-danger)]"></span>
                            {c.hitosVencidos} vencido{c.hitosVencidos > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium text-foreground">{c.asignacionesActivas}</span>
                      <span className="text-muted-foreground text-xs ml-1">/ {c.asignacionesTotales}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium text-foreground">{c.hitosCompletados}</span>
                      <span className="text-muted-foreground text-xs ml-1">/ {c.hitosTotales}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </FadeIn>
  );
}
