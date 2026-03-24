import { getCloudinary } from "./client";

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

  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");

  const contextStr = context
    ? Object.entries(context)
        .map(([k, v]) => `${k}=${v}`)
        .join("|")
    : undefined;

  const dataUri = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "raw",
    folder,
    public_id: nameWithoutExt,
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
    format: result.format ?? "docx",
    resourceType: result.resource_type,
    createdAt: result.created_at,
  };
}
