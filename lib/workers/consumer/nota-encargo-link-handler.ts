import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { linkNotaEncargoOnPropertyCreated } from "@/lib/nota-encargo/ref-matcher";

export async function handleNotaEncargoLinkOnPropertyCreated(
  event: Event,
): Promise<HandlerResult> {
  if (event.type !== "PROPIEDAD_CREADA") return { success: true };

  const result = await linkNotaEncargoOnPropertyCreated(event);
  if (result.linked) {
    console.log(
      `[consumer:nota-encargo-link] session=${result.sessionId} vinculada a propertyCode=${result.propertyCode} ownerCopied=${Boolean(result.ownerCopied)}`,
    );
  }

  return { success: true };
}
