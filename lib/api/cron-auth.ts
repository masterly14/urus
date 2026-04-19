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

/**
 * Autorización oficial de QStash para cron routes.
 * Valida `Upstash-Signature` con llaves de firma actuales.
 */
export async function isQstashAuthorized(request: Request): Promise<boolean> {
  const signature = request.headers.get("Upstash-Signature");
  if (!signature) return false;

  const receiver = getQstashReceiver();
  if (!receiver) return false;

  const body = await request.clone().text();

  try {
    await receiver.verify({
      signature,
      body,
      url: request.url,
    });
    return true;
  } catch {
    return false;
  }
}
