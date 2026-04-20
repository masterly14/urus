/**
 * Constantes y reglas del panel lateral de operaciones (notas / checklist /
 * adjuntos). Valores centralizados para poder ajustarlos sin tocar múltiples
 * rutas.
 */

/** Longitud máxima de una nota interna (varchar en Postgres, chars JS). */
export const NOTA_MAX_LENGTH = 4000;

/** Longitud máxima del texto de un ítem de checklist. */
export const CHECKLIST_ITEM_MAX_LENGTH = 500;

/** Ítems máximos por checklist (hard cap para evitar panels inviables). */
export const CHECKLIST_MAX_ITEMS = 100;

/** Tamaño máximo por adjunto en bytes (15 MB). */
export const ADJUNTO_MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Tamaño máximo total de adjuntos por operación en bytes (100 MB). */
export const ADJUNTO_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

/** Extensiones permitidas (minúsculas, sin punto). */
export const ADJUNTO_ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export type AdjuntoExtension = (typeof ADJUNTO_ALLOWED_EXTENSIONS)[number];

/** Devuelve la extensión en minúsculas sin punto, o null si no hay. */
export function extractExtension(fileName: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function isAllowedExtension(
  ext: string | null,
): ext is AdjuntoExtension {
  if (!ext) return false;
  return (ADJUNTO_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Cloudinary resource_type por extensión. Imágenes → "image" para poder
 * generar transformaciones; documentos (pdf/office) → "raw" para bypassear
 * procesado.
 */
export function resourceTypeForExtension(
  ext: AdjuntoExtension,
): "image" | "raw" {
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp") {
    return "image";
  }
  return "raw";
}

/** Mime-type inferido para el data URI antes de subir a Cloudinary. */
export function mimeTypeForExtension(ext: AdjuntoExtension): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
  }
}
