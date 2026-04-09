import type { HistoricalStats } from "./ai-types";
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 10 * 60_000;

let cached: HistoricalStats | null = null;
let cachedAt = 0;

/**
 * Fetches aggregate conversion stats from CommercialLeadFact + CommercialOperationFact.
 * Results are cached for 10 minutes to avoid per-lead DB overhead.
 */
export async function fetchHistoricalStats(): Promise<HistoricalStats> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  try {
    cached = await computeStats();
  } catch {
    cached = cached ?? emptyStats();
  }

  cachedAt = now;
  return cached;
}

async function computeStats(): Promise<HistoricalStats> {
  const [leadFacts, opFacts] = await Promise.all([
    prisma.commercialLeadFact.findMany({
      select: { leadId: true, score: true, ciudad: true, source: true },
    }),
    prisma.commercialOperationFact.findMany({
      where: { closedAt: { not: null } },
      select: { sourceEventId: true, ciudad: true },
    }),
  ]);

  const closedCities = new Set(opFacts.map((o) => o.ciudad));
  const totalClosed = opFacts.length;
  const totalOpen = Math.max(0, leadFacts.length - totalClosed);

  const cityLeadCounts: Record<string, number> = {};
  const cityClosedCounts: Record<string, number> = {};
  const sourceLeadCounts: Record<string, number> = {};
  const sourceClosedCounts: Record<string, number> = {};

  let closedScoreSum = 0;
  let closedScoreCount = 0;
  let openScoreSum = 0;
  let openScoreCount = 0;

  const leadSourceById = new Map<string, string>();

  for (const lead of leadFacts) {
    const city = lead.ciudad || "unknown";
    const source = lead.source || "unknown";
    cityLeadCounts[city] = (cityLeadCounts[city] ?? 0) + 1;
    sourceLeadCounts[source] = (sourceLeadCounts[source] ?? 0) + 1;
    leadSourceById.set(lead.leadId, source);
  }

  const closedLeadIds = new Set<string>();

  for (const op of opFacts) {
    const city = op.ciudad || "unknown";
    cityClosedCounts[city] = (cityClosedCounts[city] ?? 0) + 1;

    if (op.sourceEventId) {
      closedLeadIds.add(op.sourceEventId);
      const source = leadSourceById.get(op.sourceEventId) ?? "unknown";
      sourceClosedCounts[source] = (sourceClosedCounts[source] ?? 0) + 1;
    }
  }

  for (const lead of leadFacts) {
    if (lead.score == null) continue;
    const isClosed = closedLeadIds.has(lead.leadId) || closedCities.has(lead.ciudad);
    if (isClosed) {
      closedScoreSum += lead.score;
      closedScoreCount++;
    } else {
      openScoreSum += lead.score;
      openScoreCount++;
    }
  }

  const conversionRateByCity: Record<string, number> = {};
  for (const [city, count] of Object.entries(cityLeadCounts)) {
    const closed = cityClosedCounts[city] ?? 0;
    conversionRateByCity[city] = count > 0 ? closed / count : 0;
  }

  const conversionRateBySource: Record<string, number> = {};
  for (const [source, count] of Object.entries(sourceLeadCounts)) {
    conversionRateBySource[source] = count > 0 ? (sourceClosedCounts[source] ?? 0) / count : 0;
  }

  return {
    conversionRateByCity,
    conversionRateBySource,
    avgScoreClosedLeads: closedScoreCount > 0 ? closedScoreSum / closedScoreCount : null,
    avgScoreOpenLeads: openScoreCount > 0 ? openScoreSum / openScoreCount : null,
    totalClosedLeads: totalClosed,
    totalOpenLeads: totalOpen,
  };
}

function emptyStats(): HistoricalStats {
  return {
    conversionRateByCity: {},
    conversionRateBySource: {},
    avgScoreClosedLeads: null,
    avgScoreOpenLeads: null,
    totalClosedLeads: 0,
    totalOpenLeads: 0,
  };
}

export function invalidateHistoricalStatsCache(): void {
  cached = null;
  cachedAt = 0;
}
