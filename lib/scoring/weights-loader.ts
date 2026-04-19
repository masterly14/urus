import { prisma } from "@/lib/prisma";

export interface ScoringWeights {
  pclose: number;
  value: number;
  urgency: number;
  version: number | null;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  pclose: 0.55,
  value: 0.3,
  urgency: 0.15,
  version: null,
};

const CACHE_TTL_MS = 5 * 60_000;

let cached: ScoringWeights | null = null;
let cachedAt = 0;

export async function getActiveWeights(): Promise<ScoringWeights> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const row = await prisma.scoringModelVersion.findFirst({
      where: { activatedAt: { not: null } },
      orderBy: { version: "desc" },
      select: {
        version: true,
        weightPclose: true,
        weightValue: true,
        weightUrgency: true,
      },
    });

    if (row) {
      cached = {
        pclose: row.weightPclose,
        value: row.weightValue,
        urgency: row.weightUrgency,
        version: row.version,
      };
    } else {
      cached = DEFAULT_WEIGHTS;
    }
  } catch {
    cached = cached ?? DEFAULT_WEIGHTS;
  }

  cachedAt = now;
  return cached;
}

/** Force-clear the in-memory cache (useful in tests and after recalibration). */
export function invalidateWeightsCache(): void {
  cached = null;
  cachedAt = 0;
}

export { DEFAULT_WEIGHTS };
