/**
 * CLI para ejecutar la suite de evaluación del agente conversacional.
 *
 * USO:
 *   npx tsx scripts/run-conversational-eval.ts
 *   npx tsx scripts/run-conversational-eval.ts --name "pre-deploy"
 *   npx tsx scripts/run-conversational-eval.ts --name "test" --category greeting_handling
 *   npx tsx scripts/run-conversational-eval.ts --name "regression" --regression
 *   npx tsx scripts/run-conversational-eval.ts --name "quick" --trials 1
 *   npx tsx scripts/run-conversational-eval.ts --name "test" --concurrency 3
 *
 * El flag --regression ejecuta solo escenarios de regression y falla (exit 1)
 * si el pass@k rate cae debajo del umbral (default 95%).
 */

import "dotenv/config";
import { runConversationalEval } from "../lib/eval/conversational-orchestrator";
import type { ConversationalEvalCategory } from "../lib/eval/conversational-types";

function parseArgs(): {
  name: string;
  category?: string;
  regression: boolean;
  trials: number;
  concurrency: number;
  threshold: number;
} {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  let regression = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--regression") {
      regression = true;
      continue;
    }
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value && !value.startsWith("--")) {
      result[key] = value;
      i++;
    }
  }

  const defaultName = `conversational-eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  return {
    name: result.name ?? defaultName,
    category: result.category,
    regression,
    trials: result.trials ? parseInt(result.trials, 10) : 3,
    concurrency: result.concurrency ? parseInt(result.concurrency, 10) : 2,
    threshold: result.threshold ? parseFloat(result.threshold) : 0.95,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[eval:conversational] Falta OPENAI_API_KEY");
    process.exit(1);
  }

  const opts = parseArgs();
  const startTime = Date.now();

  const categories = opts.category
    ? [opts.category as ConversationalEvalCategory]
    : undefined;

  const summary = await runConversationalEval({
    name: opts.name,
    config: {
      trialsPerScenario: opts.trials,
      passThreshold: 0.7,
      maxLatencyMs: 15_000,
      regressionOnly: opts.regression,
      categories,
    },
    concurrency: opts.concurrency,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log(`RESUMEN — ${opts.name}`);
  console.log("=".repeat(60));
  console.log(`Run ID:         ${summary.runId}`);
  console.log(`Escenarios:     ${summary.scenarioCount}`);
  console.log(`Trials totales: ${summary.trialCount}`);
  console.log(`Tiempo total:   ${elapsed}s`);
  console.log(`Avg Latency:    ${Math.round(summary.avgLatencyMs)}ms`);
  console.log("");
  console.log(`Overall Score:  ${(summary.avgOverallScore * 100).toFixed(1)}%`);
  console.log(`Pass@k Rate:    ${(summary.passAtKRate * 100).toFixed(1)}%`);
  console.log(`Pass^k Rate:    ${(summary.passAllKRate * 100).toFixed(1)}%`);
  console.log("");
  console.log(`  Relevance:    ${(summary.avgResponseRelevance * 100).toFixed(1)}%`);
  console.log(`  Tone:         ${(summary.avgTone * 100).toFixed(1)}%`);
  console.log(`  Actionability:${(summary.avgActionability * 100).toFixed(1)}%`);
  console.log(`  Coherence:    ${(summary.avgCoherence * 100).toFixed(1)}%`);
  console.log(`  Safety:       ${(summary.avgSafety * 100).toFixed(1)}%`);

  if (summary.byCategory.length > 0) {
    console.log("\nPor categoría:");
    for (const cat of summary.byCategory) {
      const passStr = `${(cat.passRate * 100).toFixed(0)}%`.padStart(4);
      console.log(
        `  ${cat.category.padEnd(30)} score=${(cat.avgScore * 100).toFixed(0)}% pass=${passStr} (n=${cat.count})`,
      );
    }
  }

  if (summary.topFailures.length > 0) {
    console.log("\nTop fallos:");
    for (const f of summary.topFailures.slice(0, 5)) {
      console.log(`  ${f.count}x  ${f.failure.slice(0, 80)}`);
    }
  }

  console.log("=".repeat(60));

  if (opts.regression) {
    const passRate = summary.passAtKRate;
    if (passRate < opts.threshold) {
      console.error(
        `\n[FAIL] Regression pass@k rate ${(passRate * 100).toFixed(1)}% está por debajo del umbral ${(opts.threshold * 100).toFixed(0)}%`,
      );
      process.exit(1);
    } else {
      console.log(
        `\n[PASS] Regression pass@k rate ${(passRate * 100).toFixed(1)}% >= umbral ${(opts.threshold * 100).toFixed(0)}%`,
      );
    }
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
