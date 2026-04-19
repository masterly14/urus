import { prisma } from "@/lib/prisma";
import { computePoints, RANGES } from "./rules";
import { invalidateWeightsCache, DEFAULT_WEIGHTS } from "./weights-loader";
import type { ScoringInput, LeadTipo } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface LabeledSample {
  pclose: number;
  value: number;
  urgency: number;
  closed: boolean;
}

export interface RecalibrationResult {
  version: number;
  weightPclose: number;
  weightValue: number;
  weightUrgency: number;
  sampleSize: number;
  accuracy: number;
  backtestScore: number;
  improved: boolean;
  activated: boolean;
}

// ── Config ──────────────────────────────────────────────────────────────────

const MIN_SAMPLE_SIZE = 50;
const MIN_IMPROVEMENT = 0.02;
const LEARNING_RATE = 0.01;
const ITERATIONS = 500;

// ── Data collection ─────────────────────────────────────────────────────────

/**
 * Builds labeled samples by joining CommercialLeadFact with
 * CommercialOperationFact. A lead is "closed" if its `inmovillaDemandId`
 * matches the `demandId` of any `CommercialOperationFact` row
 * (ambos en el ID-space de Inmovilla).
 *
 * Nota: leads sin `inmovillaDemandId` (p. ej. web forms sin demanda en Inmovilla)
 * se etiquetan como no-cerrados. Para esos leads no tenemos señal de cierre fiable.
 */
export async function collectLabeledSamples(): Promise<LabeledSample[]> {
  const [leadFacts, opFacts] = await Promise.all([
    prisma.commercialLeadFact.findMany({
      where: { score: { not: null } },
      select: { leadId: true, inmovillaDemandId: true, raw: true, tipo: true },
    }),
    prisma.commercialOperationFact.findMany({
      select: { demandId: true },
    }),
  ]);

  const closedDemandIds = new Set(
    opFacts.map((o) => o.demandId).filter((id): id is string => id != null && id !== ""),
  );

  const samples: LabeledSample[] = [];

  for (const lead of leadFacts) {
    const raw = (lead.raw ?? {}) as Record<string, unknown>;
    const tipo = (lead.tipo || "comprador") as LeadTipo;

    const input: ScoringInput = {
      tipo,
      preaprobacionHipotecaria: Boolean(raw.preaprobacionHipotecaria),
      presupuestoDefinido: Boolean(raw.presupuestoDefinido),
      plazoDias: typeof raw.plazoDias === "number" ? raw.plazoDias : undefined,
      mensajeConDetalles: Boolean(raw.mensajeConDetalles),
      referido: Boolean(raw.referido),
      soloMirando: Boolean(raw.soloMirando),
      urgenciaVenta: Boolean(raw.urgenciaVenta),
      precioCercanoMercado: Boolean(raw.precioCercanoMercado),
      exclusivaAceptable: Boolean(raw.exclusivaAceptable),
      documentacionDisponible: Boolean(raw.documentacionDisponible),
      probarSinAgencia: Boolean(raw.probarSinAgencia),
    };

    const points = computePoints(input);
    const ranges = RANGES[tipo];

    const pclose = normalize(points.pclose, ranges.pclose.min, ranges.pclose.max);
    const value = normalize(points.value, ranges.value.min, ranges.value.max);
    const urgency = normalize(points.urgency, ranges.urgency.min, ranges.urgency.max);

    const closed =
      lead.inmovillaDemandId != null && closedDemandIds.has(lead.inmovillaDemandId);

    samples.push({ pclose, value, urgency, closed });
  }

  return samples;
}

// ── Logistic regression ─────────────────────────────────────────────────────

function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Simple logistic regression via gradient descent on 3 features.
 * Returns raw coefficients (not normalized to sum=1).
 */
export function fitLogisticRegression(
  samples: LabeledSample[],
): { w1: number; w2: number; w3: number; bias: number } {
  let w1 = 0.55;
  let w2 = 0.3;
  let w3 = 0.15;
  let bias = 0;
  const n = samples.length;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let dw1 = 0, dw2 = 0, dw3 = 0, db = 0;

    for (const s of samples) {
      const z = w1 * s.pclose + w2 * s.value + w3 * s.urgency + bias;
      const pred = sigmoid(z);
      const err = pred - (s.closed ? 1 : 0);
      dw1 += err * s.pclose;
      dw2 += err * s.value;
      dw3 += err * s.urgency;
      db += err;
    }

    w1 -= LEARNING_RATE * (dw1 / n);
    w2 -= LEARNING_RATE * (dw2 / n);
    w3 -= LEARNING_RATE * (dw3 / n);
    bias -= LEARNING_RATE * (db / n);
  }

  return { w1, w2, w3, bias };
}

/**
 * Converts raw logistic regression coefficients to normalized weights.
 *
 * H23: la normalización preserva el signo del coeficiente original. Un coeficiente
 * negativo indica una relación inversa entre el feature y el cierre (más del feature
 * reduce la probabilidad de cierre) y es semánticamente significativo — no puede
 * colapsarse a un peso positivo.
 *
 * Escala: cada peso vale `sign(w_i) * (|w_i| / sum(|w_j|))`, por lo que la magnitud
 * total sigue sumando 1 (Σ|wᵢ| = 1) pero la dirección de cada feature se preserva.
 */
export function normalizeCoefficients(
  w1: number,
  w2: number,
  w3: number,
): { pclose: number; value: number; urgency: number } {
  const abs1 = Math.abs(w1);
  const abs2 = Math.abs(w2);
  const abs3 = Math.abs(w3);
  const total = abs1 + abs2 + abs3;

  if (total === 0) {
    return { pclose: DEFAULT_WEIGHTS.pclose, value: DEFAULT_WEIGHTS.value, urgency: DEFAULT_WEIGHTS.urgency };
  }

  const normalize = (w: number, abs: number): number => {
    const sign = w < 0 ? -1 : 1;
    return Math.round(sign * (abs / total) * 100) / 100;
  };

  return {
    pclose: normalize(w1, abs1),
    value: normalize(w2, abs2),
    urgency: normalize(w3, abs3),
  };
}

// ── Backtesting ─────────────────────────────────────────────────────────────

/**
 * Compute Brier score (lower is better) — measures calibration quality.
 * Brier = (1/N) * sum((predicted - actual)^2)
 */
export function brierScore(
  samples: LabeledSample[],
  weights: { pclose: number; value: number; urgency: number },
): number {
  if (samples.length === 0) return 1;

  let sum = 0;
  for (const s of samples) {
    const score = (weights.pclose * s.pclose + weights.value * s.value + weights.urgency * s.urgency) / 100;
    const actual = s.closed ? 1 : 0;
    sum += (score - actual) ** 2;
  }

  return sum / samples.length;
}

/**
 * Compute accuracy: % of samples where high score (>=50) matches closed.
 */
export function computeAccuracy(
  samples: LabeledSample[],
  weights: { pclose: number; value: number; urgency: number },
): number {
  if (samples.length === 0) return 0;

  let correct = 0;
  for (const s of samples) {
    const score = weights.pclose * s.pclose + weights.value * s.value + weights.urgency * s.urgency;
    const predicted = score >= 50;
    const actual = s.closed;
    if (predicted === actual) correct++;
  }

  return correct / samples.length;
}

// ── Main pipeline ───────────────────────────────────────────────────────────

export async function runRecalibration(
  forceActivate = false,
): Promise<RecalibrationResult> {
  const samples = await collectLabeledSamples();

  if (samples.length < MIN_SAMPLE_SIZE) {
    throw new Error(
      `Muestra insuficiente: ${samples.length} < ${MIN_SAMPLE_SIZE} mínimo requerido`,
    );
  }

  const { w1, w2, w3 } = fitLogisticRegression(samples);
  const newWeights = normalizeCoefficients(w1, w2, w3);

  const currentWeights = {
    pclose: DEFAULT_WEIGHTS.pclose,
    value: DEFAULT_WEIGHTS.value,
    urgency: DEFAULT_WEIGHTS.urgency,
  };

  const activeVersion = await prisma.scoringModelVersion.findFirst({
    where: { activatedAt: { not: null } },
    orderBy: { version: "desc" },
  });

  if (activeVersion) {
    currentWeights.pclose = activeVersion.weightPclose;
    currentWeights.value = activeVersion.weightValue;
    currentWeights.urgency = activeVersion.weightUrgency;
  }

  const currentBrier = brierScore(samples, currentWeights);
  const newBrier = brierScore(samples, newWeights);
  const accuracy = computeAccuracy(samples, newWeights);

  const improvement = currentBrier - newBrier;
  const improved = improvement >= MIN_IMPROVEMENT;

  const lastVersion = await prisma.scoringModelVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const shouldActivate = forceActivate || improved;

  const record = await prisma.scoringModelVersion.create({
    data: {
      version: nextVersion,
      weightPclose: newWeights.pclose,
      weightValue: newWeights.value,
      weightUrgency: newWeights.urgency,
      sampleSize: samples.length,
      accuracy,
      backtestScore: newBrier,
      metadata: {
        currentBrier,
        newBrier,
        improvement,
        currentWeights,
        newWeights,
      },
      activatedAt: shouldActivate ? new Date() : null,
    },
  });

  if (shouldActivate) {
    invalidateWeightsCache();
  }

  console.log(
    `[recalibration] v${nextVersion}: brier ${currentBrier.toFixed(4)} → ${newBrier.toFixed(4)} ` +
    `(Δ${improvement.toFixed(4)}) accuracy=${(accuracy * 100).toFixed(1)}% ` +
    `weights=[${newWeights.pclose},${newWeights.value},${newWeights.urgency}] ` +
    `activated=${shouldActivate}`,
  );

  return {
    version: nextVersion,
    weightPclose: newWeights.pclose,
    weightValue: newWeights.value,
    weightUrgency: newWeights.urgency,
    sampleSize: samples.length,
    accuracy,
    backtestScore: newBrier,
    improved,
    activated: shouldActivate,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(sum: number, min: number, max: number): number {
  if (max === min) return clamp(sum, 0, 100);
  const ratio = (sum - min) / (max - min);
  return clamp(Math.round(ratio * 100));
}

function clamp(n: number, a = 0, b = 100) {
  if (Number.isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}
