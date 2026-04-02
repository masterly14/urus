"use client";

import { useState } from "react";

type ResultRow = {
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

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 0.85 ? "text-emerald-400" : score >= 0.7 ? "text-amber-400" : "text-rose-400";
  return <span className={`font-mono text-xs ${color}`}>{score.toFixed(2)}</span>;
}

export function EvalResultsTable({ results }: { results: ResultRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-neutral-500">
              <th className="px-3 py-2">Escenario</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Mensaje</th>
              <th className="px-3 py-2 text-right">Overall</th>
              <th className="px-3 py-2 text-right">Props</th>
              <th className="px-3 py-2 text-right">Sent.</th>
              <th className="px-3 py-2 text-right">Vars</th>
              <th className="px-3 py-2 text-right">ms</th>
              <th className="px-3 py-2 text-right">Fallos</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <>
                <tr
                  key={r.id}
                  className="border-b border-neutral-800/50 hover:bg-neutral-800/30 cursor-pointer"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="px-3 py-2 font-medium text-neutral-200">{r.scenarioName}</td>
                  <td className="px-3 py-2 text-neutral-400">{r.category}</td>
                  <td className="px-3 py-2 text-neutral-400">{r.personaId}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-neutral-400" title={r.buyerMessage}>
                    {r.buyerMessage}
                  </td>
                  <td className="px-3 py-2 text-right"><ScoreBadge score={r.overallScore} /></td>
                  <td className="px-3 py-2 text-right"><ScoreBadge score={r.propertyResolutionScore} /></td>
                  <td className="px-3 py-2 text-right"><ScoreBadge score={r.sentimentAccuracyScore} /></td>
                  <td className="px-3 py-2 text-right"><ScoreBadge score={r.variableExtractionScore} /></td>
                  <td className="px-3 py-2 text-right text-neutral-400">{r.latencyMs}</td>
                  <td className="px-3 py-2 text-right">
                    {r.failures.length > 0 ? (
                      <span className="text-rose-400">{r.failures.length}</span>
                    ) : (
                      <span className="text-emerald-500">0</span>
                    )}
                  </td>
                </tr>
                {expanded === r.id ? (
                  <tr key={`${r.id}-detail`} className="border-b border-neutral-800/50 bg-neutral-900/60">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-neutral-500">Mensaje completo: </span>
                          <span className="text-neutral-200">{r.buyerMessage}</span>
                        </div>
                        {r.judgeReasoning ? (
                          <div>
                            <span className="text-neutral-500">Juez: </span>
                            <span className="text-neutral-300">{r.judgeReasoning}</span>
                          </div>
                        ) : null}
                        {r.failures.length > 0 ? (
                          <div>
                            <span className="text-neutral-500">Fallos: </span>
                            <ul className="mt-1 list-disc pl-4 text-rose-300">
                              {r.failures.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
