"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RunListItem = {
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

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-neutral-500">--</span>;
  const color = score >= 0.85 ? "text-emerald-400" : score >= 0.7 ? "text-amber-400" : "text-rose-400";
  return <span className={`font-mono font-bold ${color}`}>{score.toFixed(3)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "text-blue-400 border-blue-800 bg-blue-500/10",
    completed: "text-emerald-400 border-emerald-800 bg-emerald-500/10",
    completed_with_errors: "text-amber-400 border-amber-800 bg-amber-500/10",
    failed: "text-rose-400 border-rose-800 bg-rose-500/10",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status] ?? "text-neutral-400 border-neutral-700"}`}>
      {status}
    </span>
  );
}

export default function EvalDashboardPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/eval/runs?limit=50")
      .then((r) => r.json())
      .then((data) => { setRuns(data.runs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="text-sm text-neutral-400">Urus Capital — Eval Suite</div>
          <h1 className="mt-1 text-2xl font-bold">Evaluaciones NLU</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Suite AI-to-AI: agente comprador sintetico + agente juez (gpt-4o)
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <div className="text-sm text-neutral-500">Cargando...</div>
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 text-center">
            <div className="text-lg font-medium">Sin evaluaciones</div>
            <p className="mt-2 text-sm text-neutral-400">
              Ejecuta <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">npx tsx scripts/run-nlu-eval.ts --name &quot;mi-eval&quot;</code> para crear la primera.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Modelo</th>
                  <th className="px-4 py-3 text-right">Escenarios</th>
                  <th className="px-4 py-3 text-right">Avg Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                    <td className="px-4 py-3">
                      <Link href={`/eval/${run.id}`} className="font-medium text-neutral-100 hover:text-white underline-offset-2 hover:underline">
                        {run.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{run.model}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{run.scenarioCount}</td>
                    <td className="px-4 py-3 text-right"><ScoreBadge score={run.avgScore} /></td>
                    <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {new Date(run.startedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
