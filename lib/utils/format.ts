/**
 * Funciones de formateo compartidas para UI.
 * Usadas por todos los dashboards (CEO, Comercial, Rendimiento).
 */

export function formatEur(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K €`;
  return `${Math.round(value).toLocaleString("es-ES")} €`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatNum(value: number): string {
  return Math.round(value).toLocaleString("es-ES");
}
