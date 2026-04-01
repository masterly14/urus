import { handleSignaturitWebhookPost } from "@/lib/signaturit/handle-webhook-post";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Alias sin sufijo `.json`; `events_url` de producción debe usar `/api/signaturit/webhook.json` (Signaturit envía JSON). */
export async function POST(request: Request) {
  return handleSignaturitWebhookPost(request);
}
