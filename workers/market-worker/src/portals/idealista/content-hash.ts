/**
 * Hash deterministico para deduplicar capturas de Idealista.
 *
 * Mismo enfoque que Fotocasa y Pisos.com: solo campos estables. Excluye
 * `imageUrls` (cambian por cache busting de img4.idealista.com con
 * paths como `/blur/480_360_mq/0/id.pro.es.image.master/<hash>/<id>.jpg`),
 * y excluye `description` (truncada con `…` y depende del width DOM).
 */

import { createHash } from "node:crypto";

export interface HashableIdealistaCard {
  externalId: string | null;
  canonicalUrl: string;
  priceRaw?: string | null;
  title?: string | null;
  surfaceRaw?: string | null;
  roomsRaw?: string | null;
  zoneRaw?: string | null;
}

export function computeIdealistaContentHash(card: HashableIdealistaCard): string {
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
