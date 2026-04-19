import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentalHealthAlertType = "energy_drop" | "recurrent_block" | "overload";
export type MentalHealthAlertSeverity = "low" | "medium" | "high";

export interface MentalHealthAlertCandidate {
  comercialId: string;
  comercialNombre: string;
  type: MentalHealthAlertType;
  severity: MentalHealthAlertSeverity;
  metric: string;
  message: string;
  currentValue: number;
  baselineValue: number | null;
  threshold: number;
  details: Record<string, unknown>;
}

export interface MentalHealthScanResult {
  alerts: MentalHealthAlertCandidate[];
  energyDropCount: number;
  recurrentBlockCount: number;
  overloadCount: number;
  deduplicatedCount: number;
}

// ---------------------------------------------------------------------------
// Config (env-configurable)
// ---------------------------------------------------------------------------

export function getMentalHealthAlertConfig() {
  return {
    energyDropThreshold: envInt("MH_ALERT_ENERGY_DROP_THRESHOLD", 3),
    blockThreshold: envInt("MH_ALERT_BLOCK_THRESHOLD", 3),
    overloadSessions: envInt("MH_ALERT_OVERLOAD_SESSIONS", 5),
    deduplicationWindowDays: 7,
    lookbackDays14: 14,
    lookbackDays7: 7,
  };
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number, now: Date): Date {
  return new Date(now.getTime() - n * DAY_MS);
}

// ---------------------------------------------------------------------------
// Pure detection logic — testable without Prisma
// ---------------------------------------------------------------------------

export interface EnergyDropRow {
  comercialId: string;
  comercialNombre: string;
  lowEnergyCount: number;
  avgEnergia: number;
}

export interface RecurrentBlockRow {
  comercialId: string;
  comercialNombre: string;
  blockCount: number;
  subtipos: string[];
}

export interface OverloadRow {
  comercialId: string;
  comercialNombre: string;
  sessionCount: number;
  avgEnergia: number;
}

export function detectEnergyDropFromRows(
  rows: EnergyDropRow[],
  threshold: number,
  lookbackDays: number,
): MentalHealthAlertCandidate[] {
  const alerts: MentalHealthAlertCandidate[] = [];

  for (const row of rows) {
    if (row.lowEnergyCount < threshold) continue;

    const severity: MentalHealthAlertSeverity =
      row.lowEnergyCount >= threshold * 2 ? "high" : "medium";

    alerts.push({
      comercialId: row.comercialId,
      comercialNombre: row.comercialNombre,
      type: "energy_drop",
      severity,
      metric: "nivelEnergia",
      message: `Caída de energía prolongada: ${row.lowEnergyCount} sesiones con energía ≤ 2/5 en los últimos ${lookbackDays} días (media: ${row.avgEnergia}/5)`,
      currentValue: row.avgEnergia,
      baselineValue: null,
      threshold,
      details: {
        lowEnergySessionCount: row.lowEnergyCount,
        avgEnergia: row.avgEnergia,
        lookbackDays,
      },
    });
  }

  return alerts;
}

export function detectRecurrentBlockFromRows(
  rows: RecurrentBlockRow[],
  threshold: number,
  lookbackDays: number,
): MentalHealthAlertCandidate[] {
  const alerts: MentalHealthAlertCandidate[] = [];

  for (const row of rows) {
    if (row.blockCount < threshold) continue;

    const severity: MentalHealthAlertSeverity =
      row.blockCount >= threshold * 2 ? "high" : "medium";
    const subtiposStr =
      row.subtipos?.length > 0 ? ` (${row.subtipos.join(", ")})` : "";

    alerts.push({
      comercialId: row.comercialId,
      comercialNombre: row.comercialNombre,
      type: "recurrent_block",
      severity,
      metric: "flujoActivo",
      message: `Bloqueo recurrente: ${row.blockCount} sesiones de bloqueo en los últimos ${lookbackDays} días${subtiposStr}`,
      currentValue: row.blockCount,
      baselineValue: null,
      threshold,
      details: {
        blockSessionCount: row.blockCount,
        subtipos: row.subtipos ?? [],
        lookbackDays,
      },
    });
  }

  return alerts;
}

export function detectOverloadFromRows(
  rows: OverloadRow[],
  overloadSessions: number,
  lookbackDays: number,
): MentalHealthAlertCandidate[] {
  const alerts: MentalHealthAlertCandidate[] = [];

  for (const row of rows) {
    if (row.sessionCount < overloadSessions) continue;

    alerts.push({
      comercialId: row.comercialId,
      comercialNombre: row.comercialNombre,
      type: "overload",
      severity: "high",
      metric: "sessionFrequency",
      message: `Sobrecarga detectada: ${row.sessionCount} sesiones con energía ≤ 3/5 en los últimos ${lookbackDays} días (media: ${row.avgEnergia}/5)`,
      currentValue: row.sessionCount,
      baselineValue: null,
      threshold: overloadSessions,
      details: {
        sessionCount: row.sessionCount,
        avgEnergia: row.avgEnergia,
        lookbackDays,
      },
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Database-fetching functions
// ---------------------------------------------------------------------------

async function fetchEnergyDropRows(
  now: Date,
  threshold: number,
  lookbackDays: number,
): Promise<EnergyDropRow[]> {
  const since = daysAgo(lookbackDays, now);

  const raw = await prisma.$queryRaw<
    { comercialId: string; lowEnergyCount: number; avgEnergia: number }[]
  >`
    SELECT
      s."comercialId",
      COUNT(*)::int AS "lowEnergyCount",
      ROUND(AVG(s."nivelEnergia")::numeric, 2)::float AS "avgEnergia"
    FROM "mental_health_sessions" s
    WHERE
      s."comercialId" IS NOT NULL
      AND s."nivelEnergia" IS NOT NULL
      AND s."nivelEnergia" <= 2
      AND s."createdAt" >= ${since}
    GROUP BY s."comercialId"
    HAVING COUNT(*) >= ${threshold}
  `;

  return Promise.all(
    raw.map(async (r) => ({
      ...r,
      comercialNombre: await resolveNombre(r.comercialId),
    })),
  );
}

async function fetchRecurrentBlockRows(
  now: Date,
  threshold: number,
  lookbackDays: number,
): Promise<RecurrentBlockRow[]> {
  const since = daysAgo(lookbackDays, now);

  const raw = await prisma.$queryRaw<
    { comercialId: string; blockCount: number; subtipos: string[] }[]
  >`
    SELECT
      s."comercialId",
      COUNT(*)::int AS "blockCount",
      ARRAY_AGG(DISTINCT s."subtipoBloqueo") FILTER (WHERE s."subtipoBloqueo" IS NOT NULL) AS "subtipos"
    FROM "mental_health_sessions" s
    WHERE
      s."comercialId" IS NOT NULL
      AND s."flujoActivo" = 'bloqueo'
      AND s."createdAt" >= ${since}
    GROUP BY s."comercialId"
    HAVING COUNT(*) >= ${threshold}
  `;

  return Promise.all(
    raw.map(async (r) => ({
      ...r,
      subtipos: r.subtipos ?? [],
      comercialNombre: await resolveNombre(r.comercialId),
    })),
  );
}

async function fetchOverloadRows(
  now: Date,
  overloadSessions: number,
  lookbackDays: number,
): Promise<OverloadRow[]> {
  const since = daysAgo(lookbackDays, now);

  const raw = await prisma.$queryRaw<
    { comercialId: string; sessionCount: number; avgEnergia: number }[]
  >`
    SELECT
      s."comercialId",
      COUNT(*)::int AS "sessionCount",
      ROUND(AVG(s."nivelEnergia")::numeric, 2)::float AS "avgEnergia"
    FROM "mental_health_sessions" s
    WHERE
      s."comercialId" IS NOT NULL
      AND s."nivelEnergia" IS NOT NULL
      AND s."nivelEnergia" <= 3
      AND s."createdAt" >= ${since}
    GROUP BY s."comercialId"
    HAVING COUNT(*) >= ${overloadSessions}
  `;

  return Promise.all(
    raw.map(async (r) => ({
      ...r,
      comercialNombre: await resolveNombre(r.comercialId),
    })),
  );
}

async function resolveNombre(comercialId: string): Promise<string> {
  try {
    const c = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { nombre: true },
    });
    return c?.nombre ?? comercialId;
  } catch {
    return comercialId;
  }
}

// ---------------------------------------------------------------------------
// Deduplicación: omitir alertas que ya existen recientemente
// ---------------------------------------------------------------------------

export async function deduplicateMentalHealthAlerts(
  candidates: MentalHealthAlertCandidate[],
  windowDays: number,
  now: Date,
): Promise<MentalHealthAlertCandidate[]> {
  if (candidates.length === 0) return [];

  const windowStart = daysAgo(windowDays, now);

  const recentAlerts = await prisma.dashboardAlert.findMany({
    where: {
      type: { in: ["energy_drop", "recurrent_block", "overload"] },
      createdAt: { gte: windowStart },
      resolvedAt: null,
    },
    select: {
      comercialId: true,
      type: true,
    },
  });

  const recentKeys = new Set(
    recentAlerts.map((a) => `${a.comercialId}:${a.type}`),
  );

  return candidates.filter(
    (c) => !recentKeys.has(`${c.comercialId}:${c.type}`),
  );
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function scanMentalHealthAlerts(
  now = new Date(),
): Promise<MentalHealthScanResult> {
  const config = getMentalHealthAlertConfig();

  const [energyRows, blockRows, overloadRows] = await Promise.all([
    fetchEnergyDropRows(now, config.energyDropThreshold, config.lookbackDays14),
    fetchRecurrentBlockRows(now, config.blockThreshold, config.lookbackDays14),
    fetchOverloadRows(now, config.overloadSessions, config.lookbackDays7),
  ]);

  const energyDropAlerts = detectEnergyDropFromRows(
    energyRows,
    config.energyDropThreshold,
    config.lookbackDays14,
  );
  const recurrentBlockAlerts = detectRecurrentBlockFromRows(
    blockRows,
    config.blockThreshold,
    config.lookbackDays14,
  );
  const overloadAlerts = detectOverloadFromRows(
    overloadRows,
    config.overloadSessions,
    config.lookbackDays7,
  );

  const allCandidates = [
    ...energyDropAlerts,
    ...recurrentBlockAlerts,
    ...overloadAlerts,
  ];

  const totalBeforeDedup = allCandidates.length;
  const deduplicated = await deduplicateMentalHealthAlerts(
    allCandidates,
    config.deduplicationWindowDays,
    now,
  );

  return {
    alerts: deduplicated,
    energyDropCount: energyDropAlerts.length,
    recurrentBlockCount: recurrentBlockAlerts.length,
    overloadCount: overloadAlerts.length,
    deduplicatedCount: totalBeforeDedup - deduplicated.length,
  };
}
