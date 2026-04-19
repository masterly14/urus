"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type CategoryData = {
  category: string;
  count: number;
  avgScore: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  property_resolution: "Resolución",
  sentiment_accuracy: "Sentimiento",
  variable_extraction: "Variables",
  wants_more_detection: "Más opciones",
  multi_turn: "Multi-turno",
  ambiguity_handling: "Ambigüedad",
};

function scoreColor(score: number): string {
  if (score >= 0.85) return "#34d399";
  if (score >= 0.7) return "#fbbf24";
  return "#f87171";
}

export function EvalCategoryChart({ data }: { data: CategoryData[] }) {
  const chartData = data.map((d) => ({
    name: CATEGORY_LABELS[d.category] ?? d.category,
    score: Math.round(d.avgScore * 100) / 100,
    count: d.count,
  }));

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <h3 className="mb-4 text-sm font-semibold text-neutral-300">Score por categoría</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
          <XAxis type="number" domain={[0, 1]} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: "#d4d4d4", fontSize: 12 }} width={80} />
          <Tooltip
            contentStyle={{ backgroundColor: "#171717", border: "1px solid #404040", borderRadius: 8 }}
            labelStyle={{ color: "#e5e5e5" }}
            formatter={(v) => [
              typeof v === "number" ? v.toFixed(3) : String(v ?? ""),
              "Score",
            ]}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={scoreColor(entry.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
