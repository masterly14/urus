/**
 * Paginación para listados de Pisos.com.
 *
 * Pisos.com usa el segmento `/{N}/` al final de la URL del listado para
 * páginas. Verificado contra portal real (06/05/2026):
 *
 *   https://www.pisos.com/venta/pisos-cordoba_capital/        (página 1)
 *   https://www.pisos.com/venta/pisos-cordoba_capital/2/      (página 2, HTTP 200)
 *   https://www.pisos.com/venta/pisos-cordoba_capital/3/      (página 3, HTTP 200)
 *
 * Esta convención es estable. El `cursor` que viaja entre app y Worker
 * es el número de página como string.
 */

const PISOSCOM_HOST = "https://www.pisos.com";

export function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) return 1;
  const n = Number(cursor);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function nextPageCursor(currentCursor: string | null | undefined): string {
  return String(parseCursor(currentCursor) + 1);
}

/**
 * Construye la URL de página `n` a partir de la URL semilla.
 * Si `n <= 1`, devuelve la URL tal cual. Para `n > 1`, asegura que
 * el path termina con `/{n}/`.
 */
export function buildPageUrl(seedUrl: string, n: number): string {
  if (n <= 1) return seedUrl;
  try {
    const url = new URL(seedUrl, PISOSCOM_HOST);
    // Normalizar trailing slash
    let pathname = url.pathname;
    if (!pathname.endsWith("/")) pathname += "/";
    // Quitar segmento de página existente si lo hubiera (ej. .../12/)
    pathname = pathname.replace(/\/\d+\/$/, "/");
    pathname += `${n}/`;
    url.pathname = pathname;
    return url.toString();
  } catch {
    return seedUrl;
  }
}
