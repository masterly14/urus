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
  ShieldCheck,
  AlertTriangle,
  Euro,
  BarChart3,
  Sparkles,
  Target,
  TrendingDown,
  Bell,
  Award,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Semaforo } from "@/components/dashboard/semaforo";
import { SimpleBarChart } from "@/components/bi/charts";
import { ClasificacionBadge } from "@/components/colaboradores/clasificacion-badge";
import type { ColaboradorClasificacion } from "@/components/colaboradores/clasificacion-badge";

// ---------------------------------------------------------------------------
// Types (mirror API payload)
// ---------------------------------------------------------------------------

type ClasificacionResult = {
  clasificacion: ColaboradorClasificacion;
  slaCumplimiento: number;
  hitosVencidos: number;
  asignacionesTotales: number;
};

type DashboardRow = {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  especialidad: string;
  asignacionesActivas: number;
  asignacionesCompletadas: number;
  asignacionesTotales: number;
  hitosCompletados: number;
  hitosTotales: number;
  hitosVencidos: number;
  slaCumplimiento: number;
  avgDiasHito: number | null;
  clasificacion: ClasificacionResult;
  facturacionVinculadaEur: number;
  operacionesVinculadasCount: number;
};

type TipoMetricas = {
  tipo: string;
  totalColaboradores: number;
  avgSlaCumplimiento: number;
  avgDiasHito: number | null;
  hitosVencidos: number;
  facturacionVinculadaEur: number;
};

type DashboardResumen = {
  totalActivos: number;
  slaCumplimientoGlobal: number;
  hitosVencidosTotales: number;
  facturacionTotal: number;
  distribucionClasificacion: Record<ColaboradorClasificacion, number>;
};

type RecomendacionItem = {
  tipo: "concentrar" | "reducir" | "alertar" | "reconocer" | "investigar";
  mensaje: string;
  colaboradores_afectados: string[];
  accion_sugerida: string;
  impacto_esperado: string;
  prioridad: "alta" | "media" | "baja";
};

type ColaboradoresRecommendation = {
  diagnostico: string;
  recomendaciones: RecomendacionItem[];
  resumen_ejecutivo: string;
  confidence: number;
  reasoning: string;
};

type DashboardPayload = {
  resumen: DashboardResumen;
  ranking: DashboardRow[];
  metricasPorTipo: TipoMetricas[];
  ultimaRecomendacion: ColaboradoresRecommendation | null;
  recomendacionGeneradaAt: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLASIFICACIONES: ColaboradorClasificacion[] = [
  "partner_estrategico",
  "funcional",
  "lento",
  "critico",
  "sin_datos",
];

const SEMAFORO_CLASIFICACION: Record<ColaboradorClasificacion, "verde" | "amarillo" | "rojo"> = {
  partner_estrategico: "verde",
  funcional: "verde",
  lento: "amarillo",
  critico: "rojo",
  sin_datos: "verde",
};

function slaToSemaforo(sla: number): "verde" | "amarillo" | "rojo" {
  if (sla >= 80) return "verde";
  if (sla >= 60) return "amarillo";
  return "rojo";
}

function getSlaColor(sla: number): string {
  if (sla >= 80) return "var(--urus-success)";
  if (sla >= 60) return "var(--urus-warning)";
  return "var(--urus-danger)";
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K €`;
  return `${v.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

const RECO_TIPO_CONFIG: Record<
  RecomendacionItem["tipo"],
  { label: string; color: string; icon: typeof Target }
> = {
  concentrar: { label: "Concentrar", color: "var(--urus-success)", icon: Target },
  reducir: { label: "Reducir", color: "var(--urus-warning)", icon: TrendingDown },
  alertar: { label: "Alertar", color: "var(--urus-danger)", icon: Bell },
  reconocer: { label: "Reconocer", color: "var(--urus-info)", icon: Award },
  investigar: { label: "Investigar", color: "var(--muted-foreground)", icon: Search },
};

const PRIORIDAD_COLORS: Record<RecomendacionItem["prioridad"], string> = {
  alta: "var(--urus-danger)",
  media: "var(--urus-warning)",
  baja: "var(--urus-success)",
};

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardColaboradoresPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterCiudad, setFilterCiudad] = useState("all");
  const [filterClas, setFilterClas] = useState("all");

  useEffect(() => {
    fetch("/api/colaboradores/dashboard")
      .then((r) => r.json())
      .then((d: DashboardPayload) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const tipos = useMemo(
    () => [...new Set((data?.ranking ?? []).map((c) => c.tipo))].sort(),
    [data],
  );

  const ciudades = useMemo(
    () => [...new Set((data?.ranking ?? []).map((c) => c.ciudad).filter(Boolean))].sort(),
    [data],
  );

  const filteredRanking = useMemo(() => {
    if (!data) return [];
    let rows = data.ranking;
    if (filterTipo !== "all") rows = rows.filter((c) => c.tipo === filterTipo);
    if (filterCiudad !== "all") rows = rows.filter((c) => c.ciudad === filterCiudad);
    if (filterClas !== "all") rows = rows.filter((c) => c.clasificacion.clasificacion === filterClas);
    return rows;
  }, [data, filterTipo, filterCiudad, filterClas]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium">Error al cargar el dashboard</p>
      </div>
    );
  }

  const { resumen, metricasPorTipo } = data;

  const top10Facturacion = filteredRanking
    .filter((c) => c.facturacionVinculadaEur > 0)
    .slice(0, 10)
    .map((c) => ({
      nombre: c.nombre.length > 18 ? c.nombre.slice(0, 18) + "…" : c.nombre,
      Facturación: Math.round(c.facturacionVinculadaEur),
    }));

  const tiemposPorTipo = metricasPorTipo
    .filter((t) => t.avgDiasHito !== null)
    .map((t) => ({
      tipo: t.tipo,
      "Días promedio": t.avgDiasHito,
    }));

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/platform/colaboradores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver a Colaboradores
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--urus-gold)]/20 to-[var(--urus-gold)]/5 flex items-center justify-center">
          <Trophy className="h-5 w-5 text-[var(--urus-gold)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            Ranking por facturación vinculada, tiempos medios y semáforos
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Colaboradores activos"
          value={resumen.totalActivos}
          change={0}
          trend="stable"
          icon={Users}
          format="number"
        />
        <KpiCard
          title="SLA cumplimiento"
          value={resumen.slaCumplimientoGlobal}
          change={0}
          trend={resumen.slaCumplimientoGlobal >= 80 ? "up" : "down"}
          icon={ShieldCheck}
          format="percent"
        />
        <KpiCard
          title="Hitos vencidos"
          value={resumen.hitosVencidosTotales}
          change={0}
          trend={resumen.hitosVencidosTotales > 0 ? "down" : "stable"}
          icon={AlertTriangle}
          format="number"
        />
        <KpiCard
          title="Facturación vinculada"
          value={resumen.facturacionTotal}
          change={0}
          trend="stable"
          icon={Euro}
          format="currency"
        />
      </div>

      {/* Recomendaciones IA */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
            Recomendaciones IA
            {data.recomendacionGeneradaAt && (
              <span className="text-[10px] text-muted-foreground font-normal ml-auto">
                {timeAgo(data.recomendacionGeneradaAt)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.ultimaRecomendacion ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-accent/30 border border-border/30 p-3">
                <p className="text-sm font-medium">{data.ultimaRecomendacion.resumen_ejecutivo}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.ultimaRecomendacion.diagnostico}</p>
              </div>

              <div className="space-y-2">
                {data.ultimaRecomendacion.recomendaciones.map((reco, i) => {
                  const cfg = RECO_TIPO_CONFIG[reco.tipo];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-border/30 p-3 hover:bg-accent/20 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `color-mix(in oklch, ${cfg.color} 12%, transparent)` }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[9px]"
                              style={{
                                borderColor: `color-mix(in oklch, ${cfg.color} 40%, transparent)`,
                                color: cfg.color,
                              }}
                            >
                              {cfg.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[9px]"
                              style={{
                                borderColor: `color-mix(in oklch, ${PRIORIDAD_COLORS[reco.prioridad]} 40%, transparent)`,
                                color: PRIORIDAD_COLORS[reco.prioridad],
                              }}
                            >
                              {reco.prioridad}
                            </Badge>
                            {reco.colaboradores_afectados.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {reco.colaboradores_afectados.join(", ")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-1">{reco.mensaje}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">Acción:</span> {reco.accion_sugerida}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Impacto:</span> {reco.impacto_esperado}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                <span>Confianza: {Math.round(data.ultimaRecomendacion.confidence * 100)}%</span>
                {data.recomendacionGeneradaAt && (
                  <span>Generado: {new Date(data.recomendacionGeneradaAt).toLocaleString("es-ES")}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">
                Las recomendaciones se generan automáticamente por el sistema 
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Vuelve pronto
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distribución por clasificación */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CLASIFICACIONES.map((cls) => (
          <Card key={cls} className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Semaforo status={SEMAFORO_CLASIFICACION[cls]} size="sm" />
                <ClasificacionBadge clasificacion={cls} size="sm" />
              </div>
              <span className="text-lg font-bold font-mono">
                {resumen.distribucionClasificacion[cls] ?? 0}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Euro className="h-4 w-4 text-[var(--urus-success)]" />
              Facturación por colaborador (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top10Facturacion.length > 0 ? (
              <SimpleBarChart
                data={top10Facturacion}
                categories={["Facturación"]}
                index="nombre"
                layout="vertical"
                colors={["#10b981"]}
                height={Math.max(250, top10Facturacion.length * 40)}
              />
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Sin datos de facturación
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#3b82f6]" />
              Tiempos medios por tipo (días/hito)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tiemposPorTipo.length > 0 ? (
              <SimpleBarChart
                data={tiemposPorTipo}
                categories={["Días promedio"]}
                index="tipo"
                layout="horizontal"
                colors={["#3b82f6"]}
                height={250}
              />
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Sin datos de tiempos
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Semáforos por tipo */}
      {metricasPorTipo.length > 0 && (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-secondary" />
              Semáforos por tipo de colaborador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border/50">
                    <th className="text-left py-2 font-medium">Tipo</th>
                    <th className="text-center py-2 font-medium">Estado</th>
                    <th className="text-center py-2 font-medium">Colaboradores</th>
                    <th className="text-center py-2 font-medium">SLA %</th>
                    <th className="text-center py-2 font-medium">Avg días/hito</th>
                    <th className="text-center py-2 font-medium">Hitos vencidos</th>
                    <th className="text-right py-2 font-medium">Facturación</th>
                  </tr>
                </thead>
                <tbody>
                  {metricasPorTipo.map((t) => (
                    <tr key={t.tipo} className="border-b border-border/30 last:border-0">
                      <td className="py-2.5 font-medium">{t.tipo}</td>
                      <td className="py-2.5 text-center">
                        <div className="flex justify-center">
                          <Semaforo
                            status={slaToSemaforo(t.avgSlaCumplimiento)}
                            size="md"
                            pulse={t.avgSlaCumplimiento < 60}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 text-center font-mono">{t.totalColaboradores}</td>
                      <td
                        className="py-2.5 text-center font-mono font-semibold"
                        style={{ color: getSlaColor(t.avgSlaCumplimiento) }}
                      >
                        {t.avgSlaCumplimiento}%
                      </td>
                      <td className="py-2.5 text-center font-mono">
                        {t.avgDiasHito !== null ? `${t.avgDiasHito}d` : "—"}
                      </td>
                      <td className="py-2.5 text-center font-mono">
                        <span className={t.hitosVencidos > 0 ? "text-[var(--urus-danger)]" : ""}>
                          {t.hitosVencidos}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {formatCurrency(t.facturacionVinculadaEur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filtrar ranking:</span>
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

            <select
              value={filterCiudad}
              onChange={(e) => setFilterCiudad(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todas las ciudades</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={filterClas}
              onChange={(e) => setFilterClas(e.target.value)}
              className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="all">Todas las clasificaciones</option>
              {CLASIFICACIONES.map((cls) => (
                <option key={cls} value={cls}>{cls.replace("_", " ")}</option>
              ))}
            </select>

            <Badge variant="outline" className="text-[10px] ml-auto">
              {filteredRanking.length} colaboradores
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Ranking completo */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--urus-gold)]" />
            Ranking por facturación vinculada
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRanking.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">Sin datos de ranking</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border/50">
                    <th className="text-center py-2 font-medium w-10">#</th>
                    <th className="text-left py-2 font-medium">Nombre</th>
                    <th className="text-left py-2 font-medium">Tipo</th>
                    <th className="text-left py-2 font-medium">Ciudad</th>
                    <th className="text-center py-2 font-medium">Clasificación</th>
                    <th className="text-center py-2 font-medium">SLA %</th>
                    <th className="text-right py-2 font-medium">Facturación</th>
                    <th className="text-center py-2 font-medium">Ops</th>
                    <th className="text-center py-2 font-medium">Hitos</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRanking.map((c, idx) => {
                    const isTop3 = idx < 3;
                    const medalColors = [
                      "text-[var(--urus-gold)]",
                      "text-gray-400",
                      "text-amber-700",
                    ];

                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => (window.location.href = `/platform/colaboradores/${c.id}`)}
                      >
                        <td className="py-2.5 text-center">
                          {isTop3 ? (
                            <Medal className={`h-4 w-4 mx-auto ${medalColors[idx]}`} />
                          ) : (
                            <span className="font-mono text-muted-foreground">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-accent/40 flex items-center justify-center text-[10px] font-bold text-secondary shrink-0">
                              {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium truncate max-w-[160px]">{c.nombre}</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="text-[9px]">{c.tipo}</Badge>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {c.ciudad && (
                            <span className="flex items-center gap-1 text-xs">
                              <MapPin className="h-3 w-3" /> {c.ciudad}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <ClasificacionBadge clasificacion={c.clasificacion.clasificacion} size="sm" />
                        </td>
                        <td
                          className="py-2.5 text-center font-mono font-semibold"
                          style={{ color: getSlaColor(c.slaCumplimiento) }}
                        >
                          {c.slaCumplimiento}%
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold">
                          {formatCurrency(c.facturacionVinculadaEur)}
                        </td>
                        <td className="py-2.5 text-center font-mono">
                          {c.operacionesVinculadasCount}
                        </td>
                        <td className="py-2.5 text-center font-mono">
                          {c.hitosCompletados}
                          <span className="text-muted-foreground">/{c.hitosTotales}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
