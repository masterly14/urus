import type { OptimalPricingSummary, PricingComparable, PricingPropertyInput } from "./types";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const ratio = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * ratio;
}

function toAbsolutePrice(priceM2: number, meters: number): number {
  return Math.round(priceM2 * meters);
}

function resolvePricingPosition(
  ownPriceM2: number,
  p25: number,
  p50: number,
  p75: number,
): OptimalPricingSummary["pricingPosition"] {
  if (ownPriceM2 < p25) return "por_debajo_baremo_bajo";
  if (ownPriceM2 < p50) return "en_baremo_bajo";
  if (ownPriceM2 <= p75) return "en_media";
  if (ownPriceM2 <= p75 * 1.08) return "en_baremo_alto";
  return "por_encima_baremo_alto";
}

export function buildOptimalPricingSummary(
  input: PricingPropertyInput,
  comparables: PricingComparable[],
): OptimalPricingSummary | undefined {
  const sample = comparables
    .map((item) => item.precioM2)
    .filter((value): value is number => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (sample.length < 3) return undefined;

  const minPriceM2 = sample[0];
  const maxPriceM2 = sample[sample.length - 1];
  const p25PriceM2 = Math.round(percentile(sample, 0.25));
  const p50PriceM2 = Math.round(percentile(sample, 0.5));
  const p75PriceM2 = Math.round(percentile(sample, 0.75));
  const p40PriceM2 = Math.round(percentile(sample, 0.4));
  const p60PriceM2 = Math.round(percentile(sample, 0.6));

  const meters = input.metrosConstruidos > 0 ? input.metrosConstruidos : 1;
  return {
    comparablesUsed: sample.length,
    minPriceM2,
    p25PriceM2,
    p50PriceM2,
    p75PriceM2,
    maxPriceM2,
    minPrice: toAbsolutePrice(minPriceM2, meters),
    p25Price: toAbsolutePrice(p25PriceM2, meters),
    p50Price: toAbsolutePrice(p50PriceM2, meters),
    p75Price: toAbsolutePrice(p75PriceM2, meters),
    maxPrice: toAbsolutePrice(maxPriceM2, meters),
    baremoBajoPriceM2: p25PriceM2,
    baremoAltoPriceM2: p75PriceM2,
    baremoBajoPrice: toAbsolutePrice(p25PriceM2, meters),
    baremoAltoPrice: toAbsolutePrice(p75PriceM2, meters),
    recommendedMinPrice: toAbsolutePrice(p40PriceM2, meters),
    recommendedMaxPrice: toAbsolutePrice(p60PriceM2, meters),
    pricingPosition: resolvePricingPosition(input.precioM2, p25PriceM2, p50PriceM2, p75PriceM2),
  };
}
