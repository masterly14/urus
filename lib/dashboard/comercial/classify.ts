import type { ComercialesDashboardRow } from "./queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComercialProfile =
  | "top_performer"
  | "productivo_ineficiente"
  | "dependiente_lead_caliente"
  | "bajo_rendimiento_estructural"
  | "sin_datos_suficientes";

export const CLASIFICABLE_PROFILES = [
  "top_performer",
  "productivo_ineficiente",
  "dependiente_lead_caliente",
  "bajo_rendimiento_estructural",
] as const;

export type ClasificableProfile = (typeof CLASIFICABLE_PROFILES)[number];

export type TeamAverages = {
  conversionLV: number;
  conversionVC: number;
  revenuePerLead: number;
  revenuePerOperation: number;
  lostLeadRate: number;
  avgCloseDays: number | null;
  leadsAssigned: number;
  visits: number;
};

export type LeadScoreStats = {
  comercialId: string;
  totalLeads: number;
  highScoreLeads: number;
  contactedTotal: number;
  contactedHighScore: number;
};

export type ClassificationResult = {
  profile: ComercialProfile;
  confidence: number;
  scores: Record<ClasificableProfile, number>;
};

export type ClassifiedRow = ComercialesDashboardRow & {
  classification: ClassificationResult;
};

// ---------------------------------------------------------------------------
// Config (env-configurable with sane defaults)
// ---------------------------------------------------------------------------

export function getClassifyConfig() {
  return {
    minLeads: envInt("CLASSIFY_MIN_LEADS", 3),
    topMinConvLV: envFloat("CLASSIFY_TOP_MIN_CONV_LV", 0.10),
    topMinConvVC: envFloat("CLASSIFY_TOP_MIN_CONV_VC", 0.15),
    hotLeadBiasThreshold: envFloat("CLASSIFY_HOT_LEAD_BIAS_THRESHOLD", 1.5),
  };
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Team averages (only from rows with enough leads)
// ---------------------------------------------------------------------------

export function computeTeamAverages(
  rows: ComercialesDashboardRow[],
  minLeads: number,
): TeamAverages {
  const eligible = rows.filter((r) => r.leadsAssigned >= minLeads);

  if (eligible.length === 0) {
    return {
      conversionLV: 0,
      conversionVC: 0,
      revenuePerLead: 0,
      revenuePerOperation: 0,
      lostLeadRate: 0,
      avgCloseDays: null,
      leadsAssigned: 0,
      visits: 0,
    };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const closeDaysValues = eligible
    .map((r) => r.avgCloseDays)
    .filter((d): d is number => d != null && d > 0);

  return {
    conversionLV: avg(eligible.map((r) => r.conversionLeadToVisit)),
    conversionVC: avg(eligible.map((r) => r.conversionVisitToClose)),
    revenuePerLead: avg(eligible.map((r) => r.revenuePerLeadAssignedEur)),
    revenuePerOperation: avg(eligible.map((r) => r.revenuePerOperationEur)),
    lostLeadRate: avg(eligible.map((r) => r.lostLeadRate)),
    avgCloseDays: closeDaysValues.length > 0 ? avg(closeDaysValues) : null,
    leadsAssigned: avg(eligible.map((r) => r.leadsAssigned)),
    visits: avg(eligible.map((r) => r.visits)),
  };
}

// ---------------------------------------------------------------------------
// Hot-lead contact bias
// ---------------------------------------------------------------------------

export function computeHotLeadBias(stats: LeadScoreStats | undefined): number {
  if (
    !stats ||
    stats.totalLeads === 0 ||
    stats.highScoreLeads === 0 ||
    stats.contactedTotal === 0
  ) {
    return 0;
  }

  const baseHighRatio = stats.highScoreLeads / stats.totalLeads;
  if (baseHighRatio === 0) return 0;

  const contactedHighRatio = stats.contactedHighScore / stats.contactedTotal;
  return contactedHighRatio / baseHighRatio;
}

// ---------------------------------------------------------------------------
// Per-profile scoring functions
// ---------------------------------------------------------------------------

function safeRatio(value: number, base: number): number {
  if (base <= 0) return value > 0 ? 2.0 : 1.0;
  return value / base;
}

function inverseRatio(value: number, base: number): number {
  if (base <= 0) return 1.0;
  if (value <= 0) return 2.0;
  return base / value;
}

function scoreTopPerformer(
  row: ComercialesDashboardRow,
  team: TeamAverages,
  config: ReturnType<typeof getClassifyConfig>,
): number {
  if (
    row.conversionLeadToVisit < config.topMinConvLV ||
    row.conversionVisitToClose < config.topMinConvVC
  ) {
    return 0;
  }

  const convLV = safeRatio(row.conversionLeadToVisit, team.conversionLV);
  const convVC = safeRatio(row.conversionVisitToClose, team.conversionVC);
  const revPerLead = safeRatio(row.revenuePerLeadAssignedEur, team.revenuePerLead);
  const lowLost = team.lostLeadRate > 0
    ? safeRatio(team.lostLeadRate, Math.max(row.lostLeadRate, 0.001))
    : row.lostLeadRate === 0 ? 1.5 : 1.0;

  const allAboveAvg =
    convLV >= 1.0 && convVC >= 1.0 && revPerLead >= 0.8;

  if (!allAboveAvg) return 0;

  return (convLV + convVC + revPerLead + lowLost) / 4;
}

function scoreProductivoIneficiente(
  row: ComercialesDashboardRow,
  team: TeamAverages,
): number {
  const activityLeads = safeRatio(row.leadsAssigned, team.leadsAssigned);
  const activityVisits = safeRatio(row.visits, team.visits);
  const highActivity = Math.max(activityLeads, activityVisits);

  if (highActivity < 0.8) return 0;

  const lowConvLV = inverseRatio(row.conversionLeadToVisit, team.conversionLV);
  const lowConvVC = inverseRatio(row.conversionVisitToClose, team.conversionVC);

  const hasLowConversion = lowConvLV > 1.0 || lowConvVC > 1.0;
  if (!hasLowConversion) return 0;

  return (highActivity + lowConvLV + lowConvVC) / 3;
}

function scoreDependienteLeadCaliente(
  row: ComercialesDashboardRow,
  team: TeamAverages,
  hotLeadBias: number,
  biasThreshold: number,
): number {
  const hasHighBias = hotLeadBias >= biasThreshold;

  const highRevPerOp = safeRatio(row.revenuePerOperationEur, team.revenuePerOperation);
  const lowConvLV = inverseRatio(row.conversionLeadToVisit, team.conversionLV);

  const selectiveContact = hasHighBias ? hotLeadBias : 0;

  if (!hasHighBias && highRevPerOp < 1.2) return 0;

  const biasWeight = hasHighBias ? 0.5 : 0.0;
  const revWeight = hasHighBias ? 0.25 : 0.5;
  const convWeight = hasHighBias ? 0.25 : 0.5;

  return (
    selectiveContact * biasWeight +
    highRevPerOp * revWeight +
    lowConvLV * convWeight
  );
}

function scoreBajoRendimiento(
  row: ComercialesDashboardRow,
  team: TeamAverages,
): number {
  const lowConvLV = inverseRatio(row.conversionLeadToVisit, team.conversionLV);
  const highLost = safeRatio(row.lostLeadRate, team.lostLeadRate);
  const lowRevPerLead = inverseRatio(row.revenuePerLeadAssignedEur, team.revenuePerLead);

  const isBadOverall =
    lowConvLV > 1.0 && (highLost > 1.0 || lowRevPerLead > 1.0);

  if (!isBadOverall) return 0;

  return (lowConvLV + highLost + lowRevPerLead) / 3;
}

// ---------------------------------------------------------------------------
// Normalize scores to [0, 1]
// ---------------------------------------------------------------------------

function normalizeScores(
  raw: Record<ClasificableProfile, number>,
): Record<ClasificableProfile, number> {
  const max = Math.max(...Object.values(raw), 0.001);
  return {
    top_performer: raw.top_performer / max,
    productivo_ineficiente: raw.productivo_ineficiente / max,
    dependiente_lead_caliente: raw.dependiente_lead_caliente / max,
    bajo_rendimiento_estructural: raw.bajo_rendimiento_estructural / max,
  };
}

// ---------------------------------------------------------------------------
// Single comercial classification
// ---------------------------------------------------------------------------

export function classifyComercial(
  row: ComercialesDashboardRow,
  team: TeamAverages,
  leadScoreStats: LeadScoreStats | undefined,
  config = getClassifyConfig(),
): ClassificationResult {
  if (row.leadsAssigned < config.minLeads) {
    return {
      profile: "sin_datos_suficientes",
      confidence: 1,
      scores: {
        top_performer: 0,
        productivo_ineficiente: 0,
        dependiente_lead_caliente: 0,
        bajo_rendimiento_estructural: 0,
      },
    };
  }

  const hotLeadBias = computeHotLeadBias(leadScoreStats);

  const rawScores: Record<ClasificableProfile, number> = {
    top_performer: scoreTopPerformer(row, team, config),
    productivo_ineficiente: scoreProductivoIneficiente(row, team),
    dependiente_lead_caliente: scoreDependienteLeadCaliente(
      row,
      team,
      hotLeadBias,
      config.hotLeadBiasThreshold,
    ),
    bajo_rendimiento_estructural: scoreBajoRendimiento(row, team),
  };

  const scores = normalizeScores(rawScores);

  const sorted = CLASIFICABLE_PROFILES
    .map((p) => ({ profile: p, score: scores[p] }))
    .sort((a, b) => b.score - a.score);

  const allZero = sorted[0].score === 0;
  if (allZero) {
    return {
      profile: "sin_datos_suficientes",
      confidence: 0,
      scores,
    };
  }

  const confidence = sorted[0].score - sorted[1].score;

  return {
    profile: sorted[0].profile,
    confidence: Math.round(confidence * 100) / 100,
    scores,
  };
}

// ---------------------------------------------------------------------------
// Batch classification
// ---------------------------------------------------------------------------

export function classifyTeam(
  rows: ComercialesDashboardRow[],
  leadScoreStatsMap: Map<string, LeadScoreStats>,
  config = getClassifyConfig(),
): ClassifiedRow[] {
  const team = computeTeamAverages(rows, config.minLeads);

  return rows.map((row) => ({
    ...row,
    classification: classifyComercial(
      row,
      team,
      leadScoreStatsMap.get(row.comercialId),
      config,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const PROFILE_LABELS: Record<ComercialProfile, string> = {
  top_performer: "Top Performer",
  productivo_ineficiente: "Productivo Ineficiente",
  dependiente_lead_caliente: "Dep. Lead Caliente",
  bajo_rendimiento_estructural: "Bajo Rendimiento",
  sin_datos_suficientes: "Sin datos",
};

export const PROFILE_SHORT_LABELS: Record<ComercialProfile, string> = {
  top_performer: "Top",
  productivo_ineficiente: "Ineficiente",
  dependiente_lead_caliente: "Dep. Lead",
  bajo_rendimiento_estructural: "Bajo Rend.",
  sin_datos_suficientes: "Sin datos",
};
