/**
 * Hash determinístico para deduplicar capturas brutas de Fotocasa.
 *
 * Solo entran en el hash los campos estables. Excluye `imageUrls` (cambian
 * por cache busting) y posiciones DOM (cambian con A/B tests).
 *
 * El runtime usa `(source, contentHash)` como unique para idempotencia.
 */

import { createHash } from "node:crypto";

export interface HashableFotocasaCard {
  externalId: string | null;
  canonicalUrl: string;
  priceRaw?: string | null;
  title?: string | null;
  surfaceRaw?: string | null;
  roomsRaw?: string | null;
  zoneRaw?: string | null;
}

export function computeFotocasaContentHash(card: HashableFotocasaCard): string {
  const parts = [
    card.externalId ?? "",
    card.canonicalUrl,
    (card.priceRaw ?? "").trim(),
    (card.title ?? "").trim().toLowerCase(),
    (card.surfaceRaw ?? "").trim(),
    (card.roomsRaw ?? "").trim(),
    (card.zoneRaw ?? "").trim().toLowerCase(),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
