"use client";

type EvalKpiCardProps = {
  label: string;
  value: number;
  format?: "percent" | "score" | "ms";
  delta?: number;
  invertDelta?: boolean;
};

export function EvalKpiCard({ label, value, format = "score", delta, invertDelta }: EvalKpiCardProps) {
  let formatted: string;
  if (format === "percent") formatted = `${(value * 100).toFixed(1)}%`;
  else if (format === "ms") formatted = `${Math.round(value)}ms`;
  else formatted = value.toFixed(3);

  const showDelta = delta !== undefined && delta !== 0;
  const isPositive = invertDelta ? delta! < 0 : delta! > 0;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{formatted}</div>
      {showDelta ? (
        <div className={`mt-1 text-xs font-medium ${isPositive ? "text-urus-success" : "text-urus-danger"}`}>
          {delta! > 0 ? "+" : ""}{format === "percent" ? `${(delta! * 100).toFixed(1)}pp` : format === "ms" ? `${Math.round(delta!)}ms` : delta!.toFixed(3)}
        </div>
      ) : null}
    </div>
  );
}
