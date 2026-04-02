const PDF_MAGIC = "%PDF-";

export class PdfNormalizationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PDF_CONVERSION_UNAVAILABLE"
      | "PDF_CONVERSION_FAILED"
      | "PDF_INVALID_RESPONSE",
  ) {
    super(message);
    this.name = "PdfNormalizationError";
  }
}

export interface NormalizePdfInput {
  buffer: Buffer;
  contentType?: string | null;
  sourceFileName?: string | null;
}

export interface NormalizePdfResult {
  pdfBuffer: Buffer;
  pdfFileName: string;
  converted: boolean;
}

function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC.length) return false;
  return buffer.subarray(0, PDF_MAGIC.length).toString("utf8") === PDF_MAGIC;
}

function ensurePdfExtension(name: string): string {
  if (/\.pdf$/i.test(name)) return name;
  return `${name.replace(/\.[a-z0-9]+$/i, "")}.pdf`;
}

function inferFileName(sourceFileName?: string | null): string {
  const fallback = "document.pdf";
  if (!sourceFileName) return fallback;
  const trimmed = sourceFileName.trim();
  if (!trimmed) return fallback;
  return ensurePdfExtension(trimmed);
}

function readContentDispositionFileName(
  contentDisposition?: string | null,
): string | null {
  if (!contentDisposition) return null;
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const ascii = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (ascii?.[1]) return ascii[1];
  return null;
}

async function convertUsingRemoteService(
  buffer: Buffer,
  sourceFileName: string,
): Promise<Buffer> {
  const converterUrl = process.env.SIGNATURIT_PDF_CONVERTER_URL?.trim();
  if (!converterUrl) {
    throw new PdfNormalizationError(
      "El documento no es PDF y no hay conversor configurado (SIGNATURIT_PDF_CONVERTER_URL).",
      "PDF_CONVERSION_UNAVAILABLE",
    );
  }

  const form = new FormData();
  const sourceMime = /\.docx$/i.test(sourceFileName)
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/octet-stream";
  form.append("file", new Blob([new Uint8Array(buffer)], { type: sourceMime }), sourceFileName);

  const timeoutMs = Number(process.env.SIGNATURIT_PDF_CONVERTER_TIMEOUT_MS) || 45_000;
  const res = await fetch(converterUrl, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new PdfNormalizationError(
      `Conversor PDF devolvió ${res.status}: ${detail}`,
      "PDF_CONVERSION_FAILED",
    );
  }

  const out = Buffer.from(await res.arrayBuffer());
  if (!isPdfBuffer(out)) {
    throw new PdfNormalizationError(
      "El conversor respondió OK pero no devolvió un PDF válido.",
      "PDF_INVALID_RESPONSE",
    );
  }

  return out;
}

export async function normalizeDocumentToPdf(
  input: NormalizePdfInput,
): Promise<NormalizePdfResult> {
  const { buffer, contentType, sourceFileName } = input;
  if (isPdfBuffer(buffer) || contentType?.includes("application/pdf")) {
    return {
      pdfBuffer: buffer,
      pdfFileName: ensurePdfExtension(inferFileName(sourceFileName)),
      converted: false,
    };
  }

  const guessedName = sourceFileName ?? "document.docx";
  const converted = await convertUsingRemoteService(buffer, guessedName);
  return {
    pdfBuffer: converted,
    pdfFileName: ensurePdfExtension(inferFileName(sourceFileName)),
    converted: true,
  };
}

export function inferSourceFileNameFromResponse(
  sourceUrl: string,
  response: Response,
): string {
  const fromHeader = readContentDispositionFileName(
    response.headers.get("content-disposition"),
  );
  if (fromHeader) return fromHeader;
  try {
    const pathname = new URL(sourceUrl).pathname;
    const last = pathname.split("/").pop();
    if (last && last.trim()) return last;
  } catch {
    // noop
  }
  return "document";
}
