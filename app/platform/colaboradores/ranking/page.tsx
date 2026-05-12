"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  ArrowLeft,
  Users,
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
  Medal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Semaforo } from "@/components/dashboard/semaforo";
import { SimpleBarChart } from "@/components/bi/charts";
import { ClasificacionBadge } from "@/components/colaboradores/clasificacion-badge";
import type { ColaboradorClasificacion } from "@/components/colaboradores/clasificacion-badge";
import { Loader2 } from "lucide-react";

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

const CLASIFICACION_LABELS: Record<ColaboradorClasificacion, string> = {
  partner_estrategico: "Socio Estratégico",
  funcional: "Funcional",
  lento: "Lento",
  critico: "Crítico",
  sin_datos: "Sin datos",
};

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
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Back link */}
      <Link
        href="/platform/colaboradores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver a Colaboradores
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clasificación de Colaboradores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clasificación por facturación vinculada, tiempos medios y semáforos.
          </p>
        </div>
      </div>

      {/* KPI Cards - B2B Style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Colaboradores Activos</span>
              <Users className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{resumen.totalActivos}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Plazos Cumplidos</span>
              <ShieldCheck className={resumen.slaCumplimientoGlobal >= 80 ? "h-4 w-4 text-[var(--urus-success)]" : "h-4 w-4"} />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {resumen.slaCumplimientoGlobal}<span className="text-sm font-medium text-muted-foreground ml-1">%</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Hitos Vencidos</span>
              <AlertTriangle className={resumen.hitosVencidosTotales > 0 ? "h-4 w-4 text-[var(--urus-danger)]" : "h-4 w-4"} />
            </div>
            <p className={`text-2xl font-bold ${resumen.hitosVencidosTotales > 0 ? "text-[var(--urus-danger)]" : "text-foreground"}`}>
              {resumen.hitosVencidosTotales}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Facturación Vinculada</span>
              <Euro className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(resumen.facturacionTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución por clasificación */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CLASIFICACIONES.map((cls) => (
          <Card key={cls} className="shadow-sm border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Semaforo status={SEMAFORO_CLASIFICACION[cls]} size="sm" />
                <ClasificacionBadge clasificacion={cls} size="sm" />
              </div>
              <span className="text-lg font-bold font-mono text-foreground">
                {resumen.distribucionClasificacion[cls] ?? 0}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recomendaciones IA */}
      <Card className="shadow-sm border-border/60">
        <div className="p-5 border-b border-border/40 flex items-center justify-between bg-accent/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
            <h3 className="text-sm font-semibold text-foreground">Recomendaciones del sistema</h3>
          </div>
          {data.recomendacionGeneradaAt && (
            <span className="text-xs text-muted-foreground">
              {timeAgo(data.recomendacionGeneradaAt)}
            </span>
          )}
        </div>
        <CardContent className="p-5">
          {data.ultimaRecomendacion ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-foreground">{data.ultimaRecomendacion.resumen_ejecutivo}</p>
                <p className="text-sm text-muted-foreground mt-1">{data.ultimaRecomendacion.diagnostico}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.ultimaRecomendacion.recomendaciones.map((reco, i) => {
                  const cfg = RECO_TIPO_CONFIG[reco.tipo];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-border/40 p-4 bg-card"
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 mt-0.5" style={{ color: cfg.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <Badge variant="secondary" className="text-[10px] font-medium" style={{ color: cfg.color, backgroundColor: `color-mix(in oklch, ${cfg.color} 10%, transparent)` }}>
                              {cfg.label}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-medium" style={{ color: PRIORIDAD_COLORS[reco.prioridad], backgroundColor: `color-mix(in oklch, ${PRIORIDAD_COLORS[reco.prioridad]} 10%, transparent)` }}>
                              {reco.prioridad}
                            </Badge>
                            {reco.colaboradores_afectados.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {reco.colaboradores_afectados.join(", ")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground font-medium">{reco.mensaje}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Acción:</span> {reco.accion_sugerida}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Impacto:</span> {reco.impacto_esperado}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/40">
                <span>Confianza IA: {Math.round(data.ultimaRecomendacion.confidence * 100)}%</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm font-medium text-foreground">Las recomendaciones se generan automáticamente</p>
              <p className="text-xs text-muted-foreground mt-1">Vuelve pronto para ver nuevos insights.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm border-border/60">
          <div className="p-4 border-b border-border/40 flex items-center gap-2 bg-accent/10">
            <Euro className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Facturación por colaborador (Top 10)</h3>
          </div>
          <CardContent className="p-5">
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

        <Card className="shadow-sm border-border/60">
          <div className="p-4 border-b border-border/40 flex items-center gap-2 bg-accent/10">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Tiempos medios por tipo (días/hito)</h3>
          </div>
          <CardContent className="p-5">
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
        <Card className="shadow-sm border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/40 flex items-center gap-2 bg-accent/10">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Semáforos por tipo de colaborador</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-accent/20 border-b border-border/40">
                <tr>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Estado</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Colaboradores</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Plazo %</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Días/hito</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Hitos Vencidos</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-right">Facturación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 bg-card">
                {metricasPorTipo.map((t) => (
                  <tr key={t.tipo} className="hover:bg-accent/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{t.tipo}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center">
                        <Semaforo
                          status={slaToSemaforo(t.avgSlaCumplimiento)}
                          size="sm"
                          pulse={t.avgSlaCumplimiento < 60}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center font-medium">{t.totalColaboradores}</td>
                    <td
                      className="px-5 py-3 text-center font-medium"
                      style={{ color: getSlaColor(t.avgSlaCumplimiento) }}
                    >
                      {t.avgSlaCumplimiento}%
                    </td>
                    <td className="px-5 py-3 text-center text-muted-foreground">
                      {t.avgDiasHito !== null ? `${t.avgDiasHito}d` : "—"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={t.hitosVencidos > 0 ? "text-[var(--urus-danger)] font-medium" : "text-muted-foreground"}>
                        {t.hitosVencidos}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
                      {formatCurrency(t.facturacionVinculadaEur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Toolbar (Filters) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border/60 rounded-lg p-2 shadow-sm mt-8">
        <div className="flex items-center gap-2 px-2">
          <Trophy className="h-4 w-4 text-[var(--urus-gold)]" />
          <span className="text-sm font-medium text-foreground">Ranking Detallado</span>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="h-6 w-px bg-border/60 hidden sm:block mx-2" />
          
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-secondary/50 min-w-[140px]"
          >
            <option value="all">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={filterCiudad}
            onChange={(e) => setFilterCiudad(e.target.value)}
            className="bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-secondary/50 min-w-[140px]"
          >
            <option value="all">Todas las ciudades</option>
            {ciudades.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filterClas}
            onChange={(e) => setFilterClas(e.target.value)}
            className="bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-secondary/50 min-w-[160px]"
          >
            <option value="all">Cualquier clasificación</option>
            {CLASIFICACIONES.map((cls) => (
              <option key={cls} value={cls}>{CLASIFICACION_LABELS[cls]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ranking completo */}
      <Card className="shadow-sm border-border/60 overflow-hidden">
        {filteredRanking.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-accent/10">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-foreground">Sin datos de ranking</p>
            <p className="text-sm text-muted-foreground mt-1">Ajusta los filtros para ver resultados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-accent/40 border-b border-border/60">
                <tr>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center w-12">#</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Colaborador</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Ciudad</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Clasificación</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Cumplimiento SLA</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-right">Facturación</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Asignaciones</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground text-center">Hitos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 bg-card">
                {filteredRanking.map((c, idx) => {
                  const isTop3 = idx < 3;
                  const medalColors = [
                    "text-[var(--urus-gold)]",
                    "text-gray-400",
                    "text-[var(--urus-warning)]",
                  ];

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-accent/30 transition-colors cursor-pointer group"
                      onClick={() => (window.location.href = `/platform/colaboradores/${c.id}`)}
                    >
                      <td className="px-5 py-3 text-center">
                        {isTop3 ? (
                          <Medal className={`h-4 w-4 mx-auto ${medalColors[idx]}`} />
                        ) : (
                          <span className="text-muted-foreground font-medium">{idx + 1}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-semibold text-secondary shrink-0 border border-secondary/20">
                            {c.nombre.split(" ")[0].slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground truncate max-w-[200px] group-hover:text-secondary transition-colors">
                            {c.nombre}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="secondary" className="font-normal bg-accent text-foreground hover:bg-accent">
                          {c.tipo}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {c.ciudad || "—"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <ClasificacionBadge clasificacion={c.clasificacion.clasificacion} size="sm" />
                      </td>
                      <td
                        className="px-5 py-3 text-center font-medium"
                        style={{ color: getSlaColor(c.slaCumplimiento) }}
                      >
                        {c.slaCumplimiento}%
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-foreground">
                        {formatCurrency(c.facturacionVinculadaEur)}
                      </td>
                      <td className="px-5 py-3 text-center text-foreground font-medium">
                        {c.operacionesVinculadasCount}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="font-medium text-foreground">{c.hitosCompletados}</span>
                        <span className="text-muted-foreground text-xs ml-1">/ {c.hitosTotales}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
