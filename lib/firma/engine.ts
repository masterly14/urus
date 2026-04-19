import { createHash } from "node:crypto";
import { generateSigningToken, verifySigningToken } from "./token";

export { generateSigningToken, verifySigningToken };

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function verifyDocumentIntegrity(
  buffer: Buffer,
  expectedHash: string,
): boolean {
  return computeSha256(buffer) === expectedHash;
}

export function buildSigningUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl.replace(/\/+$/, "")}/firma/${token}`;
}

export const DEFAULT_CONSENT_TEXT =
  "Al hacer clic en Firmar, declaro que he leído y acepto el contenido íntegro del presente documento. " +
  "Confirmo que actúo en mi propio nombre y que los datos proporcionados son veraces.";

export function extractSignerIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export function extractUserAgent(request: Request): string {
  return request.headers.get("user-agent") ?? "unknown";
}
