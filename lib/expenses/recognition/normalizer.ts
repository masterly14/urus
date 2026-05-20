import {
  downloadWhatsAppMedia,
  getWhatsAppMediaMetadata,
} from "@/lib/whatsapp/media";
import { validateExpenseMedia } from "../security";
import type { ExpenseAttachmentDraft, ExpenseInboundMessage } from "../types";
import { extractTextFromExpenseImage, extractTextFromExpensePdf } from "./ocr";
import { transcribeExpenseAudio } from "./transcribe";

export type NormalizedExpenseInput = {
  sourceMessageType: string;
  normalizedText: string;
  attachments: ExpenseAttachmentDraft[];
};

type MessageWithMedia = Record<string, unknown> & {
  audio?: Record<string, unknown>;
  image?: Record<string, unknown>;
  document?: Record<string, unknown>;
  text?: { body?: string };
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMediaId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  return readString((value as Record<string, unknown>).id);
}

async function normalizeAudio(
  message: MessageWithMedia,
): Promise<NormalizedExpenseInput> {
  const mediaId = readMediaId(message.audio);
  if (!mediaId) {
    throw new Error("Mensaje de audio sin mediaId");
  }
  const metadata = await getWhatsAppMediaMetadata(mediaId);
  const validation = validateExpenseMedia({
    mediaType: "audio",
    mimeType: metadata.mimeType,
    sizeBytes: metadata.fileSize,
  });
  if (!validation.ok) {
    throw new Error(validation.reason || "Audio no permitido");
  }
  const downloaded = await downloadWhatsAppMedia(metadata.url);
  const transcription = await transcribeExpenseAudio({
    buffer: downloaded.buffer,
    mimeType: metadata.mimeType,
    fileName: `expense-${mediaId}.ogg`,
  });
  return {
    sourceMessageType: "audio",
    normalizedText: transcription,
    attachments: [
      {
        mediaType: "audio",
        metaMediaId: metadata.id,
        mimeType: metadata.mimeType,
        sha256: metadata.sha256 ?? null,
        filename: `audio-${metadata.id}.ogg`,
        sizeBytes: metadata.fileSize ?? null,
      },
    ],
  };
}

async function normalizeImage(
  message: MessageWithMedia,
): Promise<NormalizedExpenseInput> {
  const media = message.image;
  const mediaId = readMediaId(media);
  if (!mediaId) {
    throw new Error("Mensaje de imagen sin mediaId");
  }
  const metadata = await getWhatsAppMediaMetadata(mediaId);
  const validation = validateExpenseMedia({
    mediaType: "image",
    mimeType: metadata.mimeType,
    sizeBytes: metadata.fileSize,
  });
  if (!validation.ok) {
    throw new Error(validation.reason || "Imagen no permitida");
  }
  const downloaded = await downloadWhatsAppMedia(metadata.url);
  const ocrText = await extractTextFromExpenseImage({
    buffer: downloaded.buffer,
    mimeType: metadata.mimeType,
  });
  const caption = readString((media as Record<string, unknown> | undefined)?.caption);
  return {
    sourceMessageType: "image",
    normalizedText: [caption, ocrText].filter(Boolean).join("\n\n"),
    attachments: [
      {
        mediaType: "image",
        metaMediaId: metadata.id,
        mimeType: metadata.mimeType,
        sha256: metadata.sha256 ?? null,
        filename: `image-${metadata.id}`,
        sizeBytes: metadata.fileSize ?? null,
      },
    ],
  };
}

async function normalizeDocument(
  message: MessageWithMedia,
): Promise<NormalizedExpenseInput> {
  const media = message.document as Record<string, unknown> | undefined;
  const mediaId = readMediaId(media);
  if (!mediaId) {
    throw new Error("Documento sin mediaId");
  }
  const metadata = await getWhatsAppMediaMetadata(mediaId);
  const validation = validateExpenseMedia({
    mediaType: "document",
    mimeType: metadata.mimeType,
    sizeBytes: metadata.fileSize,
  });
  if (!validation.ok) {
    throw new Error(validation.reason || "Documento no permitido");
  }
  const downloaded = await downloadWhatsAppMedia(metadata.url);
  const filename = readString(media?.filename) || `expense-${metadata.id}.pdf`;
  const extractedText = await extractTextFromExpensePdf({
    buffer: downloaded.buffer,
    mimeType: metadata.mimeType,
    filename,
  });
  const caption = readString(media?.caption);
  return {
    sourceMessageType: "document",
    normalizedText: [caption, extractedText].filter(Boolean).join("\n\n"),
    attachments: [
      {
        mediaType: "document",
        metaMediaId: metadata.id,
        mimeType: metadata.mimeType,
        sha256: metadata.sha256 ?? null,
        filename,
        sizeBytes: metadata.fileSize ?? null,
      },
    ],
  };
}

function normalizeText(message: MessageWithMedia): NormalizedExpenseInput {
  const body = readString(message.text?.body);
  if (!body) {
    throw new Error("Mensaje de texto sin contenido");
  }
  return {
    sourceMessageType: "text",
    normalizedText: body,
    attachments: [],
  };
}

export async function normalizeExpenseInboundMessage(
  inbound: ExpenseInboundMessage,
): Promise<NormalizedExpenseInput> {
  const message = inbound.message as MessageWithMedia;
  switch (inbound.type) {
    case "text":
      return normalizeText(message);
    case "audio":
      return normalizeAudio(message);
    case "image":
      return normalizeImage(message);
    case "document":
      return normalizeDocument(message);
    default:
      throw new Error(`Tipo de mensaje no soportado para gastos: ${inbound.type}`);
  }
}
