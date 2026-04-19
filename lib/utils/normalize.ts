/**
 * Funciones de normalización para valores de API/payload.
 * Uso en proyecciones, snapshots y mapeo de datos.
 */

/**
 * Convierte un valor desconocido a string. Devuelve "" si es null, undefined o vacío.
 */
export function str(v: unknown): string {
  return v != null && v !== "" ? String(v) : "";
}

/**
 * Convierte un valor desconocido a número. Devuelve 0 si no es numérico o es NaN.
 */
export function num(v: unknown): number {
  return Number(v) || 0;
}

/**
 * Convierte un valor desconocido a entero. Devuelve 0 si no es numérico o es NaN.
 */
export function int(v: unknown): number {
  return Math.round(num(v));
}
