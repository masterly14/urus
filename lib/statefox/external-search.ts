const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const EXTERNAL_PORTFOLIO_DISABLED_REASON =
  "Busqueda en cartera externa desactivada temporalmente por incidencia de Statefox.";

export function isExternalPortfolioSearchEnabled(): boolean {
  const raw = process.env.ENABLE_EXTERNAL_PORTFOLIO_SEARCH;
  if (!raw) return false;
  return ENABLED_VALUES.has(raw.trim().toLowerCase());
}
