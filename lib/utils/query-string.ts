/**
 * Construcción de query strings para clientes HTTP.
 */

export type QueryParamValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryParamValue>;

/**
 * Construye un query string a partir de un objeto de parámetros.
 * - `true` se convierte en clave sin valor (ej. `?listado`)
 * - `false`, `undefined` y `null` se omiten
 * - Otros valores se convierten a string
 * @returns Query string con `?` inicial, o string vacío si no hay parámetros válidos.
 */
export function buildQueryString(params: QueryParams): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (value === true) {
      searchParams.set(key, "");
    } else {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}
