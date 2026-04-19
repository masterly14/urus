import type { SlaAssignment, ScoredLeadSla, FollowUpStep } from "./types";

const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

export const MAX_RESPONSE_INFINITE = Number.MAX_SAFE_INTEGER;

const SLA_TIERS: { minScore: number; assignment: SlaAssignment }[] = [
  {
    minScore: 80,
    assignment: {
      level: "CRITICAL",
      maxResponseMs: 5 * MS_MIN,
      description: "Score ≥80 — respuesta <5 min",
    },
  },
  {
    minScore: 60,
    assignment: {
      level: "HIGH",
      maxResponseMs: 30 * MS_MIN,
      description: "Score 60–79 — respuesta <30 min",
    },
  },
  {
    minScore: 40,
    assignment: {
      level: "MEDIUM",
      maxResponseMs: 2 * MS_HOUR,
      description: "Score 40–59 — respuesta <2 h",
    },
  },
  {
    minScore: 0,
    assignment: {
      level: "LOW",
      maxResponseMs: MAX_RESPONSE_INFINITE,
      description: "Score <40 — cadencia automática",
    },
  },
];

const DEFAULT_CADENCE: FollowUpStep[] = [
  { delayMs: 1 * MS_DAY, label: "D+1" },
  { delayMs: 3 * MS_DAY, label: "D+3" },
  { delayMs: 7 * MS_DAY, label: "D+7" },
];

export function assignSla(score: number): ScoredLeadSla {
  const tier = SLA_TIERS.find((t) => score >= t.minScore) ?? SLA_TIERS[SLA_TIERS.length - 1];

  const notifyImmediately = tier.assignment.level !== "LOW";
  const followUpCadence = tier.assignment.level === "LOW" ? DEFAULT_CADENCE : null;

  return {
    score,
    sla: tier.assignment,
    notifyImmediately,
    followUpCadence,
  };
}

export { SLA_TIERS, DEFAULT_CADENCE };
