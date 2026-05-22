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
  ChevronLeft,
  ChevronRight,
  Loader2,
  Info,
  CheckCircle2,
  XCircle,
  Phone,
  Building2,
  Image as ImageIcon,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SemaforoIndicator,
  semaforoConfig,
} from "@/components/pricing/semaforo-indicator";
import type { PricingAnalysisResult, PricingComparable } from "@/lib/pricing/types";
import type { PricingRecommendation } from "@/lib/pricing/recommendation-types";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import { formatStatefoxHousingLabel } from "@/lib/statefox/housing-label";
import { proxiedStatefoxImageUrl } from "@/lib/statefox/image-url";
import { useStatefoxImageCachePolling } from "@/lib/statefox/image-cache/use-image-cache-polling";
import { pricingFixture } from "@/lib/mock-data/pricing-fixture";
import { AnalysisProcessingCard } from "@/components/pricing/analysis-processing-card";
import { isPricingMarketStudyUiEnabled } from "@/lib/pricing/ui-feature-flags";
import { useGlobalLoader } from "@/lib/hooks/use-global-loader";

type ViewState =
  | { kind: "loading" }
  | { kind: "processing"; propertyCode: string; message?: string }
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
  mantener: { label: "Mantener estrategia", color: "var(--status-success)", icon: Check },
  ajustar_precio: { label: "Ajustar precio", color: "var(--status-danger)", icon: ArrowDown },
  reposicionar: { label: "Reposicionar", color: "var(--status-warning)", icon: RotateCcw },
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

// ── Aplicar precio sugerido ───────────────────────────────────────────────────

function ApplyPriceCard({
  propertyCode,
  currentPrice,
  suggestedMin,
  suggestedMax,
}: {
  propertyCode: string;
  currentPrice: number;
  suggestedMin: number;
  suggestedMax: number;
}) {
  const midPoint = Math.round((suggestedMin + suggestedMax) / 2);
  const [selectedPrice, setSelectedPrice] = useState(midPoint);
  const [step, setStep] = useState<"idle" | "confirming">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  const isBlocked = cooldownSec > 0;

  const presets = [
    { label: "Mínimo", value: suggestedMin },
    { label: "Medio", value: midPoint },
    { label: "Máximo", value: suggestedMax },
  ];

  async function handleApply() {
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/pricing/apply-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyCode,
          newPrice: selectedPrice,
          previousPrice: currentPrice,
          source: "pricing-recommendation",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" }));
        if (data.code === "RATE_LIMIT" || res.status === 429) {
          const retrySec = typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : 120;
          setCooldownSec(retrySec);
          throw new Error(data.error || "Límite de peticiones alcanzado");
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setResult("error");
      setStep("idle");
    } finally {
      setSubmitting(false);
    }
  }

  if (result === "success") {
    return (
      <Card className="border-status-success/30 bg-status-success-bg">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-status-success shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Precio actualizado a {formatEur(selectedPrice)} €</p>
              <p className="text-[10px] text-muted-foreground">
                El cambio puede tardar entre 10 y 15 minutos en reflejarse en Inmovilla y los portales
                debido a las restricciones de su API. El sistema no volverá a re-analizar este cambio de precio.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Inmovilla establece límites de procesamiento en su API — los cambios de precio
              se propagan a portales (Idealista, Fotocasa, etc.) según los ciclos de sincronización de cada portal.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-status-warning/20 bg-status-warning-bg/30">
      <CardContent className="p-4 space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Rango de precio sugerido</p>
        <div className="flex items-center gap-4">
          <div className="text-center flex-1">
            <p className="text-xs text-slate-500">Mínimo</p>
            <p className="text-lg font-bold font-mono text-status-success">
              {formatEur(suggestedMin)} €
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-center flex-1">
            <p className="text-xs text-slate-500">Máximo</p>
            <p className="text-lg font-bold font-mono text-status-warning">
              {formatEur(suggestedMax)} €
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-center flex-1">
            <p className="text-xs text-slate-500">Actual</p>
            <p className="text-lg font-bold font-mono text-status-danger">
              {formatEur(currentPrice)} €
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            Aplicar nuevo precio en Inmovilla
          </p>
          <div className="flex items-center gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                disabled={isBlocked}
                onClick={() => { setSelectedPrice(p.value); setStep("idle"); setResult(null); }}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${
                  selectedPrice === p.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="block text-[9px] opacity-70">{p.label}</span>
                <span className="font-mono">{formatEur(p.value)} €</span>
              </button>
            ))}
          </div>

          {result === "error" && (
            <div className="rounded-lg bg-status-danger-bg border border-status-danger/20 px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-status-danger">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {errorMsg}
              </div>
              {isBlocked && (
                <p className="text-[10px] text-slate-500 pl-5.5">
                  Inmovilla establece límites de peticiones por minuto.
                  Podrás reintentar en <span className="font-mono font-medium text-foreground">{Math.ceil(cooldownSec / 60)} min {cooldownSec % 60}s</span>.
                </p>
              )}
            </div>
          )}

          {step === "idle" ? (
            <button
              onClick={() => setStep("confirming")}
              disabled={submitting || isBlocked}
              className="w-full rounded-lg bg-primary/10 text-primary hover:bg-primary/15 px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isBlocked
                ? `Disponible en ${Math.ceil(cooldownSec / 60)} min ${cooldownSec % 60}s`
                : `Aplicar ${formatEur(selectedPrice)} € como nuevo precio`}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleApply}
                disabled={submitting || isBlocked}
                className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-medium transition-colors hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Actualizando...</>
                ) : (
                  <>Confirmar: {formatEur(selectedPrice)} €</>
                )}
              </button>
              <button
                onClick={() => setStep("idle")}
                disabled={submitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          )}

          <p className="text-[9px] text-slate-400 leading-relaxed">
            Inmovilla establece límites en su API (máx. 10 peticiones/min). El cambio de precio puede
            tardar entre 10–15 min en reflejarse en los portales.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function InformeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
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
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a Cartera interna
      </Link>
      <Card className="border-status-danger/30 bg-status-danger-bg/30">
        <CardContent className="p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-status-danger mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">
            {title ?? (status === 422 ? "Datos incompletos para pricing" : "Error al generar informe")}
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">{message}</p>
          {missingFields && missingFields.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {missingFields.map((f) => (
                <Badge key={f} variant="outline" className="text-status-danger border-status-danger/30 bg-white">
                  {f}
                </Badge>
              ))}
            </div>
          )}
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
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
    <Card className="border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div className="h-1.5" style={{ backgroundColor: semConfig.color }} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SemaforoIndicator status={stats.semaforo} size="xl" />
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {input.propertyCode}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs bg-white border-slate-200 text-slate-600">
                    <MapPin className="h-3 w-3 mr-0.5" /> {input.ciudad} — {input.zona || "Sin zona"}
                  </Badge>
                  {input.tipologiaNombre && (
                    <Badge variant="outline" className="text-xs bg-white border-slate-200 text-slate-600">
                      {input.tipologiaNombre}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs bg-white border-slate-200 text-slate-600">
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
              label="Diferencia"
              value={`${stats.gapPorcentaje > 0 ? "+" : ""}${stats.gapPorcentaje}%`}
              valueColor={stats.gapPorcentaje > 5 ? "var(--status-danger)" : stats.gapPorcentaje > 0 ? "var(--status-warning)" : "var(--status-success)"}
              sub="vs media de mercado"
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
    <div className="text-center px-4 py-2 rounded-lg bg-slate-50 border border-slate-200/60">
      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-lg font-bold font-mono text-foreground" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
      <p className="text-[10px] text-slate-500">{sub}</p>
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
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground">Tendencia Temporal</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="rounded-lg p-4 bg-slate-50 border border-slate-200/60">
          <p className="text-xs text-slate-600 leading-relaxed">{trend.summary}</p>
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
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">Diagnóstico</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg p-4 bg-slate-50 border border-slate-200/60">
            <p className="text-xs text-slate-600 leading-relaxed">
              No se pudo generar la recomendación IA. Diagnóstico estadístico: diferencia de{" "}
              <span className="font-bold text-foreground">
                {stats.gapPorcentaje > 0 ? "+" : ""}
                {stats.gapPorcentaje}%
              </span>{" "}
              respecto al mercado ({stats.totalComparables} propiedades similares, media{" "}
              {formatEur(stats.precioMedioM2)} €/m²).
            </p>
            {recommendationError && (
              <p className="text-[10px] text-slate-400 mt-2">Error: {recommendationError}</p>
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
      className="border border-slate-200 overflow-hidden bg-white shadow-sm"
      style={{ borderColor: `color-mix(in oklch, ${accion.color} 25%, #e2e8f0)` }}
    >
      <div className="h-1" style={{ backgroundColor: accion.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground">Recomendación IA</CardTitle>
          <Badge
            variant="outline"
            className="ml-auto text-[10px] bg-white"
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

        <div className="rounded-lg p-4 bg-slate-50 border border-slate-200/60">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">{recommendation.diagnostico}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section C: Recomendaciones accionables ─────────────────────────────────────

function SectionRecomendaciones({ recommendation, input }: { recommendation: PricingRecommendation; input: PricingAnalysisResult["input"] }) {
  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-status-success" />
          <CardTitle className="text-sm font-semibold text-foreground">Qué hacer ahora</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="space-y-2">
          {recommendation.recomendaciones.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg p-3 bg-slate-50 border border-slate-200/60 hover:bg-slate-100/60 transition-colors">
              <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-xs text-slate-600 leading-relaxed pt-0.5">{r}</p>
            </div>
          ))}
        </div>

        {recommendation.accion === "ajustar_precio" &&
          recommendation.precioSugeridoMin != null &&
          recommendation.precioSugeridoMax != null && (
            <ApplyPriceCard
              propertyCode={input.propertyCode}
              currentPrice={input.precio}
              suggestedMin={recommendation.precioSugeridoMin}
              suggestedMax={recommendation.precioSugeridoMax}
            />
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
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-status-success" />
              <CardTitle className="text-sm font-semibold text-foreground">Argumentos Comerciales</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {recommendation.argumentosComerciales.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <Check className="h-3.5 w-3.5 text-status-success shrink-0 mt-0.5" />
                <span>{a}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {hasRisks && (
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-danger" />
              <CardTitle className="text-sm font-semibold text-foreground">Riesgos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {recommendation.riesgos.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <XCircle className="h-3.5 w-3.5 text-status-danger shrink-0 mt-0.5" />
                <span>{r}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Section E: Comparación de precios ─────────────────────────────────────────

function SectionComparacionPrecios({ data }: { data: PricingAnalysisResult }) {
  const { input, stats } = data;
  const maxScale = Math.max(input.precioM2, stats.precioMedioM2, stats.precioMaxM2) * 1.15;

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground">Tu precio vs el mercado (€/m²)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="space-y-3">
          <PriceBar label="Tu inmueble" value={input.precioM2} maxScale={maxScale} color={stats.gapPorcentaje > 5 ? "var(--status-danger)" : stats.gapPorcentaje > 0 ? "var(--status-warning)" : "var(--status-success)"} />
          <PriceBar label="Media de mercado" value={stats.precioMedioM2} maxScale={maxScale} color="var(--primary)" />
          <PriceBar label="Mediana de mercado" value={stats.precioMedianaM2} maxScale={maxScale} color="var(--primary)" opacity={0.6} />
          {stats.precioMedioM2Particular != null && (
            <PriceBar label="Media particular" value={stats.precioMedioM2Particular} maxScale={maxScale} color="#64748b" />
          )}
          {stats.precioMedioM2Profesional != null && (
            <PriceBar label="Media profesional" value={stats.precioMedioM2Profesional} maxScale={maxScale} color="#0f766e" />
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200">
          <MiniStat label="Min €/m²" value={`${formatEur(stats.precioMinM2)} €`} />
          <MiniStat label="Max €/m²" value={`${formatEur(stats.precioMaxM2)} €`} />
          <MiniStat label="Desviación" value={`${stats.desviacionEstandar}`} />
          <MiniStat
            label="Diferencia"
            value={`${stats.gapPorcentaje > 0 ? "+" : ""}${stats.gapPorcentaje}%`}
            valueColor={stats.gapPorcentaje > 5 ? "var(--status-danger)" : stats.gapPorcentaje > 0 ? "var(--status-warning)" : "var(--status-success)"}
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
        <span className="text-slate-500">{label}</span>
        <span className="font-mono font-bold text-foreground">{formatEur(value)} €/m²</span>
      </div>
      <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
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
    <div className="text-center rounded-lg p-3 bg-slate-50 border border-slate-200/60">
      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-lg font-bold font-mono text-foreground" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
    </div>
  );
}

// ── Photo carousel for comparable detail ─────────────────────────────────────

function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function isCloudinaryImageUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("res.cloudinary.com");
  } catch {
    return false;
  }
}

function ComparablePhotoCarousel({
  fotos,
  alt,
  liveCachedUrls,
  isProcessing = false,
}: {
  fotos: string[];
  alt: string;
  /** URLs Cloudinary recibidas por polling. Si están presentes, pisan a `fotos`. */
  liveCachedUrls?: string[];
  /** Si true, el worker sigue trabajando: muestra indicador de "cargando fotos". */
  isProcessing?: boolean;
}) {
  const sourceFotos = liveCachedUrls && liveCachedUrls.length > 0 ? liveCachedUrls : fotos;
  const validFotos = sourceFotos.filter(
    (url) => isValidImageUrl(url) && (isCloudinaryImageUrl(url) || !isExpiredStatefoxImageUrl(url)),
  );
  const [idx, setIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const visibleFotos = validFotos.filter((u) => !failedUrls.has(u));

  if (visibleFotos.length === 0) {
    return (
      <div className="w-full h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center gap-2">
        {isProcessing ? (
          <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
        ) : (
          <ImageIcon className="h-8 w-8 text-slate-300" />
        )}
        <span className="text-[10px] text-slate-500">
          {isProcessing
            ? "Recuperando fotos del portal..."
            : fotos.length > 0
              ? `${fotos.length} fotos (no disponibles)`
              : "Sin fotos"}
        </span>
      </div>
    );
  }

  const safeIdx = idx % visibleFotos.length;
  const currentOriginalUrl = visibleFotos[safeIdx];
  const currentDisplayUrl = isCloudinaryImageUrl(currentOriginalUrl)
    ? currentOriginalUrl
    : proxiedStatefoxImageUrl(currentOriginalUrl);

  return (
    <div className="relative w-full h-44 rounded-lg overflow-hidden bg-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentDisplayUrl}
        alt={`${alt} - foto ${safeIdx + 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          setFailedUrls((prev) => new Set(prev).add(currentOriginalUrl));
        }}
      />
      {visibleFotos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + visibleFotos.length) % visibleFotos.length); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % visibleFotos.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-1.5 right-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
            {safeIdx + 1}/{visibleFotos.length}
          </div>
        </>
      )}
    </div>
  );
}

// ── Expandable comparable detail card ────────────────────────────────────────

function ComparableDetailCard({
  c,
  input,
  liveCachedUrls,
  isProcessing,
}: {
  c: PricingComparable;
  input: PricingAnalysisResult["input"];
  liveCachedUrls?: string[];
  isProcessing?: boolean;
}) {
  const diff = pctDiff(c.precioM2, input.precioM2);
  const isLower = c.precioM2 < input.precioM2;

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* Left: photo */}
        <div className="lg:border-r border-slate-200">
          <ComparablePhotoCarousel
            fotos={c.fotos ?? []}
            liveCachedUrls={liveCachedUrls}
            isProcessing={isProcessing}
            alt={c.zona || c.ciudad}
          />
        </div>

        {/* Right: info */}
        <div className="p-4 space-y-3">
          {/* Metrics bar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded bg-slate-50 border border-slate-200/60">
              <p className="text-[9px] text-slate-500 uppercase font-medium">Precio</p>
              <p className="text-xs font-mono font-bold text-foreground">{formatEur(c.precio)} €</p>
            </div>
            <div className="text-center p-2 rounded bg-slate-50 border border-slate-200/60">
              <p className="text-[9px] text-slate-500 uppercase font-medium">€/m²</p>
              <p className="text-xs font-mono font-bold text-foreground">{formatEur(c.precioM2)}</p>
            </div>
            <div className="text-center p-2 rounded bg-slate-50 border border-slate-200/60">
              <p className="text-[9px] text-slate-500 uppercase font-medium">vs URUS</p>
              <p className={`text-xs font-mono font-bold ${isLower ? "text-status-success" : "text-status-danger"}`}>
                {diff}
              </p>
            </div>
          </div>

          {/* Description */}
          {c.descripcion && (
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
              {c.descripcion}
            </p>
          )}

          {/* Property details */}
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-500">
            <span>{c.metrosConstruidos} m²</span>
            <span>·</span>
            <span>{c.habitaciones} hab</span>
            <span>·</span>
            <span>{c.banyos} baños</span>
            {c.planta && <><span>·</span><span>Planta {c.planta}</span></>}
            {c.orientacion && <><span>·</span><span>{c.orientacion}</span></>}
            {c.diasPublicado != null && <><span>·</span><span>{c.diasPublicado}d publicado</span></>}
          </div>

          {/* Address */}
          {c.direccion && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-[10px] text-slate-500">{c.direccion}</span>
            </div>
          )}

          {/* Advertiser / Agency + phones */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] font-medium text-foreground">
                  {c.anunciante?.nombre ?? (c.advertiserType === "private" ? "Particular" : "Profesional")}
                </p>
                <Badge variant="outline" className="text-[8px] mt-0.5 bg-white border-slate-200">
                  {c.advertiserType === "private" ? "Particular" : c.advertiserType === "professional" ? "Profesional" : "—"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {c.anunciante?.telefonos?.map((tel) => (
                <a
                  key={tel}
                  href={`tel:${tel}`}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="h-3 w-3" />
                  <span className="font-mono">{tel}</span>
                </a>
              ))}
            </div>
          </div>

          {/* External link + reference */}
          <div className="flex items-center justify-between text-[10px]">
            {c.referencia && (
              <span className="text-slate-500 font-mono">Ref: {c.referencia}</span>
            )}
            {c.link && (
              <a
                href={c.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                Ver anuncio <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Comparable table row + inline expansion ───────────────────────────────────

function ComparableRow({
  c,
  input,
  diff,
  isLower,
  isExpanded,
  onToggle,
  liveCachedUrls,
  isProcessing,
}: {
  c: PricingComparable;
  input: PricingAnalysisResult["input"];
  diff: string;
  isLower: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  liveCachedUrls?: string[];
  isProcessing?: boolean;
}) {
  return (
    <>
      <tr
        className={`hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? "bg-slate-50" : ""}`}
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-xs text-foreground">
          <div className="flex items-center gap-1">
            {isExpanded ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
            {c.zona || c.ciudad}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right text-xs font-mono text-foreground">{formatEur(c.precio)} €</td>
        <td className="px-4 py-2.5 text-right text-xs font-mono text-foreground">{formatEur(c.precioM2)} €</td>
        <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-600">{c.metrosConstruidos}</td>
        <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-600">{c.habitaciones}</td>
        <td className="px-4 py-2.5 text-center">
          <Badge variant="outline" className="text-[8px] bg-white border-slate-200">
            {c.advertiserType === "private" ? "Particular" : c.advertiserType === "professional" ? "Profesional" : "—"}
          </Badge>
        </td>
        <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-600">{c.diasPublicado != null ? `${c.diasPublicado}d` : "—"}</td>
        <td className="px-4 py-2.5 text-center">
          <span className={`text-xs font-mono font-bold ${isLower ? "text-status-success" : "text-status-danger"}`}>
            {diff}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center">
          {c.link ? (
            <a
              href={c.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5 mx-auto" />
            </a>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="p-4 bg-slate-50/50 animate-in fade-in slide-in-from-top-2 duration-200">
              <ComparableDetailCard
                c={c}
                input={input}
                liveCachedUrls={liveCachedUrls}
                isProcessing={isProcessing}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Section F: Tabla de comparables ───────────────────────────────────────────

function SectionComparables({ data }: { data: PricingAnalysisResult }) {
  const { input, comparables } = data;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pendingIds = comparables
    .filter((c) => !c.statefoxId.startsWith("market:"))
    .filter((c) => c.imageCacheStatus !== "IMPORTED" && Boolean(c.statefoxId))
    .map((c) => c.statefoxId);
  const { items: imageStatusByid } = useStatefoxImageCachePolling({
    ids: pendingIds,
    enabled: pendingIds.length > 0,
  });

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">Comparables de Mercado</CardTitle>
          </div>
          <p className="text-[10px] text-slate-500">{comparables.length} propiedades similares · Click para expandir ficha</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Zona</th>
                <th className="text-right px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Precio</th>
                <th className="text-right px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">€/m²</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">m²</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Hab</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Tipo</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Días publ.</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">vs URUS</th>
                <th className="text-center px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* URUS row */}
              <tr className="bg-primary/5 border-l-2 border-primary">
                <td className="px-4 py-2.5">
                  <span className="text-xs font-semibold text-primary">▸ {input.zona || input.ciudad}</span>
                  <Badge className="ml-2 text-[8px] px-1.5 bg-primary/10 text-primary border-primary/30">
                    URUS
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-mono font-bold text-foreground">{formatEur(input.precio)} €</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono text-foreground">{formatEur(input.precioM2)} €</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-600">{input.metrosConstruidos}</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-600">{input.habitaciones}</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-400">—</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-400">—</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-400">—</td>
                <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-400">—</td>
              </tr>
              {comparables.map((c) => {
                const diff = pctDiff(c.precioM2, input.precioM2);
                const isLower = c.precioM2 < input.precioM2;
                const isExpanded = expandedId === c.statefoxId;
                const isMarketComparable = c.statefoxId.startsWith("market:");
                const liveStatus = isMarketComparable ? undefined : imageStatusByid.get(c.statefoxId);
                const liveCachedUrls = liveStatus?.cachedUrls;
                const isProcessing =
                  !isMarketComparable &&
                  c.imageCacheStatus !== "IMPORTED" &&
                  (!liveStatus || (liveStatus.status !== "IMPORTED" && liveStatus.cachedUrls.length === 0));
                return (
                  <ComparableRow
                    key={c.statefoxId}
                    c={c}
                    input={input}
                    diff={diff}
                    isLower={isLower}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : c.statefoxId)}
                    liveCachedUrls={liveCachedUrls}
                    isProcessing={isProcessing}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Mapa de comparables (Google Maps Static API, limpio) ─────────────────────

function SectionMapaComparables({ data }: { data: PricingAnalysisResult }) {
  const { input, comparables } = data;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  const geoComparables = comparables.filter((c) => c.latitud && c.longitud);
  if (geoComparables.length === 0) return null;

  const hasOwnPoint = input.latitud != null && input.longitud != null;
  const center = hasOwnPoint
    ? { lat: input.latitud as number, lng: input.longitud as number }
    : {
        lat: geoComparables.reduce((s, c) => s + (c.latitud ?? 0), 0) / geoComparables.length,
        lng: geoComparables.reduce((s, c) => s + (c.longitud ?? 0), 0) / geoComparables.length,
      };

  const markers = geoComparables
    .map((c) => `color:0x3B82F6%7Csize:small%7C${c.latitud},${c.longitud}`)
    .join("&markers=");

  const mapStyles = [
    "style=feature:poi%7Cvisibility:off",
    "style=feature:transit%7Cvisibility:off",
    "style=feature:road%7Celement:labels.icon%7Cvisibility:off",
    "style=feature:road.highway%7Celement:labels%7Cvisibility:off",
    "style=feature:road.arterial%7Celement:labels%7Cvisibility:simplified",
    "style=feature:administrative.land_parcel%7Cvisibility:off",
    "style=feature:administrative.neighborhood%7Celement:labels%7Cvisibility:on",
    "style=feature:landscape.man_made%7Celement:labels%7Cvisibility:off",
  ].join("&");

  const src = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=15&size=800x300&scale=2&maptype=roadmap&markers=color:red%7Clabel:U%7C${center.lat},${center.lng}&markers=${markers}&${mapStyles}&key=${apiKey}`
    : "";

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-500 rounded-lg border border-dashed border-slate-300 bg-slate-50">
        <MapPin className="h-8 w-8 text-slate-300" />
        <span className="text-sm font-medium text-foreground">{input.zona || input.ciudad}</span>
        <span className="text-[10px] text-slate-400">
          Configura NEXT_PUBLIC_GOOGLE_MAPS_KEY para ver el mapa
        </span>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Mapa de comparables en ${input.ciudad}`}
        className="w-full h-auto object-cover"
        loading="lazy"
      />
      <div className="absolute bottom-2 left-2 flex items-center gap-3 bg-black/70 rounded-md px-2.5 py-1.5 text-[10px] text-white">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Tu inmueble
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Comparables ({geoComparables.length})
        </span>
      </div>
    </div>
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
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-status-success" />
          <CardTitle className="text-sm font-semibold text-foreground">Comparación de Extras</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Extra</th>
                <th className="text-center px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium">URUS</th>
                {top5.map((c, i) => (
                  <th key={c.statefoxId} className="text-center px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                    #{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXTRAS_KEYS.map(({ key, label }) => (
                <tr key={key} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 text-xs font-medium text-foreground">{label}</td>
                  <td className="px-3 py-2 text-center">
                    {(input.extras as unknown as Record<string, unknown>)[key] ? (
                      <Check className="h-4 w-4 text-status-success mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 mx-auto" />
                    )}
                  </td>
                  {top5.map((c) => (
                    <td key={c.statefoxId} className="px-3 py-2 text-center">
                      {(c.extras as unknown as Record<string, unknown>)?.[key] ? (
                        <Check className="h-3.5 w-3.5 text-status-success/60 mx-auto" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-300 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Extras string: calefaccion, año, certificado */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap gap-3 text-[10px] text-slate-500">
          {input.extras.calefaccion && <span>Calefacción: <strong className="text-foreground">{input.extras.calefaccion}</strong></span>}
          {input.extras.anoConstruccion && <span>Año: <strong className="text-foreground">{input.extras.anoConstruccion}</strong></span>}
          {input.extras.certificadoEnergetico && <span>Cert. energético: <strong className="text-foreground">{input.extras.certificadoEnergetico}</strong></span>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionOptimalPricing({ data }: { data: PricingAnalysisResult }) {
  if (!data.optimalPricing) return null;
  const optimal = data.optimalPricing;
  const ownPrice = data.input.precio;
  const ownInside =
    ownPrice >= optimal.baremoBajoPrice && ownPrice <= optimal.baremoAltoPrice;

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground">Precio óptimo (baremos)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MiniStat label="Mínimo" value={`${formatEur(optimal.minPrice)} €`} />
          <MiniStat label="P25 (bajo)" value={`${formatEur(optimal.p25Price)} €`} />
          <MiniStat label="P50 (media)" value={`${formatEur(optimal.p50Price)} €`} />
          <MiniStat label="P75 (alto)" value={`${formatEur(optimal.p75Price)} €`} />
          <MiniStat label="Máximo" value={`${formatEur(optimal.maxPrice)} €`} />
        </div>
        <div className="rounded-lg border border-slate-200/60 p-3 bg-slate-50">
          <p className="text-xs text-slate-600">
            Rango recomendado:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatEur(optimal.recommendedMinPrice)} € - {formatEur(optimal.recommendedMaxPrice)} €
            </span>
          </p>
          <p className="text-[11px] mt-1 text-slate-500">
            Posición actual:{" "}
            <span className={ownInside ? "text-status-success font-medium" : "text-status-danger font-medium"}>
              {ownInside ? "dentro de baremo" : "fuera de baremo"}
            </span>{" "}
            ({optimal.pricingPosition})
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Base estadística: {optimal.comparablesUsed} comparables filtrados por comparabilidad de zona/tipología.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionZoneStudy({ data }: { data: PricingAnalysisResult }) {
  if (!data.zoneStudy) return null;
  const study = data.zoneStudy;
  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground">Estudio de zona</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat
            label="Densidad"
            value={
              study.demographicsSummary.densityPerKm2 != null
                ? `${Math.round(study.demographicsSummary.densityPerKm2).toLocaleString("es-ES")} hab/km²`
                : "N/D"
            }
          />
          <MiniStat label="Bucket" value={study.demographicsSummary.densityBucket} />
          <MiniStat
            label="Transporte"
            value={`${study.transportSummary.totalStops}`}
          />
          <MiniStat
            label="Colegios"
            value={`${study.schoolsSummary.totalSchools}`}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200/60 p-3 bg-slate-50">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Demora estilo Google Maps (P50)</p>
            <div className="mt-2 space-y-1.5">
              {study.travelTimeSummary.byMode.map((mode) => (
                <div key={mode.mode} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{mode.mode}</span>
                  <span className="font-mono font-medium text-foreground">
                    {mode.minutesP50 != null ? `${mode.minutesP50.toFixed(1)} min` : "N/D"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200/60 p-3 bg-slate-50">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Entorno colegios (top)</p>
            <div className="mt-2 space-y-1">
              {study.schoolsSummary.topSchools.slice(0, 3).map((school) => (
                <div key={`${school.name}-${school.lat}-${school.lng}`} className="text-xs text-slate-500">
                  {school.name}
                  {typeof school.rating === "number" && (
                    <span className="font-mono text-foreground"> · {school.rating.toFixed(1)}</span>
                  )}
                </div>
              ))}
              {study.schoolsSummary.topSchools.length === 0 && (
                <p className="text-xs text-slate-500">Sin colegios indexados para la zona.</p>
              )}
            </div>
          </div>
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
    <Card className="border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-slate-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Metadata del análisis</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetaItem label="Analizado" value={new Date(analyzedAt).toLocaleString("es-ES")} />
            <MetaItem label="Endpoint" value={queryMeta.endpoint} />
            <MetaItem
              label="Housing"
              value={formatStatefoxHousingLabel(queryMeta.housing) || queryMeta.housing}
            />
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
    <div className="rounded-lg p-2 bg-slate-50 border border-slate-200/60">
      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-xs font-mono font-medium text-foreground mt-0.5">{value}</p>
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
  const { suppressOverlay } = useGlobalLoader();

  useEffect(() => {
    if (state.kind !== "processing") return;
    const releaseSuppression = suppressOverlay("pricing-analysis-processing-card");
    return releaseSuppression;
  }, [state.kind, suppressOverlay]);

  const isMock = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");

  const loadReport = useCallback(async () => {
    if (isMock) {
      setState({ kind: "success", data: { ...pricingFixture, propertyCode: code } });
      return;
    }

    setState({ kind: "loading" });
    try {
      const statusRes = await fetch(`/api/pricing/status/${code}`);
      if (statusRes.ok) {
        const statusBody = await statusRes.json();
        if (statusBody.status === "processing") {
          setState({
            kind: "processing",
            propertyCode: code,
            message: "El análisis se está ejecutando en segundo plano.",
          });
          return;
        }
        if (statusBody.status === "failed") {
          setState({
            kind: "error",
            status: 500,
            message:
              statusBody.message ??
              "No se pudo completar el análisis anterior. Intenta generarlo de nuevo.",
            action: "analyze",
            actionLabel: "Volver a intentar análisis",
          });
          return;
        }
      }

      const res = await fetch(`/api/pricing/report/${code}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          status: res.status,
          message: body.message ?? body.error ?? `Error ${res.status}`,
          missingFields: body.missingFields,
          action: res.status === 404 ? "analyze" : "load",
          actionLabel:
            res.status === 404
              ? "Iniciar análisis en segundo plano"
              : "Reintentar carga",
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

    setState({ kind: "processing", propertyCode: code });
    try {
      const res = await fetch("/api/pricing/analyze/async", {
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
      setState({
        kind: "processing",
        propertyCode: code,
        message: "El análisis se está ejecutando en segundo plano.",
      });
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

  useEffect(() => {
    if (state.kind !== "processing" || isMock) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pricing/status/${code}`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (body.status === "completed") {
          await loadReport();
        }
        if (body.status === "idle") {
          setState({
            kind: "error",
            status: 404,
            message:
              "El análisis no está en ejecución en este momento. Puedes iniciarlo nuevamente.",
            action: "analyze",
            actionLabel: "Iniciar análisis en segundo plano",
          });
        }
        if (body.status === "failed") {
          setState({
            kind: "error",
            status: 500,
            message:
              body.message ??
              "El análisis terminó con error. Puedes volver a intentarlo.",
            action: "analyze",
            actionLabel: "Reintentar análisis",
          });
        }
      } catch {
        // Ignoramos fallos transitorios de red y seguimos el polling.
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 4000);

    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [state.kind, code, loadReport, isMock]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-6">
        <Link href="/platform/pricing" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-3 w-3" /> Volver a Cartera interna
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-slate-500">Analizando inmueble <span className="font-mono font-bold text-foreground">{code}</span> contra el mercado...</p>
        </div>
        <InformeSkeleton />
      </div>
    );
  }

  if (state.kind === "processing") {
    return (
      <div className="-m-6 flex h-[calc(100vh-5rem)] flex-col relative">
        <div className="absolute left-8 top-8 z-20">
          <Link
            href="/platform/pricing"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Volver a Cartera interna
          </Link>
        </div>
        <AnalysisProcessingCard propertyCode={state.propertyCode} />
        {state.message && (
          <div className="absolute bottom-8 left-0 right-0 z-20 text-center">
            <p className="text-sm text-slate-500">{state.message}</p>
          </div>
        )}
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

  return <InformeContent data={data} onRefresh={runAnalysis} />;
}

// ── Tab system ───────────────────────────────────────────────────────────────

type TabId = "recomendacion" | "mercado" | "analisis";

const TABS: { id: TabId; label: string; icon: typeof BrainCircuit }[] = [
  { id: "recomendacion", label: "Recomendación", icon: BrainCircuit },
  { id: "mercado", label: "Mercado", icon: Home },
  { id: "analisis", label: "Análisis", icon: BarChart3 },
];

function InformeContent({ data, onRefresh }: { data: PricingAnalysisResult; onRefresh: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>("recomendacion");

  return (
    <div className="space-y-5">
      {/* Nav bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/platform/pricing" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-3 w-3" /> Volver a Cartera interna
        </Link>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Actualizar análisis
        </button>
      </div>

      {/* Header — always visible */}
      <SectionHeader data={data} />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/60">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "bg-white shadow-sm text-foreground border border-slate-200/60"
                  : "text-slate-500 hover:text-foreground hover:bg-slate-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — all tabs stay mounted to avoid re-fetching the map */}
      <div className={activeTab === "recomendacion" ? "space-y-5" : "hidden"}>
        <TabRecomendacion data={data} />
      </div>
      <div className={activeTab === "mercado" ? "space-y-5" : "hidden"}>
        <TabMercado data={data} />
      </div>
      <div className={activeTab === "analisis" ? "space-y-5" : "hidden"}>
        <TabAnalisis data={data} />
      </div>

      {/* Metadata — always at bottom, collapsed */}
      <SectionMetadata data={data} />
    </div>
  );
}

// ── Tab: Recomendación ────────────────────────────────────────────────────────

function TabRecomendacion({ data }: { data: PricingAnalysisResult }) {
  return (
    <div className="space-y-5">
      <SectionDiagnostico
        recommendation={data.recommendation}
        recommendationError={data.recommendationError}
        stats={data.stats}
      />

      {data.recommendation && (
        <>
          <SectionRecomendaciones recommendation={data.recommendation} input={data.input} />
          <SectionArgumentosRiesgos recommendation={data.recommendation} />
        </>
      )}
    </div>
  );
}

// ── Tab: Mercado ──────────────────────────────────────────────────────────────

function TabMercado({ data }: { data: PricingAnalysisResult }) {
  const hasGeo = data.comparables.some((c) => c.latitud && c.longitud);

  return (
    <div className="space-y-5">
      {/* Map + table side by side on large screens */}
      {hasGeo && (
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">Mapa de Comparables</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <SectionMapaComparables data={data} />
          </CardContent>
        </Card>
      )}

      {data.comparables.length > 0 && <SectionComparables data={data} />}

      <SectionExtras data={data} />
    </div>
  );
}

// ── Tab: Análisis ─────────────────────────────────────────────────────────────

function TabAnalisis({ data }: { data: PricingAnalysisResult }) {
  const marketStudyUi = isPricingMarketStudyUiEnabled();
  return (
    <div className="space-y-5">
      {marketStudyUi && <SectionOptimalPricing data={data} />}
      <SectionComparacionPrecios data={data} />
      {marketStudyUi && <SectionZoneStudy data={data} />}
      <SectionTemporalTrend trend={data.trend} />
    </div>
  );
}
