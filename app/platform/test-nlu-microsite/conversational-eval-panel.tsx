"use client";

/**
 * Panel de evaluación batch del agente conversacional.
 *
 * Permite ejecutar la suite completa de escenarios (o un subset por categoría),
 * ver resultados por trial, scores por dimensión, y drill-down en transcripts.
 */

import { useCallback, useState } from "react";

// ── Tipos locales (espejan los del server) ──────────────────────────────────

interface GraderResult {
  name: string;
  passed: boolean;
  score: number;
  details?: string;
}

interface JudgeEvaluation {
  responseRelevanceScore: number;
  toneScore: number;
  actionabilityScore: number;
  coherenceScore: number;
  safetyScore: number;
  overallConversationalScore: number;
  reasoning: string;
  failures: string[];
}

interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface AgentOutput {
  responseText: string;
  toolResults: ToolCallResult[];
  nextPhase: string;
}

interface Trial {
  trialIndex: number;
  buyerMessage: string;
  agentOutput: AgentOutput;
  graderResults: GraderResult[];
  judgeEvaluation: JudgeEvaluation | null;
  overallScore: number;
  latencyMs: number;
  passed: boolean;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  category: string;
  trials: Trial[];
  passAtK: boolean;
  passAllK: boolean;
  avgOverallScore: number;
  avgLatencyMs: number;
}

interface CategorySummary {
  category: string;
  count: number;
  avgScore: number;
  passRate: number;
  avgLatencyMs: number;
}

interface RunSummary {
  runId: string;
  name: string;
  startedAt: string;
  completedAt: string;
  scenarioCount: number;
  trialCount: number;
  trialsPerScenario: number;
  avgOverallScore: number;
  passAtKRate: number;
  passAllKRate: number;
  avgLatencyMs: number;
  avgResponseRelevance: number;
  avgTone: number;
  avgActionability: number;
  avgCoherence: number;
  avgSafety: number;
  byCategory: CategorySummary[];
  topFailures: { failure: string; count: number }[];
  results: ScenarioResult[];
}

// ── Constantes ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  "greeting_handling",
  "rapport_response",
  "property_inquiry",
  "feedback_with_response",
  "visit_intent",
  "more_options_request",
  "escalation_needed",
  "out_of_scope",
  "multi_turn_conversation",
] as const;

// ── Utilidades ──────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.85) return "text-urus-success";
  if (score >= 0.7) return "text-urus-warning";
  return "text-urus-danger";
}

function passRateColor(rate: number): string {
  if (rate >= 0.9) return "text-urus-success";
  if (rate >= 0.7) return "text-urus-warning";
  return "text-urus-danger";
}

// ── Component ───────────────────────────────────────────────────────────────

export function ConversationalEvalPanel() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [expandedTrial, setExpandedTrial] = useState<string | null>(null);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [trialsPerScenario, setTrialsPerScenario] = useState(3);
  const [regressionOnly, setRegressionOnly] = useState(false);

  const runEval = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSummary(null);

    try {
      const body: Record<string, unknown> = {
        name: `UI Eval ${new Date().toLocaleString("es-ES")}`,
        trialsPerScenario,
        regressionOnly,
        concurrency: 2,
      };
      if (selectedCategories.length > 0) {
        body.categories = selectedCategories;
      }

      const r = await fetch("/api/eval/conversational", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? `HTTP ${r.status}`);
      }

      const data = (await r.json()) as RunSummary;
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [trialsPerScenario, regressionOnly, selectedCategories]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Config panel */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-lg font-semibold">Evaluación del Agente Conversacional</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Ejecuta la suite de escenarios conversacionales con graders deterministas + juez LLM.
          Los tools se ejecutan en modo mock (sin side-effects en BD).
        </p>

        <div className="mt-4 space-y-4">
          {/* Categories filter */}
          <div>
            <div className="text-xs text-neutral-500 mb-2">Categorías (vacío = todas)</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  disabled={running}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedCategories.includes(cat)
                      ? "bg-violet-600 text-white"
                      : "border border-neutral-700 text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {cat.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Config row */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-2 text-neutral-400">
              Trials/escenario:
              <input
                type="number"
                min={1}
                max={10}
                value={trialsPerScenario}
                onChange={(e) => setTrialsPerScenario(Number(e.target.value))}
                disabled={running}
                className="w-14 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-200"
              />
            </label>
            <label className="flex items-center gap-2 text-neutral-400">
              <input
                type="checkbox"
                checked={regressionOnly}
                onChange={(e) => setRegressionOnly(e.target.checked)}
                disabled={running}
                className="rounded border-neutral-700"
              />
              Solo regression
            </label>
            <button
              onClick={runEval}
              disabled={running}
              className="ml-auto rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? "Ejecutando..." : "Ejecutar evaluación"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-urus-danger/30 bg-urus-danger/10 px-4 py-3 text-sm text-urus-danger">
          {error}
        </div>
      ) : null}

      {/* Running indicator */}
      {running ? (
        <div className="rounded-lg border border-violet-800 bg-violet-500/10 px-4 py-3 text-sm text-violet-300 animate-pulse">
          Ejecutando evaluación... Esto puede tardar varios minutos dependiendo del número de escenarios y trials.
        </div>
      ) : null}

      {/* Results */}
      {summary ? (
        <div className="space-y-6">
          {/* Summary header */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{summary.name}</h3>
                <div className="mt-1 text-xs text-neutral-500">
                  {summary.scenarioCount} escenarios · {summary.trialCount} trials ·{" "}
                  {summary.trialsPerScenario} trials/escenario
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${scoreColor(summary.avgOverallScore)}`}>
                  {(summary.avgOverallScore * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-neutral-500">avg score</div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <MetricCard label="Pass@k" value={`${(summary.passAtKRate * 100).toFixed(0)}%`} color={passRateColor(summary.passAtKRate)} />
              <MetricCard label="Pass^k" value={`${(summary.passAllKRate * 100).toFixed(0)}%`} color={passRateColor(summary.passAllKRate)} />
              <MetricCard label="Latencia" value={`${summary.avgLatencyMs.toFixed(0)}ms`} color="text-neutral-200" />
              <MetricCard label="Relevance" value={summary.avgResponseRelevance.toFixed(2)} color={scoreColor(summary.avgResponseRelevance)} />
              <MetricCard label="Tone" value={summary.avgTone.toFixed(2)} color={scoreColor(summary.avgTone)} />
              <MetricCard label="Safety" value={summary.avgSafety.toFixed(2)} color={scoreColor(summary.avgSafety)} />
            </div>
          </div>

          {/* By category */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <h3 className="text-sm font-semibold">Resultados por categoría</h3>
            <div className="mt-3 space-y-2">
              {summary.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center gap-3 text-xs">
                  <span className="w-48 truncate text-neutral-300">{cat.category.replace(/_/g, " ")}</span>
                  <span className={`w-12 text-right font-mono ${scoreColor(cat.avgScore)}`}>
                    {(cat.avgScore * 100).toFixed(0)}%
                  </span>
                  <span className={`w-16 text-right font-mono ${passRateColor(cat.passRate)}`}>
                    pass: {(cat.passRate * 100).toFixed(0)}%
                  </span>
                  <span className="w-16 text-right font-mono text-neutral-500">
                    {cat.avgLatencyMs.toFixed(0)}ms
                  </span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-neutral-800">
                      <div
                        className="h-2 rounded-full bg-violet-600"
                        style={{ width: `${cat.passRate * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top failures */}
          {summary.topFailures.length > 0 ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
              <h3 className="text-sm font-semibold">Top fallos</h3>
              <ul className="mt-3 space-y-1 text-xs">
                {summary.topFailures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-urus-danger">
                    <span className="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px]">
                      {f.count}x
                    </span>
                    <span className="text-neutral-400">{f.failure}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Scenario list */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <h3 className="text-sm font-semibold">Escenarios ({summary.results.length})</h3>
            <div className="mt-3 space-y-2">
              {summary.results.map((r) => (
                <ScenarioRow
                  key={r.scenarioId}
                  result={r}
                  expanded={expandedScenario === r.scenarioId}
                  onToggle={() =>
                    setExpandedScenario(expandedScenario === r.scenarioId ? null : r.scenarioId)
                  }
                  expandedTrial={expandedTrial}
                  onToggleTrial={(id) => setExpandedTrial(expandedTrial === id ? null : id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}

function ScenarioRow({
  result,
  expanded,
  onToggle,
  expandedTrial,
  onToggleTrial,
}: {
  result: ScenarioResult;
  expanded: boolean;
  onToggle: () => void;
  expandedTrial: string | null;
  onToggleTrial: (id: string) => void;
}) {
  const statusIcon = result.passAtK ? "✓" : "✗";
  const statusColor = result.passAtK ? "text-urus-success" : "text-urus-danger";

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs hover:bg-neutral-800/30"
      >
        <span className={`font-bold ${statusColor}`}>{statusIcon}</span>
        <span className="flex-1 font-medium text-neutral-200">{result.scenarioName}</span>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
          {result.category.replace(/_/g, " ")}
        </span>
        <span className={`font-mono ${scoreColor(result.avgOverallScore)}`}>
          {(result.avgOverallScore * 100).toFixed(0)}%
        </span>
        <span className="text-neutral-500">{result.avgLatencyMs}ms</span>
      </button>

      {expanded ? (
        <div className="border-t border-neutral-800 p-4 space-y-3">
          {result.trials.map((trial) => {
            const trialKey = `${result.scenarioId}-${trial.trialIndex}`;
            const isTrialExpanded = expandedTrial === trialKey;
            return (
              <TrialRow
                key={trialKey}
                trial={trial}
                expanded={isTrialExpanded}
                onToggle={() => onToggleTrial(trialKey)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TrialRow({
  trial,
  expanded,
  onToggle,
}: {
  trial: Trial;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-[11px] hover:bg-neutral-800/20"
      >
        <span className={`font-bold ${trial.passed ? "text-urus-success" : "text-urus-danger"}`}>
          Trial {trial.trialIndex + 1}
        </span>
        <span className={`font-mono ${scoreColor(trial.overallScore)}`}>
          {(trial.overallScore * 100).toFixed(0)}%
        </span>
        <span className="text-neutral-500">{trial.latencyMs}ms</span>
        <span className="ml-auto text-neutral-500">
          {trial.agentOutput.toolResults.length} tool calls
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-neutral-800 p-3 space-y-3 text-[11px]">
          {/* Buyer message */}
          <div>
            <div className="text-[10px] uppercase text-neutral-500 mb-1">Mensaje comprador</div>
            <div className="rounded bg-urus-success/5 border border-urus-success/30 p-2 text-urus-success">
              {trial.buyerMessage}
            </div>
          </div>

          {/* Agent response */}
          <div>
            <div className="text-[10px] uppercase text-neutral-500 mb-1">Respuesta agente</div>
            <div className="rounded bg-neutral-800/50 border border-neutral-700 p-2 text-neutral-200">
              {trial.agentOutput.responseText}
            </div>
          </div>

          {/* Tool calls */}
          {trial.agentOutput.toolResults.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase text-neutral-500 mb-1">Tool calls</div>
              <div className="space-y-1">
                {trial.agentOutput.toolResults.map((tc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="rounded bg-violet-500/10 border border-violet-800 px-2 py-0.5 text-violet-300">
                      {tc.toolName}
                    </span>
                    <span className="text-neutral-500 truncate max-w-[300px]">
                      {JSON.stringify(tc.args)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Graders */}
          <div>
            <div className="text-[10px] uppercase text-neutral-500 mb-1">Graders deterministas</div>
            <div className="flex flex-wrap gap-1">
              {trial.graderResults.map((g) => (
                <span
                  key={g.name}
                  className={`rounded border px-2 py-0.5 text-[10px] ${
                    g.passed
                      ? "border-urus-success/30 bg-urus-success/10 text-urus-success"
                      : "border-urus-danger/30 bg-urus-danger/10 text-urus-danger"
                  }`}
                  title={g.details ?? ""}
                >
                  {g.name.replace("Grader", "")} {g.score.toFixed(2)}
                </span>
              ))}
            </div>
          </div>

          {/* Judge */}
          {trial.judgeEvaluation ? (
            <div>
              <div className="text-[10px] uppercase text-neutral-500 mb-1">Judge LLM</div>
              <div className="flex flex-wrap gap-2">
                <JudgeDim label="Relevance" score={trial.judgeEvaluation.responseRelevanceScore} />
                <JudgeDim label="Tone" score={trial.judgeEvaluation.toneScore} />
                <JudgeDim label="Actionability" score={trial.judgeEvaluation.actionabilityScore} />
                <JudgeDim label="Coherence" score={trial.judgeEvaluation.coherenceScore} />
                <JudgeDim label="Safety" score={trial.judgeEvaluation.safetyScore} />
              </div>
              {trial.judgeEvaluation.failures.length > 0 ? (
                <ul className="mt-2 ml-4 list-disc text-urus-danger/80">
                  {trial.judgeEvaluation.failures.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : null}
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] text-neutral-500 hover:text-neutral-300">
                  Razonamiento del juez
                </summary>
                <p className="mt-1 text-neutral-400">{trial.judgeEvaluation.reasoning}</p>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function JudgeDim({ label, score }: { label: string; score: number }) {
  return (
    <span className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-[10px] font-mono">
      <span className="text-neutral-400">{label}:</span>{" "}
      <span className={scoreColor(score)}>{score.toFixed(2)}</span>
    </span>
  );
}
