export type SlaLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface SlaAssignment {
  level: SlaLevel;
  maxResponseMs: number;
  description: string;
}

export interface ScoredLeadSla {
  score: number;
  sla: SlaAssignment;
  notifyImmediately: boolean;
  followUpCadence: FollowUpStep[] | null;
}

export interface FollowUpStep {
  delayMs: number;
  label: string;
}
