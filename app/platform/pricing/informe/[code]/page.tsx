"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  BrainCircuit,
  BarChart3,
  Home,
  Check,
  X,
  Shield,
  AlertTriangle,
  TrendingDown,
  ArrowDown,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SemaforoIndicator,
  semaforoConfig,
} from "@/components/pricing/semaforo-indicator";
import type { PricingAnalysisResult } from "@/lib/pricing/types";
import type { PricingRecommendation } from "@/lib/pricing/recommendation-types";
import { pricingFixture } from "@/lib/mock-data/pricing-fixture";

type ViewState =
  | { kind: "loading" }
  | {
      kind: "error";
      status: number;
      message: string;
      missingFields?: string[];
      action: "load" | "analyze";
      actionLabel: string;
    }
  | { kind: "success"; data: PricingAnalysisResult };

const accionLabels: Record<string, { label: string; color: string; icon: typeof ArrowDown }> = {
  mantener: { label: "Mantener estrategia", color: "var(--urus-success)", icon: Check },
  ajustar_precio: { label: "Ajustar precio", color: "var(--urus-danger)", icon: ArrowDown },
  reposicionar: { label: "Reposicionar", color: "var(--urus-warning)", icon: RotateCcw },
};

function formatEur(n: number): string {
  return n.toLocaleString("es-ES");
}

function formatRatio(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function pctDiff(a: number, b: number): string {
  if (b === 0) return "—";
  const d = ((a - b) / b) * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function InformeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function InformeError({
  status,
  title,
  message,
  missingFields,
  onRetry,
  actionLabel,
}: {
  status: number;
  title?: string;
  message: string;
  missingFields?: string[];
  onRetry: () => void;
  actionLabel: string;
}) {
  return (
    <div className="space-y-6">
      <Link
        href="/platform/pricing"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
      </Link>
      <Card className="border-[var(--urus-danger)]/30 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-[var(--urus-danger)] mx-auto" />
          <h2 className="text-lg font-semibold">
            {title ?? (status === 422 ? "Datos incompletos para pricing" : "Error al generar informe")}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{message}</p>
          {missingFields && missingFields.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {missingFields.map((f) => (
                <Badge key={f} variant="outline" className="text-[var(--urus-danger)] border-[var(--urus-danger)]/30">
                  {f}
                </Badge>
              ))}
            </div>
          )}
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/90 transition-colors"
          >
            {actionLabel}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Section A: Header ─────────────────────────────────────────────────────────

function SectionHeader({ data }: { data: PricingAnalysisResult }) {
  const { input, stats } = data;
  const semConfig = semaforoConfig[stats.semaforo];

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: semConfig.color }} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SemaforoIndicator status={stats.semaforo} size="xl" />
              <div>
                <h1 className="text-xl font-bold">
                  {input.propertyCode}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    <MapPin className="h-3 w-3 mr-0.5" /> {input.ciudad} — {input.zona || "Sin zona"}
                  </Badge>
                  {input.tipologiaNombre && (
                    <Badge variant="outline" className="text-xs">
                      {input.tipologiaNombre}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {input.estado}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiBox label="Precio" value={`${formatEur(input.precio)} €`} sub={`${formatEur(input.precioM2)} €/m²`} />
            <KpiBox label="Superficie" value={`${input.metrosConstruidos} m²`} sub={`${input.habitaciones} hab · ${input.banyos} baños`} />
            <KpiBox
              label="Gap Precio"
              value={`${stats.gapPorcentaje > 0 ? "+" : ""}${stats.gapPorcentaje}%`}
              valueColor={stats.gapPorcentaje > 5 ? "var(--urus-danger)" : stats.gapPorcentaje > 0 ? "var(--urus-warning)" : "var(--urus-success)"}
              sub="vs media cluster"
            />
            <KpiBox label="Comparables" value={String(stats.totalComparables)} sub={`de ${data.queryMeta.totalResultsFromAPI} totales`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiBox({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="text-center px-4 py-2 rounded-xl bg-accent/10 border border-border/20">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold font-mono" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function SectionTemporalTrend({
  trend,
}: {
  trend?: PricingAnalysisResult["trend"];
}) {
  if (!trend) return null;

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-secondary" />
          <CardTitle className="text-sm font-semibold">Tendencia Temporal</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="rounded-xl p-4 bg-accent/10 border border-border/20">
          <p className="text-xs text-muted-foreground leading-relaxed">{trend.summary}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Edad inmueble" value={trend.propertyAgeDays != null ? `${trend.propertyAgeDays}d` : "N/D"} />
          <MiniStat label="Última actualización" value={trend.lastUpdatedDays != null ? `${trend.lastUpdatedDays}d` : "N/D"} />
          <MiniStat label="Mercado" value={trend.marketTempo} />
          <MiniStat label="Presión" value={trend.pressure} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Media días comp." value={trend.comparableAverageDaysPublished != null ? `${trend.comparableAverageDaysPublished}d` : "N/D"} />
          <MiniStat label="Mediana días comp." value={trend.comparableMedianDaysPublished != null ? `${trend.comparableMedianDaysPublished}d` : "N/D"} />
          <MiniStat label="Comparables frescos" value={formatRatio(trend.freshComparablesShare)} />
          <MiniStat label="Comparables estancados" value={formatRatio(trend.staleComparablesShare)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section B: Diagnóstico IA ─────────────────────────────────────────────────

function SectionDiagnostico({
  recommendation,
  recommendationError,
  stats,
}: {
  recommendation?: PricingRecommendation;
  recommendationError?: string;
  stats: PricingAnalysisResult["stats"];
}) {
  if (!recommendation && !recommendationError) {
    return null;
  }

  if (recommendationError || !recommendation) {
    return (
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-secondary" />
            <CardTitle className="text-sm font-semibold">Diagnóstico</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-xl p-4 bg-accent/10 border border-border/20">
            <p className="text-xs text-muted-foreground leading-relaxed">
              No se pudo generar la recomendación IA. Diagnóstico estadístico: gap de{" "}
              <span className="font-bold text-foreground">
                {stats.gapPorcentaje > 0 ? "+" : ""}
                {stats.gapPorcentaje}%
              </span>{" "}
              respecto al cluster de {stats.totalComparables} comparables (media{" "}
              {formatEur(stats.precioMedioM2)} €/m²).
            </p>
            {recommendationError && (
              <p className="text-[10px] text-muted-foreground/60 mt-2">Error: {recommendationError}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const accion = accionLabels[recommendation.accion] ?? accionLabels.mantener;
  const AccionIcon = accion.icon;

  return (
    <Card
      className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden"
      style={{ borderColor: `color-mix(in oklch, ${accion.color} 25%, var(--color-border))` }}
    >
      <div className="h-1" style={{ backgroundColor: accion.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-secondary" />
          <CardTitle className="text-sm font-semibold">Recomendación IA</CardTitle>
          <Badge
            variant="outline"
            className="ml-auto text-[10px]"
            style={{ color: accion.color, borderColor: `color-mix(in oklch, ${accion.color} 40%, transparent)` }}
          >
            Confianza: {(recommendation.confidence * 100).toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <Badge
          className="text-sm px-4 py-2 gap-2"
          style={{
            backgroundColor: `color-mix(in oklch, ${accion.color} 12%, transparent)`,
            color: accion.color,
            borderColor: `color-mix(in oklch, ${accion.color} 30%, transparent)`,
          }}
        >
          <AccionIcon className="h-4 w-4" />
          {accion.label}
        </Badge>

        <div className="rounded-xl p-4 bg-accent/10 border border-border/20">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[var(--urus-gold)] shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{recommendation.diagnostico}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section C: Recomendaciones accionables ─────────────────────────────────────

function SectionRecomendaciones({ recommendation, input }: { recommendation: PricingRecommendation; input: PricingAnalysisResult["input"] }) {
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-secondary" />
          <CardTitle className="text-sm font-semibold">Qué hacer ahora</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="space-y-2">
          {recommendation.recomendaciones.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl p-3 bg-accent/5 border border-border/10 hover:bg-accent/10 transition-colors">
              <span className="h-6 w-6 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-secondary">
                {i + 1}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">{r}</p>
            </div>
          ))}
        </div>

        {recommendation.accion === "ajustar_precio" &&
          recommendation.precioSugeridoMin != null &&
          recommendation.precioSugeridoMax != null && (
            <Card className="border-[var(--urus-danger)]/20 bg-[var(--urus-danger)]/3">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Rango de precio sugerido</p>
                <div className="flex items-center gap-4">
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground">Mínimo</p>
                    <p className="text-lg font-bold font-mono text-[var(--urus-success)]">
                      {formatEur(recommendation.precioSugeridoMin)} €
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border/30" />
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground">Máximo</p>
                    <p className="text-lg font-bold font-mono text-[var(--urus-warning)]">
                      {formatEur(recommendation.precioSugeridoMax)} €
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border/30" />
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <p className="text-lg font-bold font-mono text-[var(--urus-danger)]">
                      {formatEur(input.precio)} €
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
      </CardContent>
    </Card>
  );
}

// ── Section D: Argumentos y Riesgos ───────────────────────────────────────────

function SectionArgumentosRiesgos({ recommendation }: { recommendation: PricingRecommendation }) {
  const hasArgs = recommendation.argumentosComerciales.length > 0;
  const hasRisks = recommendation.riesgos.length > 0;
  if (!hasArgs && !hasRisks) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {hasArgs && (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[var(--urus-success)]" />
              <CardTitle className="text-sm font-semibold">Argumentos Comerciales</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {recommendation.argumentosComerciales.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-[var(--urus-success)] shrink-0 mt-0.5" />
                <span>{a}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {hasRisks && (
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--urus-danger)]" />
              <CardTitle className="text-sm font-semibold">Riesgos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {recommendation.riesgos.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <XCircle className="h-3.5 w-3.5 text-[var(--urus-danger)] shrink-0 mt-0.5" />
                <span>{r}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Section E: Gap visual ─────────────────────────────────────────────────────

function SectionGapVisual({ data }: { data: PricingAnalysisResult }) {
  const { input, stats } = data;
  const maxScale = Math.max(input.precioM2, stats.precioMedioM2, stats.precioMaxM2) * 1.15;

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-secondary" />
          <CardTitle className="text-sm font-semibold">Gap de Precio vs Cluster (€/m²)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="space-y-3">
          <PriceBar label="Tu inmueble" value={input.precioM2} maxScale={maxScale} color={stats.gapPorcentaje > 5 ? "var(--urus-danger)" : stats.gapPorcentaje > 0 ? "var(--urus-warning)" : "var(--urus-success)"} />
          <PriceBar label="Media cluster" value={stats.precioMedioM2} maxScale={maxScale} color="var(--color-secondary)" />
          <PriceBar label="Mediana cluster" value={stats.precioMedianaM2} maxScale={maxScale} color="var(--color-secondary)" opacity={0.6} />
          {stats.precioMedioM2Particular != null && (
            <PriceBar label="Media particular" value={stats.precioMedioM2Particular} maxScale={maxScale} color="#a78bfa" />
          )}
          {stats.precioMedioM2Profesional != null && (
            <PriceBar label="Media profesional" value={stats.precioMedioM2Profesional} maxScale={maxScale} color="#f472b6" />
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/20">
          <MiniStat label="Min €/m²" value={`${formatEur(stats.precioMinM2)} €`} />
          <MiniStat label="Max €/m²" value={`${formatEur(stats.precioMaxM2)} €`} />
          <MiniStat label="Desviación" value={`${stats.desviacionEstandar}`} />
          <MiniStat
            label="Gap"
            value={`${stats.gapPorcentaje > 0 ? "+" : ""}${stats.gapPorcentaje}%`}
            valueColor={stats.gapPorcentaje > 5 ? "var(--urus-danger)" : stats.gapPorcentaje > 0 ? "var(--urus-warning)" : "var(--urus-success)"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PriceBar({
  label,
  value,
  maxScale,
  color,
  opacity = 1,
}: {
  label: string;
  value: number;
  maxScale: number;
  color: string;
  opacity?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold">{formatEur(value)} €/m²</span>
      </div>
      <div className="h-4 rounded-full bg-accent/20 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min((value / maxScale) * 100, 100)}%`,
            backgroundColor: color,
            opacity,
          }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="text-center rounded-xl p-3 bg-accent/10 border border-border/20">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold font-mono" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
    </div>
  );
}

// ── Section F: Tabla de comparables ───────────────────────────────────────────

function SectionComparables({ data }: { data: PricingAnalysisResult }) {
  const { input, comparables } = data;

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-secondary" />
            <CardTitle className="text-sm font-semibold">Comparables de Mercado</CardTitle>
          </div>
          <p className="text-[10px] text-muted-foreground">{comparables.length} propiedades similares</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Zona</th>
                <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                <th className="text-right px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">€/m²</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">m²</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Hab</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tipo</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Días publ.</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">vs URUS</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/15">
              {/* URUS row */}
              <tr className="bg-secondary/5 border-l-2 border-secondary">
                <td className="px-4 py-2.5">
                  <span className="text-xs font-semibold text-secondary">▸ {input.zona || input.ciudad}</span>
                  <Badge className="ml-2 text-[8px] px-1.5 bg-secondary/15 text-secondary border-secondary/30">
                    URUS
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-mono font-bold">{formatEur(input.precio)} €</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono">{formatEur(input.precioM2)} €</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono">{input.metrosConstruidos}</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono">{input.habitaciones}</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono">—</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono">—</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono">—</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono">—</td>
              </tr>
              {comparables.map((c) => {
                const diff = pctDiff(c.precioM2, input.precioM2);
                const isLower = c.precioM2 < input.precioM2;
                return (
                  <tr key={c.statefoxId} className="hover:bg-accent/10 transition-colors">
                    <td className="px-4 py-2.5 text-xs">{c.zona || c.ciudad}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono">{formatEur(c.precio)} €</td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono">{formatEur(c.precioM2)} €</td>
                    <td className="px-4 py-2.5 text-center text-xs font-mono">{c.metrosConstruidos}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-mono">{c.habitaciones}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className="text-[8px]">
                        {c.advertiserType === "private" ? "Particular" : c.advertiserType === "professional" ? "Profesional" : "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs font-mono">{c.diasPublicado != null ? `${c.diasPublicado}d` : "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs font-mono font-bold ${isLower ? "text-[var(--urus-success)]" : "text-[var(--urus-danger)]"}`}>
                        {diff}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.link ? (
                        <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-secondary hover:text-secondary/80 transition-colors">
                          <ExternalLink className="h-3.5 w-3.5 mx-auto" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section G: Extras comparison ──────────────────────────────────────────────

const EXTRAS_KEYS = [
  { key: "terraza", label: "Terraza" },
  { key: "garaje", label: "Garaje" },
  { key: "ascensor", label: "Ascensor" },
  { key: "trastero", label: "Trastero" },
  { key: "piscina", label: "Piscina" },
  { key: "aireAcondicionado", label: "A/C" },
] as const;

function SectionExtras({ data }: { data: PricingAnalysisResult }) {
  const { input, comparables } = data;
  const top5 = comparables.slice(0, 5);
  if (top5.length === 0) return null;

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-[var(--urus-success)]" />
          <CardTitle className="text-sm font-semibold">Comparación de Extras</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Extra</th>
                <th className="text-center px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">URUS</th>
                {top5.map((c, i) => (
                  <th key={c.statefoxId} className="text-center px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    #{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/15">
              {EXTRAS_KEYS.map(({ key, label }) => (
                <tr key={key} className="hover:bg-accent/10 transition-colors">
                  <td className="px-3 py-2 text-xs font-medium">{label}</td>
                  <td className="px-3 py-2 text-center">
                    {(input.extras as unknown as Record<string, unknown>)[key] ? (
                      <Check className="h-4 w-4 text-[var(--urus-success)] mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-[var(--urus-danger)]/50 mx-auto" />
                    )}
                  </td>
                  {top5.map((c) => (
                    <td key={c.statefoxId} className="px-3 py-2 text-center">
                      {(c.extras as unknown as Record<string, unknown>)?.[key] ? (
                        <Check className="h-3.5 w-3.5 text-[var(--urus-success)]/60 mx-auto" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Extras string: calefaccion, año, certificado */}
        <div className="mt-3 pt-3 border-t border-border/20 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {input.extras.calefaccion && <span>Calefacción: <strong className="text-foreground">{input.extras.calefaccion}</strong></span>}
          {input.extras.anoConstruccion && <span>Año: <strong className="text-foreground">{input.extras.anoConstruccion}</strong></span>}
          {input.extras.certificadoEnergetico && <span>Cert. energético: <strong className="text-foreground">{input.extras.certificadoEnergetico}</strong></span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section H: Metadata ───────────────────────────────────────────────────────

function SectionMetadata({ data }: { data: PricingAnalysisResult }) {
  const [open, setOpen] = useState(false);
  const { queryMeta, analyzedAt } = data;

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-accent/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Metadata del análisis</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetaItem label="Analizado" value={new Date(analyzedAt).toLocaleString("es-ES")} />
            <MetaItem label="Endpoint" value={queryMeta.endpoint} />
            <MetaItem label="Housing" value={queryMeta.housing} />
            <MetaItem label="Tipo operación" value={queryMeta.type} />
            <MetaItem label="Páginas escaneadas" value={String(queryMeta.pagesScanned)} />
            <MetaItem label="Total API" value={formatEur(queryMeta.totalResultsFromAPI)} />
            <MetaItem label="Filtrados" value={String(queryMeta.filteredResults)} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2 bg-accent/5 border border-border/10">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xs font-mono font-medium mt-0.5">{value}</p>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export default function InformePricingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const isMock = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");

  const loadReport = useCallback(async () => {
    if (isMock) {
      setState({ kind: "success", data: { ...pricingFixture, propertyCode: code } });
      return;
    }

    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/pricing/report/${code}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          status: res.status,
          message: body.message ?? body.error ?? `Error ${res.status}`,
          missingFields: body.missingFields,
          action: res.status === 404 ? "analyze" : "load",
          actionLabel: res.status === 404 ? "Generar análisis ahora" : "Reintentar carga",
        });
        return;
      }

      const data: PricingAnalysisResult = await res.json();
      setState({ kind: "success", data });
    } catch (err) {
      setState({
        kind: "error",
        status: 0,
        message: err instanceof Error ? err.message : "Error de red",
        action: "load",
        actionLabel: "Reintentar carga",
      });
    }
  }, [code, isMock]);

  const runAnalysis = useCallback(async () => {
    if (isMock) {
      setState({ kind: "success", data: { ...pricingFixture, propertyCode: code } });
      return;
    }

    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/pricing/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyCode: code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          status: res.status,
          message: body.message ?? body.error ?? `Error ${res.status}`,
          missingFields: body.missingFields,
          action: "analyze",
          actionLabel: "Reintentar análisis",
        });
        return;
      }

      const data: PricingAnalysisResult = await res.json();
      setState({ kind: "success", data });
    } catch (err) {
      setState({
        kind: "error",
        status: 0,
        message: err instanceof Error ? err.message : "Error de red",
        action: "analyze",
        actionLabel: "Reintentar análisis",
      });
    }
  }, [code, isMock]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void loadReport();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadReport]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-6">
        <Link href="/platform/pricing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
          <p className="text-sm text-muted-foreground">Analizando inmueble <span className="font-mono font-bold text-foreground">{code}</span> contra el mercado...</p>
        </div>
        <InformeSkeleton />
      </div>
    );
  }

  if (state.kind === "error") {
    const inferredTitle =
      state.status === 422 && !state.missingFields?.length
        ? "Análisis no permitido para esta propiedad"
        : undefined;
    return (
      <InformeError
        status={state.status}
        title={inferredTitle}
        message={state.message}
        missingFields={state.missingFields}
        actionLabel={state.actionLabel}
        onRetry={state.action === "analyze" ? runAnalysis : loadReport}
      />
    );
  }

  const { data } = state;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/platform/pricing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" /> Volver a Smart Pricing
        </Link>
        <button
          onClick={runAnalysis}
          className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/90 transition-colors"
        >
          Actualizar análisis
        </button>
      </div>

      {/* A: Header */}
      <SectionHeader data={data} />

      {/* B: Diagnóstico IA */}
      <SectionDiagnostico
        recommendation={data.recommendation}
        recommendationError={data.recommendationError}
        stats={data.stats}
      />

      {/* Tendencia temporal */}
      <SectionTemporalTrend trend={data.trend} />

      {/* C + D: Recomendaciones + Argumentos/Riesgos */}
      {data.recommendation && (
        <>
          <SectionRecomendaciones recommendation={data.recommendation} input={data.input} />
          <SectionArgumentosRiesgos recommendation={data.recommendation} />
        </>
      )}

      {/* E: Gap visual */}
      <SectionGapVisual data={data} />

      {/* F: Tabla de comparables */}
      {data.comparables.length > 0 && <SectionComparables data={data} />}

      {/* G: Extras */}
      <SectionExtras data={data} />

      {/* H: Metadata */}
      <SectionMetadata data={data} />
    </div>
  );
}
