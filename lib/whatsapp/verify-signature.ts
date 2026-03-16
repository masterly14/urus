import crypto from "crypto";

/**
 * Verifica la firma HMAC-SHA256 enviada por Meta en el header X-Hub-Signature-256.
 *
 * Meta firma el body raw con el App Secret de la aplicación de Facebook.
 * Ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
 *
 * @param rawBody  Body crudo como string (antes de parsear JSON)
 * @param signature  Valor del header X-Hub-Signature-256 (ej. "sha256=abc123...")
 * @param appSecret  META_APP_SECRET de la aplicación Facebook
 */
export function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) return false;

  const parts = signature.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const receivedHash = parts[1];

  const expectedHash = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHash, "hex"),
      Buffer.from(expectedHash, "hex")
    );
  } catch {
    // Buffers de distinto tamaño → firma inválida
    return false;
  }
}
