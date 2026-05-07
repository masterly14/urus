import { createHash } from "crypto";
import { getCloudinary } from "@/lib/cloudinary";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export type DownloadedPortalImage = {
  url: string;
  buffer: Buffer;
  contentType: string;
  bytes: number;
  sha256: string;
  format?: string;
};

export type UploadedStatefoxImage = {
  publicId: string;
  secureUrl: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
};

function formatFromContentType(contentType: string): string | undefined {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (!normalized?.startsWith("image/")) return undefined;
  const subtype = normalized.replace("image/", "");
  return subtype === "jpeg" ? "jpg" : subtype;
}

export async function downloadPortalImage(args: {
  imageUrl: string;
  portalUrl: string;
  userAgent?: string;
  cookies?: string;
  timeoutMs?: number;
}): Promise<DownloadedPortalImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 30_000);
  try {
    const response = await fetch(args.imageUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        Referer: args.portalUrl,
        ...(args.userAgent ? { "User-Agent": args.userAgent } : {}),
        ...(args.cookies ? { Cookie: args.cookies } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} descargando imagen`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Content-Type no es imagen: ${contentType || "desconocido"}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength <= 0) throw new Error("Imagen vacía");
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Imagen demasiado grande: ${arrayBuffer.byteLength} bytes`);
    }

    const buffer = Buffer.from(arrayBuffer);
    return {
      url: args.imageUrl,
      buffer,
      contentType,
      bytes: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      format: formatFromContentType(contentType),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function uploadStatefoxImageToCloudinary(args: {
  image: DownloadedPortalImage;
  publicId: string;
  tags?: string[];
  context?: Record<string, string>;
}): Promise<UploadedStatefoxImage> {
  const cloudinary = getCloudinary();
  const dataUri = `data:${args.image.contentType};base64,${args.image.buffer.toString("base64")}`;
  const contextStr = args.context
    ? Object.entries(args.context)
        .map(([key, value]) => `${key}=${value}`)
        .join("|")
    : undefined;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "image",
    public_id: args.publicId,
    tags: ["statefox", "comparable", ...(args.tags ?? [])],
    context: contextStr,
    overwrite: true,
    invalidate: true,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    bytes: result.bytes,
    format: result.format,
    width: result.width,
    height: result.height,
  };
}
