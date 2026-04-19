import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyBuyerFeedback } from "@/lib/agents";
import { generateBuyerMessage } from "./buyer-agent";
import { evaluateNLUResult } from "./judge";
import { ALL_SCENARIOS } from "./scenarios";
import { ALL_PERSONAS } from "./personas";
import type {
  EvalScenario,
  BuyerPersona,
  RunSummary,
  CategorySummary,
  PersonaSummary,
  EvalScenarioCategory,
} from "./types";

export interface RunEvaluationOptions {
  name: string;
  scenarios?: EvalScenario[];
  personas?: BuyerPersona[];
  concurrency?: number;
  limit?: number;
}

async function processScenario(
  runId: string,
  scenario: EvalScenario,
): Promise<void> {
  const buyerOutput = await generateBuyerMessage({
    persona: scenario.persona,
    properties: scenario.properties,
    scenario,
    turnNumber: scenario.turns ?? 1,
    previousTurns: scenario.conversationHistory,
  });

  const startMs = Date.now();
  const nluResult = await classifyBuyerFeedback({
    messageText: buyerOutput.messageText,
    buyerPhone: "eval-synthetic",
    demandId: `eval-${scenario.id}`,
    selectionProperties: scenario.properties,
    conversationHistory: scenario.conversationHistory,
  });
  const latencyMs = Date.now() - startMs;

  const evaluation = await evaluateNLUResult({
    scenario,
    buyerMessage: buyerOutput.messageText,
    nluResult,
    properties: scenario.properties,
    expectedOutcome: scenario.expectedOutcome,
  });

  await prisma.evalResult.create({
    data: {
      runId,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      category: scenario.category,
      personaId: scenario.persona.id,
      buyerMessage: buyerOutput.messageText,
      nluOutput: nluResult as unknown as Prisma.InputJsonValue,
      propertyResolutionScore: evaluation.propertyResolutionScore,
      sentimentAccuracyScore: evaluation.sentimentAccuracyScore,
      variableExtractionScore: evaluation.variableExtractionScore,
      intentionScore: evaluation.intentionScore,
      wantsMoreScore: evaluation.wantsMoreScore,
      hallucinationPenalty: evaluation.hallucinationPenalty,
      overallScore: evaluation.overallScore,
      judgeReasoning: evaluation.reasoning,
      failures: evaluation.failures,
      latencyMs,
    },
  });

  console.log(
    `  [${scenario.id}] ${scenario.name} — score=${evaluation.overallScore.toFixed(3)} latency=${latencyMs}ms${evaluation.failures.length > 0 ? ` failures=${evaluation.failures.length}` : ""}`,
  );
}

function buildSummary(
  runId: string,
  name: string,
  results: Array<{
    category: string;
    personaId: string;
    overallScore: number;
    propertyResolutionScore: number;
    sentimentAccuracyScore: number;
    variableExtractionScore: number;
    intentionScore: number;
    wantsMoreScore: number;
    hallucinationPenalty: number;
    latencyMs: number;
    failures: string[];
  }>,
): RunSummary {
  const n = results.length;
  if (n === 0) {
    return {
      runId, name, scenarioCount: 0, avgOverallScore: 0,
      avgPropertyResolution: 0, avgSentimentAccuracy: 0, avgVariableExtraction: 0,
      avgIntention: 0, avgWantsMore: 0, avgHallucination: 0, avgLatencyMs: 0,
      byCategory: [], byPersona: [], topFailures: [],
    };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const categoryMap = new Map<string, typeof results>();
  const personaMap = new Map<string, typeof results>();
  const failureCounts = new Map<string, number>();

  for (const r of results) {
    if (!categoryMap.has(r.category)) categoryMap.set(r.category, []);
    categoryMap.get(r.category)!.push(r);

    if (!personaMap.has(r.personaId)) personaMap.set(r.personaId, []);
    personaMap.get(r.personaId)!.push(r);

    for (const f of r.failures) {
      failureCounts.set(f, (failureCounts.get(f) ?? 0) + 1);
    }
  }

  const byCategory: CategorySummary[] = [...categoryMap.entries()].map(([cat, items]) => ({
    category: cat as EvalScenarioCategory,
    count: items.length,
    avgScore: avg(items.map((i) => i.overallScore)),
    avgPropertyResolution: avg(items.map((i) => i.propertyResolutionScore)),
    avgSentimentAccuracy: avg(items.map((i) => i.sentimentAccuracyScore)),
    avgVariableExtraction: avg(items.map((i) => i.variableExtractionScore)),
  }));

  const personas = ALL_PERSONAS;
  const byPersona: PersonaSummary[] = [...personaMap.entries()].map(([pid, items]) => ({
    personaId: pid,
    personaName: personas.find((p) => p.id === pid)?.name ?? pid,
    count: items.length,
    avgScore: avg(items.map((i) => i.overallScore)),
  }));

  const topFailures = [...failureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([failure, count]) => ({ failure, count }));

  return {
    runId,
    name,
    scenarioCount: n,
    avgOverallScore: avg(results.map((r) => r.overallScore)),
    avgPropertyResolution: avg(results.map((r) => r.propertyResolutionScore)),
    avgSentimentAccuracy: avg(results.map((r) => r.sentimentAccuracyScore)),
    avgVariableExtraction: avg(results.map((r) => r.variableExtractionScore)),
    avgIntention: avg(results.map((r) => r.intentionScore)),
    avgWantsMore: avg(results.map((r) => r.wantsMoreScore)),
    avgHallucination: avg(results.map((r) => r.hallucinationPenalty)),
    avgLatencyMs: avg(results.map((r) => r.latencyMs)),
    byCategory,
    byPersona,
    topFailures,
  };
}

export async function runEvaluation(
  options: RunEvaluationOptions,
): Promise<{ runId: string; summary: RunSummary }> {
  let scenarios = options.scenarios ?? ALL_SCENARIOS;
  if (options.limit && options.limit > 0) {
    scenarios = scenarios.slice(0, options.limit);
  }

  const concurrency = options.concurrency ?? 3;

  const run = await prisma.evalRun.create({
    data: {
      name: options.name,
      agentVersion: "nlu-contextual-v1",
      model: "gpt-5.4-mini",
      temperature: 0,
      scenarioCount: scenarios.length,
      status: "running",
    },
  });

  console.log(`\n=== Eval Run: ${options.name} (${run.id}) ===`);
  console.log(`Escenarios: ${scenarios.length} | Concurrencia: ${concurrency}\n`);

  const queue = [...scenarios];
  const errors: Array<{ scenarioId: string; error: string }> = [];

  async function worker() {
    while (queue.length > 0) {
      const scenario = queue.shift();
      if (!scenario) break;
      try {
        await processScenario(run.id, scenario);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [${scenario.id}] ERROR: ${msg}`);
        errors.push({ scenarioId: scenario.id, error: msg });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const results = await prisma.evalResult.findMany({
    where: { runId: run.id },
    select: {
      category: true,
      personaId: true,
      overallScore: true,
      propertyResolutionScore: true,
      sentimentAccuracyScore: true,
      variableExtractionScore: true,
      intentionScore: true,
      wantsMoreScore: true,
      hallucinationPenalty: true,
      latencyMs: true,
      failures: true,
    },
  });

  const summary = buildSummary(run.id, options.name, results);

  await prisma.evalRun.update({
    where: { id: run.id },
    data: {
      avgScore: summary.avgOverallScore,
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      completedAt: new Date(),
      metadata: {
        errors,
        summary: {
          avgLatencyMs: summary.avgLatencyMs,
          topFailuresCount: summary.topFailures.length,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return { runId: run.id, summary };
}
