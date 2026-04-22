"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EvalKpiCard } from "@/components/eval/eval-kpi-card";
import { EvalCategoryChart } from "@/components/eval/eval-category-chart";
import { EvalResultsTable } from "@/components/eval/eval-results-table";

type RunDetail = {
  run: {
    id: string;
    name: string;
    agentVersion: string;
    model: string;
    scenarioCount: number;
    avgScore: number | null;
    status: string;
    startedAt: string;
    completedAt: string | null;
  };
  aggregated: {
    avgOverallScore: number;
    avgPropertyResolution: number;
    avgSentimentAccuracy: number;
    avgVariableExtraction: number;
    avgIntention: number;
    avgWantsMore: number;
    avgHallucination: number;
    avgLatencyMs: number;
  };
  byCategory: Array<{
    category: string;
    count: number;
    avgScore: number;
    avgPropertyResolution: number;
    avgSentimentAccuracy: number;
    avgVariableExtraction: number;
  }>;
  byPersona: Array<{ personaId: string; count: number; avgScore: number }>;
  topFailures: Array<{ failure: string; count: number }>;
  resultCount: number;
};

type ResultItem = {
  id: string;
  scenarioId: string;
  scenarioName: string;
  category: string;
  personaId: string;
  buyerMessage: string;
  overallScore: number;
  propertyResolutionScore: number;
  sentimentAccuracyScore: number;
  variableExtractionScore: number;
  failures: string[];
  latencyMs: number;
  judgeReasoning: string | null;
};

export default function EvalRunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/eval/runs/${runId}`).then((r) => r.json()),
      fetch(`/api/eval/runs/${runId}/results?limit=100`).then((r) => r.json()),
    ]).then(([d, r]) => {
      setDetail(d);
      setResults(r.results ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Cargando...
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Run no encontrado
      </main>
    );
  }

  const { run, aggregated, byCategory, byPersona, topFailures } = detail;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Link href="/platform/eval" className="text-xs text-neutral-500 hover:text-neutral-300">
            &larr; Todas las evaluaciones
          </Link>
          <h1 className="mt-2 text-xl font-bold">{run.name}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-500">
            <span>{run.model} · {run.agentVersion}</span>
            <span>{run.scenarioCount} escenarios</span>
            <span>{run.status}</span>
            <span>{new Date(run.startedAt).toLocaleString("es-ES")}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <EvalKpiCard label="Overall Score" value={aggregated.avgOverallScore} />
          <EvalKpiCard label="Property Resolution" value={aggregated.avgPropertyResolution} format="percent" />
          <EvalKpiCard label="Sentiment Accuracy" value={aggregated.avgSentimentAccuracy} format="percent" />
          <EvalKpiCard label="Variable Extraction" value={aggregated.avgVariableExtraction} format="percent" />
          <EvalKpiCard label="Intention Accuracy" value={aggregated.avgIntention} format="percent" />
          <EvalKpiCard label="Wants More Detection" value={aggregated.avgWantsMore} format="percent" />
          <EvalKpiCard label="Hallucination Rate" value={aggregated.avgHallucination} format="percent" invertDelta />
          <EvalKpiCard label="Avg Latency" value={aggregated.avgLatencyMs} format="ms" invertDelta />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EvalCategoryChart data={byCategory} />

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <h3 className="mb-4 text-sm font-semibold text-neutral-300">Score por persona</h3>
            <div className="space-y-2">
              {byPersona.map((p) => (
                <div key={p.personaId} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400">{p.personaId} <span className="text-neutral-600">({p.count})</span></span>
                  <span className={`font-mono font-medium ${p.avgScore >= 0.85 ? "text-urus-success" : p.avgScore >= 0.7 ? "text-urus-warning" : "text-urus-danger"}`}>
                    {p.avgScore.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {topFailures.length > 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Top fallos recurrentes</h3>
            <div className="space-y-1.5">
              {topFailures.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="rounded bg-urus-danger/20 px-1.5 py-0.5 font-mono text-urus-danger">{f.count}x</span>
                  <span className="text-neutral-400">{f.failure}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="mb-4 text-sm font-semibold text-neutral-300">
            Resultados individuales ({results.length})
          </h3>
          <EvalResultsTable results={results} />
        </div>
      </div>
    </main>
  );
}
