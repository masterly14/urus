import { handleSignaturitWebhookPost } from "@/lib/signaturit/handle-webhook-post";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * URL canónica para `events_url` al crear firmas en Signaturit.
 * El sufijo `.json` hace que Signaturit envíe el cuerpo como application/json
 * (ver docs/signaturing-docs — Events URL).
 */
export async function POST(request: Request) {
  return handleSignaturitWebhookPost(request);
}
