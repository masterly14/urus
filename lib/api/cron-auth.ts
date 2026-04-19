import { Receiver } from "@upstash/qstash";

/**
 * Autorización heredada por bearer token.
 * Se mantiene para rutas que no forman parte de cron QStash.
 */
export function isAuthorized(request: Request): boolean {
  const token = process.env.CRON_SECRET;
  if (!token) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${token}`;
}

let qstashReceiver: Receiver | null = null;

function getQstashReceiver(): Receiver | null {
  if (qstashReceiver) return qstashReceiver;

  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) return null;

  qstashReceiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  });

  return qstashReceiver;
}

function resolveRequestUrl(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https") ? "https" : "http");

  if (!forwardedHost) return request.url;

  const parsed = new URL(request.url);
  return `${forwardedProto}://${forwardedHost}${parsed.pathname}${parsed.search}`;
}

/**
 * Autorización para cron routes. Valida en orden:
 *   1. Firma Upstash-Signature con QSTASH_CURRENT/NEXT_SIGNING_KEY
 *   2. Header Authorization: Bearer <CRON_SECRET> como fallback
 */
export async function isQstashAuthorized(request: Request): Promise<boolean> {
  const signature = request.headers.get("Upstash-Signature");
  const bearerOk = isAuthorized(request);

  if (!signature) {
    if (bearerOk) return true;
    console.warn("[cron-auth] Sin Upstash-Signature ni Bearer válido");
    return false;
  }

  const receiver = getQstashReceiver();
  if (!receiver) {
    console.error(
      "[cron-auth] QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY no configurados en Vercel",
    );
    return bearerOk;
  }

  const body = await request.clone().text();
  const candidateUrls = [request.url, resolveRequestUrl(request)];
  const uniqueUrls = [...new Set(candidateUrls)];

  for (const url of uniqueUrls) {
    try {
      await receiver.verify({ signature, body, url });
      return true;
    } catch (err) {
      console.warn(
        `[cron-auth] verify falló para url=${url}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return bearerOk;
}
