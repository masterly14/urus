/**
 * Paginación para listados de Fotocasa.
 *
 * Fotocasa pagina con `?pagina={N}` o segmento `/l/{N}` según la página
 * concreta. Para V1 usamos `?pagina={N}` que es estable y compatible con
 * todas las URLs de listado.
 *
 * El `cursor` que viaja entre la app y el Worker es simplemente el número
 * de página como string. Cursor null/0/1 = primera página.
 */

const FOTOCASA_HOST = "https://www.fotocasa.es";

export function nextPageCursor(currentCursor: string | null | undefined): string {
  const current = parseCursor(currentCursor);
  return String(current + 1);
}

export function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) return 1;
  const n = Number(cursor);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

/**
 * Construye la URL de página `n` a partir de la URL semilla.
 * Si `n <= 1`, devuelve la URL tal cual (Fotocasa interpreta ausencia de
 * `?pagina` como página 1).
 */
export function buildPageUrl(seedUrl: string, n: number): string {
  if (n <= 1) return seedUrl;
  try {
    const url = new URL(seedUrl, FOTOCASA_HOST);
    url.searchParams.set("pagina", String(n));
    return url.toString();
  } catch {
    return seedUrl;
  }
}
