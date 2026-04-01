"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  ArrowLeft,
  Users,
  Filter,
  MapPin,
  Clock,
  Briefcase,
  Loader2,
  Medal,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClasificacionBadge } from "@/components/colaboradores/clasificacion-badge";
import type { ColaboradorClasificacion } from "@/components/colaboradores/clasificacion-badge";

type ColaboradorRow = {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  especialidad: string;
  asignacionesActivas: number;
  asignacionesTotales: number;
  hitosCompletados: number;
  hitosTotales: number;
  hitosVencidos: number;
  slaCumplimiento: number;
  avgDiasHito: number | null;
  clasificacion: { clasificacion: ColaboradorClasificacion };
};

function getSlaColor(sla: number): string {
  if (sla >= 80) return "var(--urus-success)";
  if (sla >= 60) return "var(--urus-warning)";
  return "var(--urus-danger)";
}

export default function ColaboradoresRankingPage() {
  const [colaboradores, setColaboradores] = useState<ColaboradorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState("all");
  const [sortBy, setSortBy] = useState<"sla" | "ops" | "hitos">("sla");

  useEffect(() => {
    fetch("/api/colaboradores?activo=true")
      .then((r) => r.json())
      .then((d) => setColaboradores(d.colaboradores ?? []))
      .catch(() => setColaboradores([]))
      .finally(() => setLoading(false));
  }, []);

  const tipos = useMemo(
    () => [...new Set(colaboradores.map((c) => c.tipo))].sort(),
    [colaboradores],
  );

  const ranked = useMemo(() => {
    let filtered = colaboradores;
    if (filterTipo !== "all") {
      filtered = filtered.filter((c) => c.tipo === filterTipo);
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "sla") return b.slaCumplimiento - a.slaCumplimiento;
      if (sortBy === "ops") return b.asignacionesTotales - a.asignacionesTotales;
      return b.hitosCompletados - a.hitosCompletados;
    });
  }, [colaboradores, filterTipo, sortBy]);

  const clasGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const c of colaboradores) {
      const k = c.clasificacion.clasificacion;
      groups[k] = (groups[k] || 0) + 1;
    }
    return groups;
  }, [colaboradores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/colaboradores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver a Colaboradores
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--urus-gold)]/20 to-[var(--urus-gold)]/5 flex items-center justify-center">
          <Trophy className="h-5 w-5 text-[var(--urus-gold)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ranking de Colaboradores</h1>
          <p className="text-sm text-muted-foreground">Clasificación por rendimiento y SLA</p>
        </div>
      </div>

      {/* Classification summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["partner_estrategico", "funcional", "lento", "critico", "sin_datos"] as const).map((cls) => (
          <Card key={cls} className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-3 flex items-center justify-between">
              <ClasificacionBadge clasificacion={cls} size="sm" />
              <span className="text-lg font-bold font-mono">{clasGroups[cls] || 0}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
            </div>

            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todos los tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <div className="flex gap-1">
              {([
                { key: "sla" as const, label: "SLA" },
                { key: "ops" as const, label: "Operaciones" },
                { key: "hitos" as const, label: "Hitos" },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                    sortBy === s.key
                      ? "bg-card border-secondary/30 text-foreground font-medium"
                      : "border-border/30 text-muted-foreground hover:bg-accent/30"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <Badge variant="outline" className="text-[10px] ml-auto">
              {ranked.length} colaboradores
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Ranking list */}
      <div className="space-y-2">
        {ranked.length === 0 ? (
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">Sin datos de ranking</p>
            </CardContent>
          </Card>
        ) : (
          ranked.map((c, idx) => {
            const slaColor = getSlaColor(c.slaCumplimiento);
            const isTop3 = idx < 3;
            const medalColors = ["text-[var(--urus-gold)]", "text-gray-400", "text-amber-700"];

            return (
              <Link key={c.id} href={`/colaboradores/${c.id}`}>
                <Card className={`border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all ${isTop3 ? "border-[var(--urus-gold)]/20" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="w-8 text-center shrink-0">
                        {isTop3 ? (
                          <Medal className={`h-5 w-5 mx-auto ${medalColors[idx]}`} />
                        ) : (
                          <span className="text-sm font-bold font-mono text-muted-foreground">
                            {idx + 1}
                          </span>
                        )}
                      </div>

                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-xl bg-accent/40 flex items-center justify-center text-sm font-bold text-secondary shrink-0">
                        {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{c.nombre}</p>
                          <Badge variant="outline" className="text-[9px]">{c.tipo}</Badge>
                          <ClasificacionBadge clasificacion={c.clasificacion.clasificacion} size="sm" />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          {c.ciudad && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" /> {c.ciudad}
                            </span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <Briefcase className="h-2.5 w-2.5" /> {c.asignacionesTotales} ops
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {c.avgDiasHito !== null ? `${c.avgDiasHito}d/hito` : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">SLA</p>
                          <p className="text-sm font-bold font-mono" style={{ color: slaColor }}>
                            {c.slaCumplimiento}%
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">Hitos</p>
                          <p className="text-sm font-bold font-mono">
                            {c.hitosCompletados}<span className="text-muted-foreground text-xs">/{c.hitosTotales}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
