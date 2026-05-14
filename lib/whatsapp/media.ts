import { fetchWithRetry } from "./client";
import { META_API_VERSION } from "./types";

type MetaMediaResponse = {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  id?: string;
};

function requiredEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`WhatsApp media: falta ${name}`);
  return trimmed;
}

export async function getWhatsAppMediaMetadata(mediaId: string): Promise<{
  id: string;
  url: string;
  mimeType: string;
  sha256?: string;
  fileSize?: number;
}> {
  const accessToken = requiredEnv(
    "WHATSAPP_ACCESS_TOKEN",
    process.env.WHATSAPP_ACCESS_TOKEN,
  );
  const apiVersion = META_API_VERSION;

  const response = await fetchWithRetry(() =>
    fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `WhatsApp media metadata ${mediaId} failed (${response.status}): ${raw}`,
    );
  }

  const data = (await response.json()) as MetaMediaResponse;
  if (!data.url || !data.mime_type) {
    throw new Error(`WhatsApp media metadata incompleta para ${mediaId}`);
  }

  return {
    id: mediaId,
    url: data.url,
    mimeType: data.mime_type,
    sha256: data.sha256,
    fileSize: data.file_size,
  };
}

export async function downloadWhatsAppMedia(
  mediaUrl: string,
): Promise<{ buffer: Buffer; mimeType: string | null }> {
  const accessToken = requiredEnv(
    "WHATSAPP_ACCESS_TOKEN",
    process.env.WHATSAPP_ACCESS_TOKEN,
  );

  const response = await fetchWithRetry(() =>
    fetch(mediaUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `WhatsApp media download failed (${response.status}): ${raw}`,
    );
  }

  const mimeType = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

