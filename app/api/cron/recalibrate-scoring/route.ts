import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { runRecalibration } from "@/lib/scoring/recalibration";

/**
 * Cron semanal de recalibración del scoring.
 * Calcula nuevos pesos óptimos a partir de datos históricos de cierre
 * y los activa solo si mejoran el backtest al menos un 2%.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRecalibration();

    console.log(
      `[cron/recalibrate-scoring] v${result.version} ` +
      `accuracy=${(result.accuracy * 100).toFixed(1)}% ` +
      `brier=${result.backtestScore.toFixed(4)} ` +
      `improved=${result.improved} activated=${result.activated}`,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/recalibrate-scoring] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
