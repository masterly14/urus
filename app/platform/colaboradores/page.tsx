"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  TrendingUp,
  Search,
  ArrowUpRight,
  Trophy,
  Plus,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ClasificacionBadge } from "@/components/colaboradores/clasificacion-badge";
import type { ColaboradorClasificacion } from "@/components/colaboradores/clasificacion-badge";
import { ColaboradorForm } from "@/components/colaboradores/colaborador-form";

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
            <Users className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Colaboradores Externos</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de proveedores, plazos y rendimiento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/platform/colaboradores/ranking">
            <Badge
              variant="outline"
              className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors"
            >
              <Trophy className="h-3 w-3 text-[var(--urus-gold)]" />
              Clasificación
              <ArrowUpRight className="h-3 w-3" />
            </Badge>
          </Link>
          <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
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
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50 hover:shadow-[var(--shadow-elevated)] transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-secondary/15 p-2">
                <Users className="h-4 w-4 text-secondary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="text-xl font-bold font-mono">{totalColabs}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-[var(--shadow-elevated)] transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--urus-success)]/15 p-2">
                <TrendingUp className="h-4 w-4 text-[var(--urus-success)]" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Plazos Cumplidos</p>
                <p className="text-xl font-bold font-mono">{avgSla}<span className="text-sm font-normal text-muted-foreground">%</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-[var(--shadow-elevated)] transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--urus-danger)]/15 p-2">
                <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Con Plazo Vencido</p>
                <p className="text-xl font-bold font-mono text-[var(--urus-danger)]">{slaExceeded}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-[var(--shadow-elevated)] transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--urus-info)]/15 p-2">
                <Clock className="h-4 w-4 text-[var(--urus-info)]" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Asignaciones Activas</p>
                <p className="text-xl font-bold font-mono">{avgOps}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nombre..."
                className="bg-accent/30 border border-border/50 rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30 w-40"
              />
            </div>

            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todos los tipos</option>
              {(data?.tipos ?? []).map((t) => (
                <option key={t.nombre} value={t.nombre}>{t.nombre}</option>
              ))}
            </select>

            <select
              value={filterCiudad}
              onChange={(e) => setFilterCiudad(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todas las ciudades</option>
              {(data?.ciudades ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={filterClasificacion}
              onChange={(e) => setFilterClasificacion(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todas las clasificaciones</option>
              <option value="partner_estrategico">Socio Estratégico</option>
              <option value="funcional">Funcional</option>
              <option value="lento">Lento</option>
              <option value="critico">Crítico</option>
              <option value="sin_datos">Sin datos</option>
            </select>

            <Badge variant="outline" className="text-[10px] ml-auto">
              {filtered.length} resultados
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">Sin colaboradores</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.colaboradores.length === 0
                  ? "Crea el primer colaborador para empezar"
                  : "Ajusta los filtros para ver resultados"
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Colaborador</th>
                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Ciudad</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Clasificación</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Plazo</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Asign.</th>
                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Hitos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/20 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/platform/colaboradores/${c.id}`} className="flex items-center gap-2.5 group-hover:text-secondary transition-colors">
                          <div className="h-8 w-8 rounded-lg bg-accent/40 flex items-center justify-center text-[10px] font-bold text-secondary shrink-0">
                            {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[200px]">{c.nombre}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.especialidad}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">{c.tipo}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {c.ciudad || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ClasificacionBadge clasificacion={c.clasificacion.clasificacion} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-mono font-bold ${c.slaCumplimiento >= 80 ? "text-[var(--urus-success)]" : c.slaCumplimiento >= 60 ? "text-[var(--urus-warning)]" : "text-[var(--urus-danger)]"}`}>
                            {c.slaCumplimiento}%
                          </span>
                          {c.hitosVencidos > 0 && (
                            <span className="text-[9px] text-[var(--urus-danger)]">
                              {c.hitosVencidos} vencido{c.hitosVencidos > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-mono">
                          {c.asignacionesActivas}<span className="text-muted-foreground">/{c.asignacionesTotales}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-mono">
                          {c.hitosCompletados}<span className="text-muted-foreground">/{c.hitosTotales}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
