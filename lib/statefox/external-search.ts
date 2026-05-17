/**
 * Kill switch global de la búsqueda externa para microsite y cobertura.
 *
 * Aunque vive bajo `lib/statefox/` por motivos históricos, hoy controla la
 * búsqueda externa entera (Market in-house — Idealista/Fotocasa/Pisos via
 * Bright Data — con Statefox como fallback cuando MarketListing devuelve 0).
 * Conserva el nombre de env `ENABLE_EXTERNAL_PORTFOLIO_SEARCH` por
 * compatibilidad con producción.
 *
 * TODO: mover este archivo a `lib/market/external-search.ts` cuando se cierre
 * la deprecación de Statefox como motor de búsqueda. Mientras tanto, la
 * función y la constante exportadas mantienen sus nombres.
 */
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const EXTERNAL_PORTFOLIO_DISABLED_REASON =
  "Búsqueda en cartera externa desactivada por configuración (ENABLE_EXTERNAL_PORTFOLIO_SEARCH).";

export function isExternalPortfolioSearchEnabled(): boolean {
  const raw = process.env.ENABLE_EXTERNAL_PORTFOLIO_SEARCH;
  if (!raw) return false;
  return ENABLED_VALUES.has(raw.trim().toLowerCase());
}
