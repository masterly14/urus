/**
 * Orchestrator de evaluación conversacional.
 *
 * Ejecuta escenarios del agente conversacional con:
 * - N trials por escenario (para capturar varianza del modelo)
 * - Mock tools (sin side-effects en BD)
 * - Graders deterministas + LLM judge
 * - Métricas agregadas: pass@k, pass^k, scores por categoría
 */

import { runConversationalAgentSandboxed } from "@/lib/agents/conversational-sandbox";
import type {
  ConversationalAgentInput,
  ConversationalAgentOutput,
} from "@/lib/agents/conversational-agent-types";
import type { ConversationTurn } from "@/lib/agents/types";
import { generateBuyerMessage } from "./buyer-agent";
import { runDeterministicGraders } from "./conversational-graders";
import { evaluateConversationalResponse } from "./conversational-judge";
import {
  ALL_CONVERSATIONAL_SCENARIOS,
  REGRESSION_SCENARIOS,
} from "./scenarios/conversational";
import type {
  ConversationalEvalScenario,
  ConversationalEvalConfig,
  ConversationalTrial,
  ConversationalScenarioResult,
  ConversationalRunSummary,
  ConversationalCategorySummary,
  ConversationalEvalCategory,
  EvalConversationTurn,
} from "./conversational-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toConversationTurns(turns: EvalConversationTurn[]): ConversationTurn[] {
  return turns.map((t) => ({
    role: t.role,
    text: t.text ?? t.content ?? "",
    timestamp: t.timestamp ?? "2026-01-01T00:00:00Z",
  }));
}

// La ejecución sandboxed del agente vive en `lib/agents/conversational-sandbox.ts`
// para poder reutilizarla desde la API del chat interactivo sin duplicar el loop ReAct.
const executeConversationalTurn = runConversationalAgentSandboxed;

// ── Process single trial ────────────────────────────────────────────────────

async function executeTrial(
  scenario: ConversationalEvalScenario,
  buyerMessage: string,
  trialIndex: number,
  config: ConversationalEvalConfig,
): Promise<ConversationalTrial> {
  const input: ConversationalAgentInput = {
    messageText: buyerMessage,
    buyerWaId: "eval-synthetic",
    demandId: `eval-conv-${scenario.id}`,
    selectionId: null,
    properties: scenario.properties,
    conversationHistory: toConversationTurns(scenario.conversationHistory),
    buyerDigest: scenario.buyerDigest,
    conversationPhase: scenario.conversationPhase,
  };

  const startMs = Date.now();
  const agentOutput = await executeConversationalTurn(input);
  const latencyMs = Date.now() - startMs;

  const graderResults = runDeterministicGraders(
    agentOutput,
    scenario,
    latencyMs,
    config.maxLatencyMs,
  );

  let judgeEvaluation = null;
  try {
    judgeEvaluation = await evaluateConversationalResponse({
      scenario,
      buyerMessage,
      agentOutput,
      properties: scenario.properties,
    });
  } catch (err) {
    console.error(`  [Trial ${trialIndex}] Judge error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const graderAvg = graderResults.length > 0
    ? graderResults.reduce((sum, g) => sum + g.score, 0) / graderResults.length
    : 1.0;

  const judgeScore = judgeEvaluation?.overallConversationalScore ?? 0;

  const GRADER_WEIGHT = 0.4;
  const JUDGE_WEIGHT = 0.6;
  const overallScore = judgeEvaluation
    ? graderAvg * GRADER_WEIGHT + judgeScore * JUDGE_WEIGHT
    : graderAvg;

  const passed = overallScore >= config.passThreshold &&
    graderResults.every((g) => g.name === "latencyGrader" || g.passed);

  return {
    trialIndex,
    buyerMessage,
    agentOutput,
    graderResults,
    judgeEvaluation,
    nluJudgeScore: null,
    overallScore: Math.round(overallScore * 1000) / 1000,
    latencyMs,
    passed,
  };
}

// ── Process single scenario ─────────────────────────────────────────────────

async function processScenario(
  scenario: ConversationalEvalScenario,
  config: ConversationalEvalConfig,
): Promise<ConversationalScenarioResult> {
  let buyerMessage: string;

  if (scenario.fixedMessage) {
    buyerMessage = scenario.fixedMessage;
  } else {
    const buyerOutput = await generateBuyerMessage({
      persona: scenario.persona,
      properties: scenario.properties,
      scenario: scenario as any,
      turnNumber: 1,
      previousTurns: toConversationTurns(scenario.conversationHistory),
    });
    buyerMessage = buyerOutput.messageText;
  }

  const trials: ConversationalTrial[] = [];
  for (let i = 0; i < config.trialsPerScenario; i++) {
    try {
      const trial = await executeTrial(scenario, buyerMessage, i, config);
      trials.push(trial);
    } catch (err) {
      console.error(`  [${scenario.id}] Trial ${i} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const passAtK = trials.some((t) => t.passed);
  const passAllK = trials.length > 0 && trials.every((t) => t.passed);
  const avgOverallScore = trials.length > 0
    ? trials.reduce((sum, t) => sum + t.overallScore, 0) / trials.length
    : 0;
  const avgLatencyMs = trials.length > 0
    ? trials.reduce((sum, t) => sum + t.latencyMs, 0) / trials.length
    : 0;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    category: scenario.category,
    trials,
    passAtK,
    passAllK,
    avgOverallScore: Math.round(avgOverallScore * 1000) / 1000,
    avgLatencyMs: Math.round(avgLatencyMs),
  };
}

// ── Build run summary ───────────────────────────────────────────────────────

function buildRunSummary(
  runId: string,
  name: string,
  startedAt: Date,
  results: ConversationalScenarioResult[],
  config: ConversationalEvalConfig,
): ConversationalRunSummary {
  const n = results.length;
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const allTrials = results.flatMap((r) => r.trials);

  const categoryMap = new Map<ConversationalEvalCategory, ConversationalScenarioResult[]>();
  for (const r of results) {
    if (!categoryMap.has(r.category)) categoryMap.set(r.category, []);
    categoryMap.get(r.category)!.push(r);
  }

  const byCategory: ConversationalCategorySummary[] = [...categoryMap.entries()].map(
    ([category, items]) => ({
      category,
      count: items.length,
      avgScore: avg(items.map((i) => i.avgOverallScore)),
      passRate: items.filter((i) => i.passAtK).length / items.length,
      avgLatencyMs: avg(items.map((i) => i.avgLatencyMs)),
    }),
  );

  const failureCounts = new Map<string, number>();
  for (const trial of allTrials) {
    for (const g of trial.graderResults) {
      if (!g.passed && g.details) {
        failureCounts.set(g.details, (failureCounts.get(g.details) ?? 0) + 1);
      }
    }
    if (trial.judgeEvaluation) {
      for (const f of trial.judgeEvaluation.failures) {
        failureCounts.set(f, (failureCounts.get(f) ?? 0) + 1);
      }
    }
  }

  const topFailures = [...failureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([failure, count]) => ({ failure, count }));

  const judgeTrials = allTrials.filter((t) => t.judgeEvaluation);

  return {
    runId,
    name,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    scenarioCount: n,
    trialCount: allTrials.length,
    trialsPerScenario: config.trialsPerScenario,
    avgOverallScore: avg(results.map((r) => r.avgOverallScore)),
    passAtKRate: n > 0 ? results.filter((r) => r.passAtK).length / n : 0,
    passAllKRate: n > 0 ? results.filter((r) => r.passAllK).length / n : 0,
    avgLatencyMs: avg(results.map((r) => r.avgLatencyMs)),
    avgResponseRelevance: avg(judgeTrials.map((t) => t.judgeEvaluation!.responseRelevanceScore)),
    avgTone: avg(judgeTrials.map((t) => t.judgeEvaluation!.toneScore)),
    avgActionability: avg(judgeTrials.map((t) => t.judgeEvaluation!.actionabilityScore)),
    avgCoherence: avg(judgeTrials.map((t) => t.judgeEvaluation!.coherenceScore)),
    avgSafety: avg(judgeTrials.map((t) => t.judgeEvaluation!.safetyScore)),
    byCategory,
    topFailures,
    results,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ConversationalEvalOptions {
  name: string;
  config?: Partial<ConversationalEvalConfig>;
  scenarios?: ConversationalEvalScenario[];
  categories?: ConversationalEvalCategory[];
  concurrency?: number;
}

export async function runConversationalEval(
  options: ConversationalEvalOptions,
): Promise<ConversationalRunSummary> {
  const config: ConversationalEvalConfig = {
    trialsPerScenario: options.config?.trialsPerScenario ?? 3,
    passThreshold: options.config?.passThreshold ?? 0.7,
    maxLatencyMs: options.config?.maxLatencyMs ?? 15_000,
    regressionOnly: options.config?.regressionOnly ?? false,
    categories: options.categories ?? options.config?.categories,
  };

  let scenarios: ConversationalEvalScenario[];
  if (options.scenarios) {
    scenarios = options.scenarios;
  } else if (config.regressionOnly) {
    scenarios = REGRESSION_SCENARIOS;
  } else {
    scenarios = ALL_CONVERSATIONAL_SCENARIOS;
  }

  if (config.categories && config.categories.length > 0) {
    scenarios = scenarios.filter((s) => config.categories!.includes(s.category));
  }

  const concurrency = options.concurrency ?? 2;
  const runId = `conv-eval-${Date.now()}`;
  const startedAt = new Date();

  console.log(`\n=== Conversational Eval: ${options.name} (${runId}) ===`);
  console.log(`Escenarios: ${scenarios.length} | Trials/escenario: ${config.trialsPerScenario} | Concurrencia: ${concurrency}\n`);

  const results: ConversationalScenarioResult[] = [];
  const queue = [...scenarios];
  const errors: Array<{ scenarioId: string; error: string }> = [];

  async function worker() {
    while (queue.length > 0) {
      const scenario = queue.shift();
      if (!scenario) break;
      try {
        const result = await processScenario(scenario, config);
        results.push(result);
        const status = result.passAtK ? "PASS" : "FAIL";
        console.log(
          `  [${scenario.id}] ${status} — avg=${result.avgOverallScore.toFixed(3)} latency=${result.avgLatencyMs}ms`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [${scenario.id}] ERROR: ${msg}`);
        errors.push({ scenarioId: scenario.id, error: msg });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const summary = buildRunSummary(runId, options.name, startedAt, results, config);

  console.log(`\n=== Resultados ===`);
  console.log(`Pass@k rate: ${(summary.passAtKRate * 100).toFixed(1)}%`);
  console.log(`Pass^k rate: ${(summary.passAllKRate * 100).toFixed(1)}%`);
  console.log(`Avg score: ${summary.avgOverallScore.toFixed(3)}`);
  console.log(`Avg latency: ${summary.avgLatencyMs.toFixed(0)}ms`);
  if (summary.topFailures.length > 0) {
    console.log(`Top failures:`);
    for (const f of summary.topFailures.slice(0, 5)) {
      console.log(`  - (${f.count}x) ${f.failure}`);
    }
  }

  return summary;
}
