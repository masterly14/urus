import { prisma } from "@/lib/prisma";

export const CAPTACION_TAG_VALUES = [
  "CONTACTADO",
  "EN_ESPERA",
  "RECHAZADO",
  "CAPTADO",
] as const;

export type CaptacionTag = (typeof CAPTACION_TAG_VALUES)[number];

const TAG_SET = new Set<string>(CAPTACION_TAG_VALUES);
const TAG_KEY_PREFIX = "market:listing:captacion-tag:";

export function isCaptacionTag(value: unknown): value is CaptacionTag {
  return typeof value === "string" && TAG_SET.has(value);
}

export function getCaptacionTagKey(listingId: string): string {
  return `${TAG_KEY_PREFIX}${listingId}`;
}

export async function getCaptacionTagsByListingIds(
  listingIds: string[],
): Promise<Map<string, CaptacionTag>> {
  const dedupedIds = Array.from(new Set(listingIds.filter(Boolean)));
  if (dedupedIds.length === 0) return new Map();

  const keys = dedupedIds.map(getCaptacionTagKey);
  const rows = await prisma.kvStore.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });

  const out = new Map<string, CaptacionTag>();
  for (const row of rows) {
    if (!isCaptacionTag(row.value)) continue;
    if (!row.key.startsWith(TAG_KEY_PREFIX)) continue;
    const listingId = row.key.slice(TAG_KEY_PREFIX.length);
    if (listingId) out.set(listingId, row.value);
  }
  return out;
}

export async function setCaptacionTagForListing(
  listingId: string,
  tag: CaptacionTag | null,
): Promise<void> {
  const key = getCaptacionTagKey(listingId);

  if (!tag) {
    await prisma.kvStore.deleteMany({ where: { key } });
    return;
  }

  await prisma.kvStore.upsert({
    where: { key },
    create: { key, value: tag },
    update: { value: tag },
  });
}
