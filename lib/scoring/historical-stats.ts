import type { HistoricalStats } from "./ai-types";
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 5 * 60_000;

let cached: HistoricalStats | null = null;
let cachedAt = 0;

/**
 * Fetches aggregate conversion stats from CommercialLeadFact + CommercialOperationFact.
 * Results are cached for 5 minutes to avoid per-lead DB overhead.
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
      select: {
        leadId: true,
        inmovillaDemandId: true,
        score: true,
        ciudad: true,
        source: true,
      },
    }),
    prisma.commercialOperationFact.findMany({
      select: { demandId: true, ciudad: true },
    }),
  ]);

  const closedCities = new Set(opFacts.map((o) => o.ciudad));
  const totalClosed = opFacts.length;
  const totalOpen = Math.max(0, leadFacts.length - totalClosed);

  const cityLeadCounts: Record<string, number> = {};
  const cityClosedCounts: Record<string, number> = {};
  const sourceLeadCounts: Record<string, number> = {};
  const sourceClosedCounts: Record<string, number> = {};

  // Set of Inmovilla demandIds for closed operations — se cruza contra
  // CommercialLeadFact.inmovillaDemandId (mismo ID-space) para detectar leads cerrados.
  const closedDemandIds = new Set(
    opFacts.map((o) => o.demandId).filter((id): id is string => id != null && id !== ""),
  );

  let closedScoreSum = 0;
  let closedScoreCount = 0;
  let openScoreSum = 0;
  let openScoreCount = 0;

  for (const lead of leadFacts) {
    const city = lead.ciudad || "unknown";
    const source = lead.source || "unknown";
    cityLeadCounts[city] = (cityLeadCounts[city] ?? 0) + 1;
    sourceLeadCounts[source] = (sourceLeadCounts[source] ?? 0) + 1;
  }

  for (const op of opFacts) {
    const city = op.ciudad || "unknown";
    cityClosedCounts[city] = (cityClosedCounts[city] ?? 0) + 1;
  }

  for (const lead of leadFacts) {
    const source = lead.source || "unknown";
    const matchedByDemand =
      lead.inmovillaDemandId != null && closedDemandIds.has(lead.inmovillaDemandId);

    if (matchedByDemand) {
      sourceClosedCounts[source] = (sourceClosedCounts[source] ?? 0) + 1;
    }

    if (lead.score == null) continue;

    // Un lead se considera "cerrado" si matchea por demandId real. El fallback por
    // ciudad se conserva porque no todos los leads traen demandId (p. ej. web forms),
    // pero prioriza el match directo cuando existe.
    const isClosed = matchedByDemand || closedCities.has(lead.ciudad);
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
