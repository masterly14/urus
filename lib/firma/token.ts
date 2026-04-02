import { createHmac, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

function getSecret(): string {
  const secret = process.env.FIRMA_TOKEN_SECRET;
  if (!secret) {
    throw new Error("FIRMA_TOKEN_SECRET env var is required for signing token generation");
  }
  return secret;
}

export function generateSigningToken(): string {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  const hmac = createHmac("sha256", getSecret()).update(raw).digest("hex").slice(0, 16);
  return `${raw}.${hmac}`;
}

export function verifySigningToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [raw, hmac] = parts;
  if (!raw || !hmac) return false;
  const expected = createHmac("sha256", getSecret()).update(raw).digest("hex").slice(0, 16);
  return hmac === expected;
}
