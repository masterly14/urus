/**
 * Construcción de URLs absolutas para las fotos de una propiedad en Inmovilla.
 *
 * El GET REST v1 `GET /propiedades/?cod_ofer=` no devuelve URLs de fotos
 * listas para usar: devuelve los parámetros necesarios para construirlas
 * (`numagencia`, `fotoletra`, `numfotos`). El GET paginacion legacy (API
 * sesión/cookies) sí devuelve `lafoto` directamente, pero aquí usamos
 * REST para todo.
 *
 * Patrón verificado contra producción (agencia 11636, cod_ofer 26178808):
 *   - https://fotos15.apinmo.com/11636/26178808/2-1.jpg       → full size (~140 KB)
 *   - https://fotos15.apinmo.com/11636/26178808/2-1s.jpg      → thumbnail (~23 KB)
 *
 * Ambos dominios (`fotos15.apinmo.com` y `fotos15.inmovilla.com`) devuelven
 * el mismo contenido. Usamos `apinmo.com` porque coincide con el formato de
 * `lafoto` que devuelve la API legacy y es el que viene en producción.
 */

/** Tamaño de la foto a servir. `s` = thumbnail (~23 KB), `full` = original. */
export type InmovillaPhotoSize = "s" | "full";

const DEFAULT_HOST = "fotos15.apinmo.com";

export type BuildPhotoUrlInput = {
  numagencia?: string | number | null;
  codOfer: string | number;
  fotoletra?: string | number | null;
  /** Índice de la foto (1-based). Default 1 (foto principal). */
  index?: number;
  /** Default `s` (thumbnail, ideal para tarjetas/miniaturas). */
  size?: InmovillaPhotoSize;
  /** Host override, por si Inmovilla cambia de dominio. */
  host?: string;
};

/**
 * Construye la URL de una foto; devuelve `null` si falta algún dato requerido.
 * Safe to call con payloads parciales — el caller decide qué hacer con `null`.
 */
export function buildInmovillaPhotoUrl(input: BuildPhotoUrlInput): string | null {
  const numagencia = input.numagencia != null ? String(input.numagencia).trim() : "";
  const fotoletra = input.fotoletra != null ? String(input.fotoletra).trim() : "";
  const codOfer = input.codOfer != null ? String(input.codOfer).trim() : "";
  const index = Number.isFinite(input.index) && (input.index as number) > 0 ? (input.index as number) : 1;
  const size: InmovillaPhotoSize = input.size ?? "s";
  const host = (input.host ?? DEFAULT_HOST).replace(/\/$/, "");

  if (!numagencia || !codOfer || !fotoletra) return null;

  const suffix = size === "s" ? "s" : "";
  return `https://${host}/${numagencia}/${codOfer}/${fotoletra}-${index}${suffix}.jpg`;
}

/**
 * Extrae los parámetros necesarios desde el payload crudo de una propiedad
 * REST (`PropiedadCompleta`) y construye la URL de la foto principal (index=1,
 * thumbnail). Devuelve `null` si la propiedad no tiene foto o si falta algún
 * parámetro.
 */
export function buildMainPhotoUrlFromRaw(
  raw: Record<string, unknown>,
  options?: { size?: InmovillaPhotoSize; host?: string },
): string | null {
  const numfotos = Number(raw.numfotos ?? 0);
  if (!Number.isFinite(numfotos) || numfotos <= 0) return null;

  return buildInmovillaPhotoUrl({
    numagencia: raw.numagencia as string | number | undefined,
    fotoletra: raw.fotoletra as string | number | undefined,
    codOfer: (raw.cod_ofer as string | number | undefined) ?? "",
    index: 1,
    size: options?.size ?? "s",
    host: options?.host,
  });
}

/**
 * Construye URLs de galería (tamaño completo) para todas las fotos disponibles
 * según `numfotos` en el payload REST de Inmovilla.
 */
export function buildInmovillaPhotoUrlsFromRaw(
  raw: Record<string, unknown>,
  options?: { size?: InmovillaPhotoSize; host?: string; maxPhotos?: number },
): string[] {
  const numfotos = Number(raw.numfotos ?? 0);
  if (!Number.isFinite(numfotos) || numfotos <= 0) return [];

  const maxPhotos = Math.min(
    Math.max(1, options?.maxPhotos ?? 30),
    Math.floor(numfotos),
  );
  const codOfer = (raw.cod_ofer as string | number | undefined) ?? "";
  const base = {
    numagencia: raw.numagencia as string | number | undefined,
    fotoletra: raw.fotoletra as string | number | undefined,
    codOfer,
    size: options?.size ?? "full",
    host: options?.host,
  };

  const urls: string[] = [];
  for (let index = 1; index <= maxPhotos; index += 1) {
    const url = buildInmovillaPhotoUrl({ ...base, index });
    if (url) urls.push(url);
  }
  return urls;
}
