import { getCloudinary } from "./client";

function mimeTypeForContractFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

function formatFallbackFromFileName(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return m?.[1]?.toLowerCase() ?? "bin";
}

export interface UploadDocumentOptions {
  /** Buffer del archivo a subir. */
  buffer: Buffer;
  /** Nombre del archivo con extensión (ej. "Contrato_Arras_m8-v1.docx"). */
  fileName: string;
  /** Carpeta destino en Cloudinary (ej. "contracts/OP-2026-001"). */
  folder: string;
  /** Tags de clasificación para búsqueda y organización. */
  tags?: string[];
  /** Metadatos libres que Cloudinary almacena junto al recurso. */
  context?: Record<string, string>;
}

export interface UploadDocumentResult {
  publicId: string;
  secureUrl: string;
  url: string;
  bytes: number;
  format: string;
  resourceType: string;
  createdAt: string;
}

/**
 * Sube un documento (DOCX, PDF, etc.) a Cloudinary como `resource_type: "raw"`.
 * Genera el Buffer en memoria y no depende de filesystem (serverless-safe).
 */
export async function uploadContractDocument(
  options: UploadDocumentOptions,
): Promise<UploadDocumentResult> {
  const { buffer, fileName, folder, tags = [], context } = options;
  const cloudinary = getCloudinary();

  const safeFileName = fileName.trim();

  const contextStr = context
    ? Object.entries(context)
        .map(([k, v]) => `${k}=${v}`)
        .join("|")
    : undefined;

  const mime = mimeTypeForContractFileName(safeFileName);
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "raw",
    folder,
    // Mantener extension en public_id evita descargas sin ".docx".
    public_id: safeFileName,
    filename_override: safeFileName,
    tags: ["contract", ...tags],
    context: contextStr,
    overwrite: true,
    invalidate: true,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    url: result.url,
    bytes: result.bytes,
    format: result.format ?? formatFallbackFromFileName(safeFileName),
    resourceType: result.resource_type,
    createdAt: result.created_at,
  };
}
