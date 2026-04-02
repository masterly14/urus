/**
 * CLI para ejecutar la suite de evaluacion AI-to-AI del NLU.
 *
 * USO:
 *   npx tsx scripts/run-nlu-eval.ts --name "pre-deploy-v2.1"
 *   npx tsx scripts/run-nlu-eval.ts --name "test" --category property_resolution
 *   npx tsx scripts/run-nlu-eval.ts --name "test" --persona coloquial
 *   npx tsx scripts/run-nlu-eval.ts --name "quick" --limit 5
 *   npx tsx scripts/run-nlu-eval.ts --name "test" --concurrency 5
 */

import "dotenv/config";
import { runEvaluation } from "../lib/eval/orchestrator";
import { ALL_SCENARIOS, filterByCategory, filterByPersona } from "../lib/eval/scenarios";
import type { EvalScenarioCategory } from "../lib/eval/types";

function parseArgs(): {
  name: string;
  category?: string;
  persona?: string;
  limit?: number;
  concurrency?: number;
} {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value) result[key] = value;
  }

  if (!result.name) {
    console.error("Uso: npx tsx scripts/run-nlu-eval.ts --name <nombre> [--category <cat>] [--persona <id>] [--limit <n>] [--concurrency <n>]");
    process.exit(1);
  }

  return {
    name: result.name,
    category: result.category,
    persona: result.persona,
    limit: result.limit ? parseInt(result.limit, 10) : undefined,
    concurrency: result.concurrency ? parseInt(result.concurrency, 10) : undefined,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[eval] Falta OPENAI_API_KEY");
    process.exit(1);
  }

  const opts = parseArgs();

  let scenarios = ALL_SCENARIOS;

  if (opts.category) {
    scenarios = filterByCategory(opts.category as EvalScenarioCategory);
    if (scenarios.length === 0) {
      console.error(`[eval] No hay escenarios para categoria: ${opts.category}`);
      process.exit(1);
    }
    console.log(`Filtrando por categoria: ${opts.category} (${scenarios.length} escenarios)`);
  }

  if (opts.persona) {
    scenarios = filterByPersona(opts.persona);
    if (scenarios.length === 0) {
      console.error(`[eval] No hay escenarios para persona: ${opts.persona}`);
      process.exit(1);
    }
    console.log(`Filtrando por persona: ${opts.persona} (${scenarios.length} escenarios)`);
  }

  const startTime = Date.now();

  const { runId, summary } = await runEvaluation({
    name: opts.name,
    scenarios,
    limit: opts.limit,
    concurrency: opts.concurrency,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log(`RESUMEN — ${opts.name}`);
  console.log("=".repeat(60));
  console.log(`Run ID:        ${runId}`);
  console.log(`Escenarios:    ${summary.scenarioCount}`);
  console.log(`Tiempo total:  ${elapsed}s`);
  console.log(`Avg Latency:   ${Math.round(summary.avgLatencyMs)}ms`);
  console.log("");
  console.log(`Overall Score:      ${summary.avgOverallScore.toFixed(3)}`);
  console.log(`Property Resolution: ${(summary.avgPropertyResolution * 100).toFixed(1)}%`);
  console.log(`Sentiment Accuracy:  ${(summary.avgSentimentAccuracy * 100).toFixed(1)}%`);
  console.log(`Variable Extraction: ${(summary.avgVariableExtraction * 100).toFixed(1)}%`);
  console.log(`Intention Accuracy:  ${(summary.avgIntention * 100).toFixed(1)}%`);
  console.log(`Wants More:          ${(summary.avgWantsMore * 100).toFixed(1)}%`);
  console.log(`Hallucination Rate:  ${(summary.avgHallucination * 100).toFixed(1)}%`);

  if (summary.byCategory.length > 0) {
    console.log("\nPor categoria:");
    for (const cat of summary.byCategory) {
      console.log(`  ${cat.category.padEnd(25)} ${cat.avgScore.toFixed(3)} (n=${cat.count})`);
    }
  }

  if (summary.byPersona.length > 0) {
    console.log("\nPor persona:");
    for (const p of summary.byPersona) {
      console.log(`  ${p.personaName.padEnd(25)} ${p.avgScore.toFixed(3)} (n=${p.count})`);
    }
  }

  if (summary.topFailures.length > 0) {
    console.log("\nTop fallos:");
    for (const f of summary.topFailures.slice(0, 5)) {
      console.log(`  ${f.count}x  ${f.failure.slice(0, 80)}`);
    }
  }

  console.log(`\nResultados: http://localhost:3000/eval/${runId}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
