/**
 * Paginacion para listados de Idealista.
 *
 * Patron verificado en captura real (06/05/2026):
 *   pagina 1: https://www.idealista.com/venta-viviendas/cordoba-cordoba/
 *             https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/
 *   pagina N: https://www.idealista.com/venta-viviendas/cordoba-cordoba/pagina-N.htm
 *             https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/pagina-N.htm
 *
 * Idealista paginas el filtro/segmento sustituyendo el sufijo de la URL
 * por `pagina-<N>.htm` (mantiene los prefijos de filtros como
 * `con-pisos/`, `con-precio-hasta_300000/`).
 *
 * El cursor que viaja entre app y Worker es el numero de pagina como
 * string. Cursor null/0/1 = primera pagina.
 */

const IDEALISTA_HOST = "https://www.idealista.com";

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
 * Construye la URL de pagina `n` a partir de la URL semilla.
 *
 * Para n <= 1 devuelve la URL tal cual (ya es pagina 1).
 *
 * Para n > 1: si el path ya tiene `/pagina-X.htm` lo sustituye por
 * `/pagina-N.htm`. Si no, lo anade al final del path (preservando trailing
 * slash de los segmentos de filtro como `/con-pisos/`).
 */
export function buildPageUrl(seedUrl: string, n: number): string {
  if (n <= 1) return seedUrl;
  try {
    const url = new URL(seedUrl, IDEALISTA_HOST);
    let pathname = url.pathname;
    if (/\/pagina-\d+\.htm$/.test(pathname)) {
      pathname = pathname.replace(/\/pagina-\d+\.htm$/, `/pagina-${n}.htm`);
    } else {
      if (!pathname.endsWith("/")) pathname += "/";
      pathname += `pagina-${n}.htm`;
    }
    url.pathname = pathname;
    return url.toString();
  } catch {
    return seedUrl;
  }
}
