import type {
  PricingAnalysisResult,
  PricingComparable,
  PricingListingMomentum,
  PricingMarketTempo,
  PricingTrendPressure,
  PricingTrendSummary,
} from "./types";

const FRESH_COMPARABLE_DAYS = 14;
const STALE_COMPARABLE_DAYS = 45;
const NEW_LISTING_DAYS = 21;
const STALE_LISTING_DAYS = 60;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function ratio(count: number, total: number): number | null {
  if (total === 0) return null;
  return round(count / total);
}

function parseDateString(value: string | null | undefined): Date | null {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
  const dayFirstDate = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

  const isoMatch = normalized.match(isoDate);
  if (isoMatch) {
    return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
  }

  const dayFirstMatch = normalized.match(dayFirstDate);
  if (dayFirstMatch) {
    return new Date(`${dayFirstMatch[3]}-${dayFirstMatch[2]}-${dayFirstMatch[1]}T00:00:00Z`);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffInDays(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function inferMarketTempo(comparableDays: number[]): PricingMarketTempo {
  const avgDays = average(comparableDays);
  if (avgDays == null) return "sin_datos";
  if (avgDays <= FRESH_COMPARABLE_DAYS) return "caliente";
  if (avgDays <= 30) return "estable";
  return "lento";
}

function inferListingMomentum(propertyAgeDays: number | null): PricingListingMomentum {
  if (propertyAgeDays == null) return "sin_datos";
  if (propertyAgeDays <= NEW_LISTING_DAYS) return "nuevo";
  if (propertyAgeDays <= STALE_LISTING_DAYS) return "maduro";
  return "estancado";
}

function inferPressure(params: {
  gapPorcentaje: number;
  marketTempo: PricingMarketTempo;
  listingMomentum: PricingListingMomentum;
  hasComparables: boolean;
}): PricingTrendPressure {
  if (!params.hasComparables) return "sin_datos";

  let score = 0;

  if (params.gapPorcentaje > 12) {
    score += 3;
  } else if (params.gapPorcentaje > 5) {
    score += 2;
  } else if (params.gapPorcentaje > 0) {
    score += 1;
  }

  if (params.listingMomentum === "estancado") {
    score += 2;
  } else if (params.listingMomentum === "maduro") {
    score += 1;
  }

  if (params.marketTempo === "caliente" && params.gapPorcentaje > 0) {
    score += 1;
  }

  if (score >= 4) return "alta";
  if (score >= 2) return "media";
  return "baja";
}

function formatRatio(value: number | null): string {
  if (value == null) return "N/D";
  return `${Math.round(value * 100)}%`;
}

function buildSummary(
  trend: Omit<PricingTrendSummary, "summary">,
): string {
  const snippets: string[] = [];

  if (trend.propertyAgeDays != null) {
    snippets.push(`el inmueble lleva ${trend.propertyAgeDays} días en cartera`);
  }

  if (trend.lastUpdatedDays != null) {
    snippets.push(`la ficha se actualizó hace ${trend.lastUpdatedDays} días`);
  }

  if (trend.comparableAverageDaysPublished != null) {
    snippets.push(
      `el mercado va ${trend.marketTempo} (media ${trend.comparableAverageDaysPublished} días publicados en comparables)`,
    );
  }

  if (trend.freshComparablesShare != null || trend.staleComparablesShare != null) {
    snippets.push(
      `${formatRatio(trend.freshComparablesShare)} de comparables son recientes y ${formatRatio(trend.staleComparablesShare)} llevan mucho tiempo publicados`,
    );
  }

  snippets.push(`la presión temporal actual es ${trend.pressure}`);

  return snippets.length > 0
    ? `${snippets[0].charAt(0).toUpperCase()}${snippets[0].slice(1)}; ${snippets.slice(1).join(". ")}.`
    : "Sin señales temporales suficientes para estimar una tendencia.";
}

export function buildPricingTrendSummary(
  analysis: Pick<PricingAnalysisResult, "input" | "comparables" | "stats">,
  now = new Date(),
): PricingTrendSummary {
  const comparableDays = analysis.comparables
    .map((comparable: PricingComparable) => comparable.diasPublicado)
    .filter((days): days is number => typeof days === "number" && days >= 0);

  const propertyAgeDays = diffInDays(parseDateString(analysis.input.fechaAlta), now);
  const lastUpdatedDays = diffInDays(parseDateString(analysis.input.fechaActualizacion), now);
  const comparableAverageDaysPublished = average(comparableDays);
  const comparableMedianDaysPublished = median(comparableDays);
  const freshComparablesShare = ratio(
    comparableDays.filter((days) => days <= FRESH_COMPARABLE_DAYS).length,
    comparableDays.length,
  );
  const staleComparablesShare = ratio(
    comparableDays.filter((days) => days >= STALE_COMPARABLE_DAYS).length,
    comparableDays.length,
  );
  const marketTempo = inferMarketTempo(comparableDays);
  const listingMomentum = inferListingMomentum(propertyAgeDays);
  const pressure = inferPressure({
    gapPorcentaje: analysis.stats.gapPorcentaje,
    marketTempo,
    listingMomentum,
    hasComparables: analysis.comparables.length > 0,
  });

  const trendWithoutSummary: Omit<PricingTrendSummary, "summary"> = {
    propertyAgeDays,
    lastUpdatedDays,
    comparableAverageDaysPublished,
    comparableMedianDaysPublished,
    freshComparablesShare,
    staleComparablesShare,
    marketTempo,
    listingMomentum,
    pressure,
  };

  return {
    ...trendWithoutSummary,
    summary: buildSummary(trendWithoutSummary),
  };
}
