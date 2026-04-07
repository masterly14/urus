import type { ScoringInput } from "./types";
import type { ScoringWeights } from "./weights-loader";

export interface HistoricalStats {
  conversionRateByCity: Record<string, number>;
  conversionRateBySource: Record<string, number>;
  avgScoreClosedLeads: number | null;
  avgScoreOpenLeads: number | null;
  totalClosedLeads: number;
  totalOpenLeads: number;
}

export interface AIScoringGraphInput {
  leadData: ScoringInput;
  mensajeRaw: string | null;
  ciudad: string;
  source: string;
  historicalStats: HistoricalStats;
  currentWeights: ScoringWeights;
  ruleSubScores: {
    pclose: number;
    value: number;
    urgency: number;
  };
}

export interface AIScoringResult {
  pcloseAdjustment: number;
  valueAdjustment: number;
  urgencyAdjustment: number;
  qualitativeSignals: string[];
  confidence: number;
  reasoning: string;
}
