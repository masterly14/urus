import { getCloudinary } from "./client";

export type UploadWhatsAppAudioInput = {
  buffer: Buffer;
  mediaId: string;
  waId: string;
  mimeType?: string | null;
  messageId: string;
  tags?: string[];
};

export type UploadWhatsAppAudioResult = {
  publicId: string;
  secureUrl: string;
  url: string;
  bytes: number;
  format: string | null;
  resourceType: string;
  createdAt: string;
};

export async function uploadWhatsAppAudio(
  input: UploadWhatsAppAudioInput,
): Promise<UploadWhatsAppAudioResult> {
  const cloudinary = getCloudinary();
  const mime = input.mimeType?.trim() || "audio/ogg";
  const dataUri = `data:${mime};base64,${input.buffer.toString("base64")}`;
  const context = [
    `wa_id=${input.waId}`,
    `media_id=${input.mediaId}`,
    `message_id=${input.messageId}`,
  ].join("|");

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "video",
    folder: `whatsapp/audio/${input.waId}`,
    public_id: input.mediaId,
    overwrite: true,
    invalidate: true,
    context,
    tags: ["whatsapp_audio", ...(input.tags ?? [])],
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    url: result.url,
    bytes: result.bytes,
    format: result.format ?? null,
    resourceType: result.resource_type,
    createdAt: result.created_at,
  };
}

