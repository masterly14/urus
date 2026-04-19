import type { SemaforoStatus } from "./types";

/**
 * Facturación: ratio real / objetivo.
 * verde > 80%, amarillo > 60%, rojo <= 60%.
 */
export function evaluarSemaforoFacturacion(
  revenueEur: number,
  targetRevenueEur: number,
): SemaforoStatus {
  if (targetRevenueEur <= 0) return "amarillo";
  const ratio = revenueEur / targetRevenueEur;
  if (ratio >= 0.8) return "verde";
  if (ratio >= 0.6) return "amarillo";
  return "rojo";
}

/**
 * Equipo: alertas abiertas relativas al n.º de comerciales + carga media.
 * rojo si > 50% del equipo tiene alerta O carga media > 90% de la máxima (20).
 * amarillo si > 25% del equipo tiene alerta O carga media > 75%.
 */
const CARGA_MAXIMA = 20;

export function evaluarSemaforoEquipo(
  alertasAbiertas: number,
  comercialesActivos: number,
  cargaMedia: number,
): SemaforoStatus {
  if (comercialesActivos === 0) return "amarillo";
  const ratioAlertas = alertasAbiertas / comercialesActivos;
  const ratioCarga = cargaMedia / CARGA_MAXIMA;

  if (ratioAlertas > 0.5 || ratioCarga > 0.9) return "rojo";
  if (ratioAlertas > 0.25 || ratioCarga > 0.75) return "amarillo";
  return "verde";
}

/**
 * Expansión: cash >= 50k, margen medio >= 15%, revenue estable (>= 80% objetivo).
 * verde = 3 criterios, amarillo = 2, rojo < 2.
 */
export function evaluarSemaforoExpansion(
  cashAvailableEur: number,
  avgMarginPerOp: number,
  revenueEur: number,
  targetRevenueEur: number,
): SemaforoStatus {
  let score = 0;
  if (cashAvailableEur >= 50_000) score++;
  if (avgMarginPerOp >= 15) score++;
  if (targetRevenueEur > 0 && revenueEur / targetRevenueEur >= 0.8) score++;

  if (score >= 3) return "verde";
  if (score >= 2) return "amarillo";
  return "rojo";
}

/**
 * Costes: ratio coste operativo / revenue.
 * verde < 60%, amarillo < 80%, rojo >= 80%.
 */
export function evaluarSemaforoCostes(
  operatingCostEur: number,
  revenueEur: number,
): SemaforoStatus {
  if (revenueEur <= 0) return "amarillo";
  const ratio = operatingCostEur / revenueEur;
  if (ratio < 0.6) return "verde";
  if (ratio < 0.8) return "amarillo";
  return "rojo";
}
