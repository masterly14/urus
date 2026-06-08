/**
 * Límites de runtime para RUN_PRICING_ANALYSIS (latencia en consumer/UI).
 */

const DEFAULT_STATEFOX_MAX_PAGES = 12;
const DEFAULT_RAW_BUFFER_MULTIPLIER = 4;
const DEFAULT_MIN_RAW_FLOOR = 15;

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envBoolean(name: string, defaultTrue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultTrue;
  return ["1", "true", "yes", "si", "sí"].includes(raw.trim().toLowerCase());
}

/** Páginas máximas de Statefox /snapshot (250 props/página). Default 12 (antes 30). */
export function getPricingStatefoxMaxPages(sourceTrigger?: string): number {
  const base = envPositiveInt("PRICING_STATEFOX_MAX_PAGES", DEFAULT_STATEFOX_MAX_PAGES);
  if (sourceTrigger === "api_manual_async") {
    return Math.min(base, envPositiveInt("PRICING_MANUAL_MAX_PAGES", 10));
  }
  if (sourceTrigger?.includes("reeval")) {
    return Math.min(base, 5);
  }
  return base;
}

/**
 * Candidatos en bruto antes de dejar de paginar (el filtro de zona reduce el set).
 */
export function getPricingMinRawComparablesBeforeStop(minComparables: number): number {
  const mult = envPositiveInt("PRICING_RAW_COMPARABLES_BUFFER", DEFAULT_RAW_BUFFER_MULTIPLIER);
  const floor = envPositiveInt("PRICING_MIN_RAW_FLOOR", DEFAULT_MIN_RAW_FLOOR);
  return Math.max(minComparables, minComparables * mult, floor);
}

/** No consultar cache ni importar imágenes: pImages de Statefox bastan para pricing. */
export function shouldSkipComparableImageHydrate(): boolean {
  return envBoolean("PRICING_SKIP_COMPARABLE_IMAGE_HYDRATE", true);
}
