/**
 * Helper de subida de adjuntos del panel lateral de operaciones a Cloudinary.
 * A diferencia de `uploadContractDocument`, soporta `resource_type=image`
 * para previsualización directa de jpg/png/webp.
 */

import { getCloudinary } from "@/lib/cloudinary/client";
import {
  resourceTypeForExtension,
  mimeTypeForExtension,
  type AdjuntoExtension,
} from "./constants";

export interface UploadAdjuntoOptions {
  buffer: Buffer;
  fileName: string;
  extension: AdjuntoExtension;
  folder: string;
  tags?: string[];
  context?: Record<string, string>;
}

export interface UploadAdjuntoResult {
  publicId: string;
  secureUrl: string;
  bytes: number;
  resourceType: string;
  format: string;
  mimeType: string;
  createdAt: string;
}

export async function uploadAdjunto(
  options: UploadAdjuntoOptions,
): Promise<UploadAdjuntoResult> {
  const { buffer, fileName, extension, folder, tags = [], context } = options;
  const cloudinary = getCloudinary();

  const mime = mimeTypeForExtension(extension);
  const resourceType = resourceTypeForExtension(extension);
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

  const contextStr = context
    ? Object.entries(context)
        .map(([k, v]) => `${k}=${v}`)
        .join("|")
    : undefined;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: resourceType,
    folder,
    // Mantener la extensión en el public_id para que la URL permita descarga
    // con el nombre original (en "raw").
    public_id: fileName,
    filename_override: fileName,
    tags: ["operacion-adjunto", ...tags],
    context: contextStr,
    overwrite: false,
    invalidate: true,
    unique_filename: true,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    bytes: result.bytes,
    resourceType: result.resource_type,
    format: result.format ?? extension,
    mimeType: mime,
    createdAt: result.created_at,
  };
}
