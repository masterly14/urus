import { prisma } from "@/lib/prisma";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
]);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);

function normalizeWaId(value: string): string {
  return value.replace(/[^\d]/g, "");
}

const DEFAULT_EXPENSE_TEST_WA_IDS = ["573113541077"];

function parseAllowedWaIdsFromEnv(): Set<string> {
  const raw = process.env.EXPENSES_ALLOWED_WA_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => normalizeWaId(entry.trim()))
      .filter(Boolean),
  );
}

function parseExpenseTestWaIds(): Set<string> {
  const raw = process.env.EXPENSES_TEST_WA_IDS;
  const source = raw && raw.trim().length > 0 ? raw : DEFAULT_EXPENSE_TEST_WA_IDS.join(",");
  return new Set(
    source
      .split(",")
      .map((entry) => normalizeWaId(entry.trim()))
      .filter(Boolean),
  );
}

function parseMaxMediaBytes(): number {
  const parsed = Number(process.env.MAX_EXPENSE_MEDIA_BYTES ?? "15728640");
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 15 * 1024 * 1024;
}

export function getMaxExpenseMediaBytes(): number {
  return parseMaxMediaBytes();
}

export function isExpenseTestWaId(waId: string): boolean {
  const normalized = normalizeWaId(waId);
  if (!normalized) return false;
  return parseExpenseTestWaIds().has(normalized);
}

export function isAllowedExpenseMimeType(
  mediaType: "audio" | "image" | "document",
  mimeType: string,
): boolean {
  if (mediaType === "audio") return ALLOWED_AUDIO_MIME_TYPES.has(mimeType);
  if (mediaType === "image") return ALLOWED_IMAGE_MIME_TYPES.has(mimeType);
  return ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType);
}

export async function isAuthorizedExpenseWaId(waId: string): Promise<boolean> {
  const normalized = normalizeWaId(waId);
  if (!normalized) return false;

  if (isExpenseTestWaId(normalized)) {
    return true;
  }

  const envAllowed = parseAllowedWaIdsFromEnv();
  if (envAllowed.has(normalized)) {
    return true;
  }

  const fromComercial = await prisma.comercial.findFirst({
    where: {
      waId: normalized,
      user: {
        role: { in: ["ceo", "admin"] },
      },
    },
    select: { id: true },
  });

  return Boolean(fromComercial);
}

export type MediaValidationInput = {
  mediaType: "audio" | "image" | "document";
  mimeType: string;
  sizeBytes: number | null | undefined;
};

export function validateExpenseMedia(input: MediaValidationInput): {
  ok: boolean;
  reason?: string;
} {
  if (!isAllowedExpenseMimeType(input.mediaType, input.mimeType)) {
    return {
      ok: false,
      reason: `Tipo MIME no permitido para ${input.mediaType}: ${input.mimeType}`,
    };
  }

  const size = input.sizeBytes ?? null;
  const maxBytes = getMaxExpenseMediaBytes();
  if (size != null && size > maxBytes) {
    return {
      ok: false,
      reason: `Archivo excede tamaño máximo (${maxBytes} bytes)`,
    };
  }

  return { ok: true };
}
